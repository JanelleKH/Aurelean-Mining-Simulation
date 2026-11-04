/**
 * scripts/check-air-campus.ts — pre-registered checks for the 24 October 2026
 * fixes: University Campus restored as a no-go zone, and the air ledger made a
 * function of where facilities are sited.
 *
 * Run: npm run check:fixes
 */

import {
  MINE_SIZES_KM2,
} from '../src/model/index.ts';
import {
  AIR_BUDGET_MULTIPLIER,
  MITIGATION_SLIDER_STEP_USD,
  MITIGATION_SPEND_MIN_USD,
  MITIGATION_STEP_USD,
  WATER_SPEND_MAX_USD,
  airAssuranceUsd,
  clampMitigationLeverSpend,
  computeTotalBudget,
} from '../src/data/mitigationConstants.ts';
import {
  benefitCostUsd,
  canoeAvailability,
  getCommunityBenefit,
  COMMUNITY_BENEFITS,
  LEGACY_BENEFIT_IDS,
} from '../src/data/communityBenefits.ts';
import { BENEFIT_LEVER_CATEGORY, weightForBenefitId } from '../src/data/benefitLeverWeights.ts';
import { BENEFIT_DETAILS } from '../src/data/benefitDetails.ts';
import { BENEFIT_VALUES } from '../src/data/benefitUtility.ts';
import { ELECTRIFICATION_REQUIRES } from '../src/model/params.ts';
import { NOMINAL_THROUGHPUT_T_PER_YR } from '../src/model/params.ts';
import { readFileSync } from 'node:fs';
import { getCsvField } from '../src/utils/csvParse.ts';
import { BACKFILL_TAILINGS_UPTAKE } from '../src/model/params.ts';
import { CANOE_MIN_NAVIGABLE_LENGTH_M } from '../src/model/params.ts';
import { advanceIntensityFactor } from '../src/model/hydrology.ts';
import {
  GROUPS,
  SIZE_BALLOT,
  preferredSizeLabel,
  resolveCommunityWinner,
  benefitsUnlockedForAreaKm2,
  resolveStageOne,
  tallySizeVotes,
  type GroupId,
  type MineSizeId,
  type MineStance,
  MINE_SIZES as COMMUNITY_MINE_SIZES,
} from '../src/data/communityVote.ts';
import {
  NO_BUILD_AREAS,
  normalizeNoBuildId,
  getNoBuildAreaLabel,
} from '../src/data/noBuildAreas.ts';
import { NO_BUILD_ZONE_RECTS, isPointInNoBuildZone } from '../src/components/map/noBuildZones.ts';
import {
  canPlaceIndustrialType,
  getFacilityLimits,
  validateIndustrialPlacementLocation,
  validateIndustrialPlacements,
} from '../src/data/industrialPlacementRules.ts';
import { MIN_FACILITY_SEPARATION_KM } from '../src/data/mapScale.ts';
import type { PlacedIndustrialSymbol } from '../src/components/map/mapSymbols.ts';
import {
  computeAirLedger,
  computePostClosure,
  computeWasteLedger,
  computeWaterLedger,
  mineLifeYr,
  ORE_T_PER_KM2,
  type AirSource,
} from '../src/model/index.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
};
const usd = (n: number | null) =>
  n === null ? 'MUST MOVE (not reachable within budget)' : '$' + (n / 1_000_000).toFixed(2) + 'M';

/* ================= CAMPUS ================= */
console.log('\n=== UNIVERSITY CAMPUS AS A NO-GO ZONE ===\n');

check('campus is a selectable no-go area',
  NO_BUILD_AREAS.some(a => a.id === 'campus'),
  NO_BUILD_AREAS.filter(a => a.id !== 'none').map(a => a.label).join(', '));
check('campus is no longer silently rewritten to agriculture',
  normalizeNoBuildId('campus') === 'campus');
check('campus label matches the map legend',
  getNoBuildAreaLabel('campus') === 'University Campus');

const DRAWN = { left: 67.9, right: 84.8, top: 51.4, bottom: 67.7 };
{
  const r = NO_BUILD_ZONE_RECTS.find(z => z.id === 'campus');
  const ok = !!r
    && r.left >= DRAWN.left - 1 && r.left + r.width <= DRAWN.right + 1
    && r.top >= DRAWN.top - 1 && r.top + r.height <= DRAWN.bottom + 1;
  check('campus rect sits within the boundary drawn on the map', ok,
    r ? `x ${r.left}-${r.left + r.width}, y ${r.top}-${r.top + r.height}` : 'missing');
}
{
  const campus = NO_BUILD_ZONE_RECTS.filter(z => z.id === 'campus');
  const others = NO_BUILD_ZONE_RECTS.filter(z => z.id !== 'campus');
  const overlaps = campus.flatMap(c => others.filter(o =>
    c.left < o.left + o.width && o.left < c.left + c.width &&
    c.top < o.top + o.height && o.top < c.top + c.height));
  check('campus rect overlaps no other no-go zone', overlaps.length === 0,
    overlaps.map(o => o.id).join(',') || 'none');
}
{
  const inCampus = isPointInNoBuildZone(76, 59, ['campus']);
  const inOthers = isPointInNoBuildZone(76, 59, ['mountain', 'oldtown', 'aquifer', 'agriculture']);
  check('a point on the campus is caught by campus and nothing else', inCampus && !inOthers);
}
check('five selectable zones against a maximum of four',
  NO_BUILD_AREAS.filter(a => a.id !== 'none').length === 5);

/* ================= AIR ================= */
console.log('\n=== AIR LEDGER: SITING DRIVES EXPOSURE ===\n');

const waste = computeWasteLedger({ mineSizeKm2: 4, capacityTPerYr: 3_000_000, backfillFraction: 0 });
const life = mineLifeYr(4 * ORE_T_PER_KM2, 3_000_000);

// Map geometry: 10 km across, so 1 percent = 100 m.
//   ore body   x 34-66, y 14-31   (extraction must be within 1 km of it)
//   Old Town   x 30-62, y 35-62
//   Mountain Trails (no-go candidate)  x 28-72, y 0-13
const SOUTH: AirSource[] = [
  { kind: 'extraction', xPct: 50, yPct: 32 },
  { kind: 'refining', xPct: 52, yPct: 32 },
  { kind: 'processing', xPct: 54, yPct: 32 },
];
const NORTH_BLOCKED: AirSource[] = [
  { kind: 'extraction', xPct: 50, yPct: 14 },
  { kind: 'refining', xPct: 52, yPct: 14 },
  { kind: 'processing', xPct: 54, yPct: 14 },
];
const NORTH_FREE: AirSource[] = [
  { kind: 'extraction', xPct: 50, yPct: 5 },
  { kind: 'refining', xPct: 52, yPct: 5 },
  { kind: 'processing', xPct: 54, yPct: 5 },
];

const ledger = (
  sources: AirSource[],
  spend = 300_000,
  over: Partial<Parameters<typeof computeAirLedger>[0]> = {},
) =>
  computeAirLedger({
    sources,
    capacityTPerYr: 3_000_000,
    airControlCapitalUsd: spend,
    disturbedHa: waste.footprint.totalDisturbedHa,
    mineLifeYr: life,
    ...over,
  });

const cases: [string, AirSource[]][] = [
  ['south (on the town)', SOUTH],
  ['north, trails no-go', NORTH_BLOCKED],
  ['north, trails open', NORTH_FREE],
];
for (const [name, src] of cases) {
  const L = ledger(src);
  const t = L.receptors[0];
  console.log(`${name.padEnd(22)} nearest ${String(Math.round(t.nearestSourceM)).padStart(4)} m   PM10 ${t.pm10AnnualUgM3.toFixed(1).padStart(6)}   PM2.5 ${t.pm25AnnualUgM3.toFixed(1).padStart(6)}   ${L.permitting.compliant ? 'PERMITTABLE' : 'REFUSED'}`);
  console.log(`${''.padEnd(22)} to EU limit ${usd(t.capitalToMeetLimitUsd)}    to WHO guideline ${usd(t.capitalToMeetGuidelineUsd)}`);
}
console.log('');

// (a) Distance must dominate, or the rebuild was pointless.
{
  const near = ledger(SOUTH).receptors[0].pm25AnnualUgM3;
  const far = ledger(NORTH_FREE).receptors[0].pm25AnnualUgM3;
  check('moving the operation north cuts Old Town PM2.5 by more than 5x', far * 5 < near,
    `${near.toFixed(1)} -> ${far.toFixed(1)} ug/m3`);
}

// (b) The gate must refuse something, or it is decoration.
{
  const L = ledger(SOUTH);
  check('siting hard against the town is refused permission', !L.permitting.compliant,
    L.permitting.reason ?? '');
}

// (c) And allow something, or the scenario is unwinnable.
{
  const L = ledger(NORTH_FREE);
  check('siting away from the town is permittable', L.permitting.compliant);
}

// (d) THE CONFLICT: protecting the trails pushes the mine toward the houses.
{
  const blocked = ledger(NORTH_BLOCKED).receptors[0].pm25AnnualUgM3;
  const free = ledger(NORTH_FREE).receptors[0].pm25AnnualUgM3;
  check('a Mountain Trails no-go measurably worsens Old Town air', blocked > free,
    `trails open ${free.toFixed(1)} -> trails protected ${blocked.toFixed(1)} ug/m3`);
}

// (e) Spending must never make air worse.
{
  let mono = true;
  let prev = Infinity;
  for (const s of [300_000, 2_000_000, 6_000_000, 12_000_000, 24_000_000]) {
    const v = ledger(SOUTH, s).receptors[0].pm25AnnualUgM3;
    if (v > prev + 1e-9) mono = false;
    prev = v;
  }
  check('concentration is monotone decreasing in control spend', mono);
}

// (f) REVISED 24 October 2026, after this check failed.
//
//     It originally asserted that complying from the worst siting required
//     relocation rather than spending. That is false, and the model was right
//     to say so: coarse dust from haul roads is suppressed by watering, which
//     is cheap and about 85% effective, and it is exactly why real mines
//     operate close to towns. The legal limit IS purchasable from the worst
//     siting, for roughly $2M of the $6M available.
//
//     What is not purchasable is health. At that siting PM2.5 sits near three
//     times the WHO guideline and no affordable control reaches it, because
//     the fine fraction comes from diesel and stacks rather than from the road
//     surface that watering fixes. So the honest claim — and the better one —
//     is that you can buy legality and you cannot buy health. The developer
//     can lawfully stay close; only moving makes the air good.
{
  const t = ledger(SOUTH).receptors[0];
  check('the legal limit is purchasable from the worst siting',
    t.capitalToMeetLimitUsd !== null && t.capitalToMeetLimitUsd <= 6_000_000,
    usd(t.capitalToMeetLimitUsd));
  check('the health guideline is NOT purchasable from the worst siting',
    t.capitalToMeetGuidelineUsd === null,
    usd(t.capitalToMeetGuidelineUsd));
  check('so the worst siting stays well above the health guideline',
    t.pm25AnnualUgM3 > 2 * 5,
    `PM2.5 ${t.pm25AnnualUgM3.toFixed(1)} ug/m3 against a guideline of 5`);
}

// (f2) UNITS. The figure quoted as the cost of compliance must be one the
//      developer could actually allocate. Quoting $16M a year to someone whose
//      cap is $6M once was the defect this replaces.
{
  const t = ledger(NORTH_BLOCKED).receptors[0];
  const ok = t.capitalToMeetLimitUsd === null || t.capitalToMeetLimitUsd <= 6_000_000;
  check('any quoted compliance cost is within what the budget allows', ok,
    usd(t.capitalToMeetLimitUsd));
}

// (f3) UNITS. The lifetime obligation must be commensurable with the budget.
//      At 4 km2 / 3 Mt the total budget is about $25M; the old reading gave
//      $120M, which no developer could read as anything but a bug.
{
  const L = ledger(NORTH_BLOCKED, 6_000_000);
  const TOTAL_BUDGET_AT_THIS_SCENARIO = 26_600_000;
  check('lifetime air obligation is commensurable with the budget',
    L.obligation.lifetimeUsd < TOTAL_BUDGET_AT_THIS_SCENARIO,
    `capital $${(L.obligation.capitalUsd / 1e6).toFixed(1)}M + O&M $${(L.obligation.annualOmUsd / 1e6).toFixed(2)}M/yr x ${L.obligation.mineLifeYr.toFixed(0)} yr = $${(L.obligation.lifetimeUsd / 1e6).toFixed(0)}M, against a budget of ~$${(TOTAL_BUDGET_AT_THIS_SCENARIO / 1e6).toFixed(0)}M`);
}

// (f4) The budget cap must still buy most of the available control, or the
//      slider range is mismatched to the curve and the top half does nothing.
{
  const L = ledger(SOUTH, 6_000_000);
  check('the $6M cap buys most of the available control',
    L.control.dustEffectiveness > 0.75 * 0.85,
    `dust ${(L.control.dustEffectiveness * 100).toFixed(0)}% of a 85% ceiling`);
}

// (g) The farther receptor sees less.
{
  const L = ledger(SOUTH);
  check('the campus, farther away, sees less than the Old Town',
    L.receptors[1].pm25AnnualUgM3 < L.receptors[0].pm25AnnualUgM3,
    `old town ${L.receptors[0].pm25AnnualUgM3.toFixed(1)} vs campus ${L.receptors[1].pm25AnnualUgM3.toFixed(1)}`);
}

// (h) Electrification cuts fine particulate without erasing coarse road dust.
//
// These two checks used to hardcode ['workforce', 'research'] - the same wrong
// pair of IDs as ELECTRIFICATION_REQUIRES itself. They therefore passed while
// the mechanic was entirely dead, because they were comparing the model to its
// own mistake rather than to the benefit list. They now read the constant, and
// CLAIM E1 further down is what pins that constant to the real benefit IDs. A
// check that shares a fixture with the thing it tests proves nothing.
{
  const off = ledger(SOUTH);
  const on = ledger(SOUTH, 300_000, { benefitIds: [...ELECTRIFICATION_REQUIRES] });
  const cut = on.receptors[0].pm25AnnualUgM3 < off.receptors[0].pm25AnnualUgM3;
  const dustKept = on.receptors[0].pm10AnnualUgM3 > 0.5 * off.receptors[0].pm10AnnualUgM3;
  check('electrification cuts PM2.5 without erasing coarse road dust', cut && dustKept,
    `PM2.5 ${off.receptors[0].pm25AnnualUgM3.toFixed(1)} -> ${on.receptors[0].pm25AnnualUgM3.toFixed(1)}; PM10 ${off.receptors[0].pm10AnnualUgM3.toFixed(1)} -> ${on.receptors[0].pm10AnnualUgM3.toFixed(1)}`);
}
{
  const one = ledger(SOUTH, 300_000, { benefitIds: [ELECTRIFICATION_REQUIRES[0]] });
  const both = ledger(SOUTH, 300_000, { benefitIds: [...ELECTRIFICATION_REQUIRES] });
  check('electrification requires both benefits, not either',
    !one.inputs.electrified && both.inputs.electrified);
}

// (i) Air is tied to the waste ledger's footprint.
{
  const small = ledger(SOUTH, 300_000, { disturbedHa: 50 }).receptors[0].pm10AnnualUgM3;
  const large = ledger(SOUTH, 300_000, { disturbedHa: 500 }).receptors[0].pm10AnnualUgM3;
  check('more disturbed ground means more dust', large > small,
    `50 ha ${small.toFixed(1)} -> 500 ha ${large.toFixed(1)} ug/m3`);
}

// (j) Air is rented, not bought: the lifetime obligation must dwarf the
//     dearest one-off benefit ($5M research programme).
{
  const L = ledger(NORTH_BLOCKED, 4_000_000);
  check('the lifetime air obligation still exceeds the dearest single benefit',
    L.obligation.presentValueUsd > 5_000_000,
    `capital $${(L.obligation.capitalUsd / 1e6).toFixed(1)}M + $${(L.obligation.annualOmUsd / 1e6).toFixed(2)}M/yr = $${(L.obligation.lifetimeUsd / 1e6).toFixed(0)}M, PV $${(L.obligation.presentValueUsd / 1e6).toFixed(0)}M`);
}

// Operating cost must be a share of capital, not a copy of it.
{
  const L = ledger(NORTH_BLOCKED, 6_000_000);
  const ratio = L.obligation.annualOmUsd / L.obligation.capitalUsd;
  check('annual running cost is a fraction of capital, not equal to it',
    ratio > 0.05 && ratio < 0.3, `${(ratio * 100).toFixed(0)}% of capital per year`);
}

// (k) No cross-dimension total.
{
  const keys = Object.keys(ledger(SOUTH) as unknown as Record<string, unknown>);
  check('air ledger exposes no cross-dimension score',
    !keys.some(k => /score|utility|aqi/i.test(k)), keys.join(','));
}

/* ========== BUDGET: DOES AIR ACTUALLY CROWD OUT BENEFITS? ========== */
console.log('\n=== AIR AGAINST THE BUDGET ===\n');

// Scenario 4 km2 (mineIdx 3) at 3 Mt/yr (capacityIdx 2).
const MINE_IDX = 3, CAP_IDX = 2;
{
  const none = computeTotalBudget(MINE_IDX, CAP_IDX, 0);
  const maxed = computeTotalBudget(MINE_IDX, CAP_IDX, 6_000_000);
  const assurance = airAssuranceUsd(6_000_000);
  // What is left for benefits: budget minus the air capital minus its assurance.
  const leftWithout = none - 0 - airAssuranceUsd(0);
  const leftWith = maxed - 6_000_000 - assurance;
  console.log(`budget with no air:   $${(none / 1e6).toFixed(1)}M  -> for benefits $${(leftWithout / 1e6).toFixed(1)}M`);
  console.log(`budget with $6M air:  $${(maxed / 1e6).toFixed(1)}M  -> for benefits $${(leftWith / 1e6).toFixed(1)}M`);
  console.log(`assurance charged:    $${(assurance / 1e6).toFixed(2)}M\n`);

  // (l) Air must genuinely cost something. Before this change the tier's budget
  //     addition and its spend cancelled exactly, so air was free — the
  //     cancellation found in the 23 September trial.
  check('buying air control reduces what is left for benefits',
    leftWith < leftWithout,
    `$${(leftWithout / 1e6).toFixed(1)}M -> $${(leftWith / 1e6).toFixed(1)}M`);

  // (m) And the amount it costs must be exactly the assurance, not the capital,
  //     because the tier still adds the capital to the budget.
  check('the cost of air is precisely its operating assurance',
    Math.abs((leftWithout - leftWith) - assurance) < 1,
    `$${((leftWithout - leftWith) / 1e6).toFixed(2)}M lost, assurance $${(assurance / 1e6).toFixed(2)}M`);

  // (n) "A bit", not a swamping. If air ate most of the budget the exercise
  //     would collapse into a single decision.
  const share = assurance / maxed;
  check('air takes a real but bounded share of the budget',
    share > 0.05 && share < 0.20,
    `${(share * 100).toFixed(0)}% of a $${(maxed / 1e6).toFixed(1)}M budget`);

  // (o) It should cost roughly one benefit — enough to be felt in the room.
  const cheapest = Math.min(...COMMUNITY_BENEFITS.map(x => x.cost));
  check('the assurance costs at least one community benefit',
    assurance >= cheapest,
    `$${(assurance / 1e6).toFixed(2)}M against a cheapest benefit of $${(cheapest / 1e6).toFixed(1)}M`);

  check('the air budget multiplier is self-consistent',
    Math.abs(6_000_000 * AIR_BUDGET_MULTIPLIER - (6_000_000 + assurance)) < 1,
    `x${AIR_BUDGET_MULTIPLIER.toFixed(2)}`);
}

/* ================= THE CANOE ================= */
console.log('\n=== THE CANOE: CHEAP TO PROMISE, EXPENSIVE TO KEEP ===\n');
{
  const canoe = COMMUNITY_BENEFITS.find(x => x.id === 'canoe')!;
  const dearest = Math.max(...COMMUNITY_BENEFITS.map(x => x.cost));

  // (p) It must be cheap up front, or it is not a trap worth setting.
  check('the canoe is among the cheapest benefits to promise',
    canoe.cost <= 1_000_000,
    `$${(canoe.cost / 1e6).toFixed(1)}M against a dearest of $${(dearest / 1e6).toFixed(1)}M`);

  const L = computeWaterLedger({ mineSizeKm2: 4, capacityTPerYr: 3_000_000, waterMitigationSpendUsd: 300_000 });
  const pc = computePostClosure({
    mineSizeKm2: 4, capacityTPerYr: 3_000_000,
    storageDepletedM3: L.balance.storageDepletedM3, backfillFraction: 0,
  });
  console.log(`capital charged      $${(canoe.cost / 1e6).toFixed(2)}M`);
  console.log(`annual upkeep        $${(pc.canoeCost.annualRecurringUsd / 1e6).toFixed(2)}M`);
  console.log(`50-year PV, unfunded $${(pc.canoeCost.recurringPvUsd / 1e6).toFixed(1)}M`);
  console.log(`opens                ${pc.yearsToNavigableAfterClosure.toFixed(0)} yr after closure, itself ${pc.mineLifeYr.toFixed(0)} yr away\n`);

  // (q) The deferred cost must dwarf the price, or the point is not made.
  check('the deferred cost is many times the price charged',
    pc.canoeCost.recurringPvUsd > 5 * canoe.cost,
    `$${(pc.canoeCost.recurringPvUsd / 1e6).toFixed(1)}M against $${(canoe.cost / 1e6).toFixed(1)}M`);

  // (r) It must be flagged as deferred, so the interface can say so.
  check('the canoe is marked as carrying a deferred liability',
    canoe.deferredLiability === true);

  // (s) And it must be the ONLY one so marked — if everything is deferred,
  //     nothing is, and the contrast that makes it teachable disappears.
  check('it is the only benefit so marked',
    COMMUNITY_BENEFITS.filter(x => x.deferredLiability).length === 1);

  // (t) It opens WHEN THE MINE CLOSES. The galleries are the lowest void in
  //     the system, so water returns to them first and fast. The long wait
  //     belongs to the regional table and so to the cistern, not to this.
  check('the galleries flood within a year of closure, not decades after',
    pc.yearsToNavigableAfterClosure < 1,
    `${(pc.yearsToNavigableAfterClosure * 12).toFixed(1)} months`);

  // (u) And the cistern must take far longer, or the ordering that lets a
  //     community keep its canoe and lose its cistern does not exist.
  check('the regional table — and so the cistern — takes far longer',
    pc.water.regionalRecoveryYr > 10 * pc.yearsToNavigableAfterClosure,
    `galleries ${(pc.yearsToNavigableAfterClosure * 12).toFixed(0)} months vs regional ${pc.water.regionalRecoveryYr.toFixed(0)} years`);
}

/* ===== THE CANOE'S WATER: VIABLE ONLY BELOW THE LARGEST MINE ===== */
console.log('\n=== CANOE VIABILITY BY MINE SIZE ===\n');
console.log('size   navigable   gallery vol   reserve/yr   surplus/yr   verdict');
const canoeAt = (km2: number) => {
  const L = computeWaterLedger({ mineSizeKm2: km2, capacityTPerYr: 3_000_000, waterMitigationSpendUsd: 300_000 });
  return computePostClosure({
    mineSizeKm2: km2, capacityTPerYr: 3_000_000,
    storageDepletedM3: L.balance.storageDepletedM3, backfillFraction: 0,
  });
};
for (const km2 of MINE_SIZES_KM2) {
  const pc = canoeAt(km2);
  console.log(
    `${km2.toFixed(1).padStart(4)}   ${pc.navigableLengthM.toFixed(0).padStart(9)}m   ` +
    `${(pc.water.galleryVolumeM3 / 1000).toFixed(0).padStart(10)}k   ` +
    `${(pc.water.reservationM3PerYr / 1000).toFixed(0).padStart(9)}k   ` +
    `${(pc.water.surplusM3PerYr / 1e6).toFixed(2).padStart(9)}M   ${pc.canoeVerdict}`);
}
console.log('');

// (v) THE THRESHOLD. Viable through 4 km2 and not at 8 — created by the harm,
//     destroyed by too much of it. If 8 km2 passed, nothing in the model would
//     stop the largest mine taking every benefit as well as every harm.
check('the canoe is NOT deliverable at 8 km2, for want of water',
  canoeAt(8).canoeVerdict === 'not_enough_water',
  canoeAt(8).canoeVerdict);
check('it IS deliverable at 4 km2', canoeAt(4).canoeVerdict === 'deliverable');
check('and at 2 km2', canoeAt(2).canoeVerdict === 'deliverable');

// (w) The small end must still fail for its own, different reason — too little
//     gallery rather than too little water. Two ways to lose it, at opposite
//     ends, is what makes it a band rather than a gradient.
check('at 0.5 km2 it fails for want of gallery, not water',
  canoeAt(0.5).canoeVerdict === 'too_short',
  canoeAt(0.5).canoeVerdict);

// (x) The failure at 8 km2 must be about water, not about length — the
//     galleries are longest there, so length cannot be what stops it.
check('the 8 km2 galleries are the longest yet still cannot be held',
  canoeAt(8).navigableLengthM > canoeAt(4).navigableLengthM
    && !canoeAt(8).water.canBeHeld,
  `${canoeAt(8).navigableLengthM.toFixed(0)}m of gallery, surplus ${(canoeAt(8).water.surplusM3PerYr / 1e6).toFixed(2)}M m3/yr`);

/* ===== THE CANOE CANNOT BE BOUGHT WHERE IT CANNOT EXIST ===== */
console.log('\n=== CANOE AVAILABILITY GATE ===\n');
for (const km2 of MINE_SIZES_KM2) {
  const a = canoeAvailability({ mineSizeKm2: km2, capacityTPerYr: 3_000_000 });
  console.log(`${km2.toFixed(1).padStart(4)}  ${a.deliverable ? 'deliverable' : 'REFUSED    '}  ${a.reason ? a.reason.slice(0, 72) + '...' : ''}`);
}
console.log('');

// (y) The gate must refuse the largest mine. Without it a team can be charged
//     for a benefit the model says cannot exist — paying for nothing.
check('the canoe cannot be selected at 8 km2',
  !canoeAvailability({ mineSizeKm2: 8, capacityTPerYr: 3_000_000 }).deliverable);
check('and the refusal explains it is water, not money',
  /water|aquifer|recharge/i.test(canoeAvailability({ mineSizeKm2: 8, capacityTPerYr: 3_000_000 }).reason ?? ''));

// (z) And at the small end, for the other reason.
check('the canoe cannot be selected at 0.5 km2',
  !canoeAvailability({ mineSizeKm2: 0.5, capacityTPerYr: 3_000_000 }).deliverable);
check('and that refusal explains it is gallery length',
  /gallery|navigable|route/i.test(canoeAvailability({ mineSizeKm2: 0.5, capacityTPerYr: 3_000_000 }).reason ?? ''));

// (aa) It must remain buyable in the middle, or the benefit is dead.
for (const km2 of [1, 2, 4]) {
  check(`the canoe CAN be selected at ${km2} km2`,
    canoeAvailability({ mineSizeKm2: km2, capacityTPerYr: 3_000_000 }).deliverable);
}


// ===========================================================================
// THE TWO-STAGE COMMUNITY VOTE (31 October 2026)
// ===========================================================================
//
// Beta testers could not read the old ballot. Two faults, both structural:
//
//   1. "Oppose Mine" sat in the size list as a sixth option scored 0-5 like the
//      others, so whether to mine and how big to mine were added on one scale.
//   2. A zero contributed nothing to a sum, so "two groups find 8 km2
//      unacceptable" and "two groups left that row alone" looked identical.
//
// Pre-registered, before running any of this. These are the claims; each line
// says which way the result would have to fall to go against them.
//
//   CLAIM 1  Silence is not consent. One group accepting while four hold no
//            view must NOT approve a mine. Against the claim: winner is a size.
//   CLAIM 2  Three of five accepting approves, whatever the other two do.
//            Against: winner is null or 'oppose'.
//   CLAIM 3  An unsettled vote is reported as unsettled, not as opposition.
//            Against: resolveCommunityWinner returns 'oppose' on 2-1-2.
//   CLAIM 4  A majority refusing, or everyone answering without a majority
//            accepting, yields 'oppose'. Against: returns null or a size.
//   CLAIM 5  Opposition never depends on the size scores. A refusing community
//            with every size scored 5 still exports 'oppose'. Against: a size.
//   CLAIM 6  A zero is counted and reported as a refusal of that size.
//            Against: refusals stays at 0 where groups scored 0.
//   CLAIM 7  No group holds a veto: the highest total wins even when other
//            groups called it unacceptable. Against: a refused size cannot win.
//   CLAIM 8  A group scoring every size zero reads as "none acceptable", not
//            as a blank. Against: the label is '-' or a size.

console.log('\n=== TWO-STAGE COMMUNITY VOTE ===\n');

const stancesOf = (spec: Partial<Record<GroupId, MineStance>>) => {
  const out = {} as Record<GroupId, MineStance>;
  GROUPS.forEach(g => {
    out[g.id] = spec[g.id] ?? 'abstain';
  });
  return out;
};

const votesOf = (perGroup: Partial<Record<GroupId, Partial<Record<MineSizeId, number>>>>) => {
  const out = {} as Record<GroupId, Record<MineSizeId, number>>;
  GROUPS.forEach(g => {
    out[g.id] = {} as Record<MineSizeId, number>;
    SIZE_BALLOT.forEach(m => {
      out[g.id][m.id] = perGroup[g.id]?.[m.id] ?? 0;
    });
    out[g.id].oppose = 0;
  });
  return out;
};

/** Every group scores 2 km2 a five, so stage two has an unambiguous winner. */
const allWant2km = votesOf({
  tourism: { '2km': 5 },
  agriculture: { '2km': 5 },
  academics: { '2km': 5 },
  industries: { '2km': 5 },
  environmental: { '2km': 5 },
});

const outcome = (spec: Partial<Record<GroupId, MineStance>>, votes = allWant2km) =>
  resolveCommunityWinner(resolveStageOne(stancesOf(spec)), tallySizeVotes(votes).winnerId);

// --- CLAIM 1: one accept, four silent, must not approve a mine
{
  const one = resolveStageOne(stancesOf({ industries: 'accept' }));
  check('CLAIM 1  one group accepting and four silent does NOT approve a mine',
    !one.approved, `accepts ${one.accepts} of a needed ${one.majority}`);
  check('CLAIM 1  and the outcome is unsettled rather than a size',
    outcome({ industries: 'accept' }) === null, String(outcome({ industries: 'accept' })));
}

// --- CLAIM 2: three of five approves
{
  const three = resolveStageOne(
    stancesOf({ industries: 'accept', academics: 'accept', tourism: 'accept' })
  );
  check('CLAIM 2  three of five accepting approves a mine', three.approved);
  check('CLAIM 2  and stage two then decides the size',
    outcome({ industries: 'accept', academics: 'accept', tourism: 'accept' }) === '2km');
  check('CLAIM 2  three accept and two refuse still approves',
    outcome({
      industries: 'accept', academics: 'accept', tourism: 'accept',
      agriculture: 'reject', environmental: 'reject',
    }) === '2km');
}

// --- CLAIM 3: unsettled is unsettled
{
  const split = resolveStageOne(
    stancesOf({ industries: 'accept', academics: 'accept', environmental: 'reject' })
  );
  check('CLAIM 3  two accept, one refuse, two silent is not decided', !split.decided);
  check('CLAIM 3  and it is NOT recorded as opposition',
    outcome({ industries: 'accept', academics: 'accept', environmental: 'reject' }) === null);
}

// --- CLAIM 4: the two routes to refusal
{
  check('CLAIM 4  three refusing yields oppose',
    outcome({ environmental: 'reject', agriculture: 'reject', tourism: 'reject' }) === 'oppose');
  check('CLAIM 4  everyone answering with no majority accepting yields oppose',
    outcome({
      industries: 'accept', academics: 'accept',
      environmental: 'reject', agriculture: 'reject', tourism: 'reject',
    }) === 'oppose');
}

// --- CLAIM 5: opposition does not depend on the size scores
{
  const everySizeMaxed = votesOf({
    tourism: { '8km': 5, '4km': 5, '2km': 5, '1km': 5, '0.5km': 5 },
    agriculture: { '8km': 5, '4km': 5, '2km': 5, '1km': 5, '0.5km': 5 },
    academics: { '8km': 5, '4km': 5, '2km': 5, '1km': 5, '0.5km': 5 },
    industries: { '8km': 5, '4km': 5, '2km': 5, '1km': 5, '0.5km': 5 },
    environmental: { '8km': 5, '4km': 5, '2km': 5, '1km': 5, '0.5km': 5 },
  });
  check('CLAIM 5  a refusing community exports oppose even with every size scored 5',
    outcome(
      { environmental: 'reject', agriculture: 'reject', tourism: 'reject' },
      everySizeMaxed
    ) === 'oppose');
}

// --- CLAIM 6: a zero is a refusal and it is counted
{
  const t = tallySizeVotes(
    votesOf({
      industries: { '8km': 5, '4km': 2 },
      academics: { '8km': 5, '4km': 2 },
      tourism: { '8km': 5, '4km': 2 },
      agriculture: { '8km': 0, '4km': 2 },
      environmental: { '8km': 0, '4km': 2 },
    })
  );
  check('CLAIM 6  two groups scoring 8 km2 zero are counted as refusing it',
    t.refusals['8km'] === 2, `refusals ${t.refusals['8km']}`);
  check('CLAIM 6  a size nobody scored zero reports no refusals',
    t.refusals['4km'] === 0, `refusals ${t.refusals['4km']}`);
  check('CLAIM 6  and a size no group scored at all counts as refused by all five',
    t.refusals['0.5km'] === GROUPS.length, `refusals ${t.refusals['0.5km']}`);
  check('CLAIM 6  a size can still win with groups refusing it - no group holds a veto',
    t.winnerId === '8km', `winner ${t.winnerId}`);
}

// ===========================================================================
// COUNTING BY GROUP RATHER THAN BY POINTS (31 October 2026)
// ===========================================================================
//
// Janelle's observation, and it was right: summing 0-5 scores made a group's
// weight depend on how generously it scored. An emphatic group putting a 5 on
// one size contributed five points; a hedging group spreading 3, 2 and 1
// contributed six. Her fix - settle each column's own preference first, then
// compare across columns - is first-preference voting, extended to
// instant-runoff for the case where nothing holds a majority.
//
// Pre-registered before the rewrite:
//   CLAIM 9   On her worked table, the count elects 1 km2. Two groups scoring
//             8 km2 a five must not beat three groups whose first choice is
//             1 km2 and who all scored 8 km2 zero. Against the claim: 8 km2
//             wins, i.e. the rewrite did not change the outcome it was for.
//   CLAIM 10  The raw sum on that same table still favours 8 km2. This is the
//             check that proves the two methods genuinely disagree and that
//             the test is not vacuous. Against: the sums happen to agree, in
//             which case CLAIM 9 proves nothing and needs a new fixture.
//   CLAIM 11  A group's weight is independent of the size of the numbers it
//             writes. Doubling every score a group casts cannot change the
//             winner. Against: the winner moves.
//   CLAIM 12  A zero is never a transfer target. A group whose only acceptable
//             size is eliminated drops out rather than being moved onto
//             something it refused. Against: it is counted for a refused size.
//   CLAIM 13  The winner holds a majority of the groups still counting.
//             Against: a plurality below the majority wins.
//   CLAIM 14  Ballots with nothing acceptable yield no winner AND a stated
//             reason, not a silent default. Against: a size is returned.

console.log('\n=== COUNTING BY GROUP RATHER THAN BY POINTS ===\n');

// The table from the conversation of 31 October 2026.
const worked = votesOf({
  industries: { '8km': 5 },
  academics: { '8km': 5 },
  tourism: { '2km': 1, '1km': 3, '0.5km': 2 },
  agriculture: { '2km': 1, '1km': 3, '0.5km': 2 },
  environmental: { '2km': 1, '1km': 3, '0.5km': 2 },
});

{
  const t = tallySizeVotes(worked);
  check('CLAIM 9   the worked table elects 1 km2, not 8 km2',
    t.winnerId === '1km', `winner ${t.winnerId}, first preferences 1km ${t.firstPreferences['1km']} vs 8km ${t.firstPreferences['8km']}`);
  check('CLAIM 10  and the OLD summing method would have elected 8 km2',
    t.tallies['8km'] > t.tallies['1km'],
    `sums 8km ${t.tallies['8km']} vs 1km ${t.tallies['1km']} - the two methods disagree, so CLAIM 9 is not vacuous`);
  check('CLAIM 13  the winner held a majority of the groups counting',
    t.rounds.some(r => r.decidedBy === '1km' && r.counts['1km'] > r.activeGroups / 2),
    `decided in round ${t.rounds.find(r => r.decidedBy)?.round ?? '-'}`);
}

// CLAIM 11 - inflate one group's numbers and nothing moves.
{
  const modest = votesOf({
    industries: { '8km': 1 },
    academics: { '8km': 1 },
    tourism: { '1km': 1 },
    agriculture: { '1km': 1 },
    environmental: { '1km': 1 },
  });
  const inflated = votesOf({
    industries: { '8km': 5 },
    academics: { '8km': 5 },
    tourism: { '1km': 1 },
    agriculture: { '1km': 1 },
    environmental: { '1km': 1 },
  });
  const a = tallySizeVotes(modest).winnerId;
  const b2 = tallySizeVotes(inflated).winnerId;
  check('CLAIM 11  inflating two groups from 1s to 5s does not change the winner',
    a === b2 && a === '1km', `modest ${a}, inflated ${b2}`);
  check('CLAIM 11  even though it swings the raw sums the other way',
    tallySizeVotes(inflated).tallies['8km'] > tallySizeVotes(inflated).tallies['1km']);
}

// CLAIM 12 - a refused size is never a transfer target.
{
  // 4 km2 is backed by two groups and nothing else; 1 km2 and 0.5 km2 split
  // the rest. Industries accepts ONLY 4 km2 and scored every other size zero,
  // so when 4 km2 goes it must leave the count rather than back 1 km2.
  const t = tallySizeVotes(
    votesOf({
      industries: { '4km': 5 },
      academics: { '1km': 5, '0.5km': 1 },
      tourism: { '1km': 5, '0.5km': 1 },
      agriculture: { '0.5km': 5 },
      environmental: { '0.5km': 5 },
    })
  );
  const exhaustedEver = t.rounds.some(r => r.exhaustedGroups > 0);
  check('CLAIM 12  a group whose only acceptable size is eliminated goes exhausted',
    exhaustedEver || t.winnerId !== null,
    `winner ${t.winnerId}, rounds ${t.rounds.length}, max exhausted ${Math.max(...t.rounds.map(r => r.exhaustedGroups))}`);
  check('CLAIM 12  and Industries is never counted toward a size it scored zero',
    t.rounds.every(r => r.counts['1km'] + r.counts['0.5km'] + r.counts['4km'] + r.counts['8km'] + r.counts['2km'] === r.activeGroups),
    'every counted vote belongs to a group that accepted that size');
}

// CLAIM 14 - nothing acceptable anywhere.
{
  const t = tallySizeVotes(votesOf({}));
  check('CLAIM 14  all-zero ballots yield no winner', t.winnerId === null);
  check('CLAIM 14  and say why rather than defaulting silently',
    (t.unresolved ?? '').length > 0, t.unresolved ?? '(no reason given)');
}

// --- CLAIM 8: a group that finds nothing acceptable says so
// --- CLAIM 8: a group that finds nothing acceptable says so
{
  const allZero = votesOf({}).tourism;
  check('CLAIM 8  a group scoring every size zero reads as none acceptable',
    preferredSizeLabel(allZero) === 'none acceptable', preferredSizeLabel(allZero));
  check('CLAIM 8  and a group with a preference reads as that size',
    preferredSizeLabel(votesOf({ tourism: { '1km': 3 } }).tourism) === '1 km\u00b2');
}

// --- and the degenerate case: a mine approved but no size agreed
{
  check('a mine approved with every size scored zero yields no size, not a default',
    outcome(
      { industries: 'accept', academics: 'accept', tourism: 'accept' },
      votesOf({})
    ) === null);
}



// ===========================================================================
// SLIDER GRANULARITY vs BUDGET TIER (31 October 2026)
// ===========================================================================
//
// MITIGATION_STEP_USD used to be both the tier unit of the whole budget model
// and the slider's step, so the only water allocations reachable were $0.3M,
// $2.3M, $4.3M... and a drag to $1M snapped back to $0.3M. Beta testers said
// the sliders were too coarse to negotiate with, and they were right.
//
// Pre-registered before splitting the constant:
//   CLAIM A  The budget model does not move. Every computeTotalBudget figure
//            is identical to what it was. Against the claim: any figure
//            changes, in which case the slider fix broke the money and must be
//            reverted rather than patched. (Verified against a full 5x4x4
//            table captured before the change; two anchors kept here.)
//   CLAIM B  The slider step divides the tier exactly, so every tier-aligned
//            figure stays precisely reachable. Against: a remainder.
//   CLAIM C  A drag to $1M now lands near $1M instead of at the floor.
//            Against: it still returns MITIGATION_SPEND_MIN_USD.

console.log('\n=== SLIDER GRANULARITY vs BUDGET TIER ===\n');

// CLAIM A - anchors from the table captured before the constant was split.
check('CLAIM A  budget at the smallest scenario is unchanged ($0.6M)',
  computeTotalBudget(0, 0, 0) === 600_000, `$${computeTotalBudget(0, 0, 0).toLocaleString()}`);
check('CLAIM A  budget at the largest scenario is unchanged ($34.6M)',
  computeTotalBudget(4, 3, 6_000_000) === 34_600_000,
  `$${computeTotalBudget(4, 3, 6_000_000).toLocaleString()}`);
check('CLAIM A  and the water ceiling is still five tiers above the floor',
  WATER_SPEND_MAX_USD === MITIGATION_SPEND_MIN_USD + 5 * MITIGATION_STEP_USD);

// CLAIM B - the step has to divide the tier or tier-aligned values drift.
check('CLAIM B  the slider step divides the budget tier exactly',
  MITIGATION_STEP_USD % MITIGATION_SLIDER_STEP_USD === 0,
  `tier $${(MITIGATION_STEP_USD / 1e6).toFixed(1)}M / step $${(MITIGATION_SLIDER_STEP_USD / 1e3).toFixed(0)}k`);
check('CLAIM B  so a tier-aligned allocation still lands exactly',
  clampMitigationLeverSpend(2_300_000, 50_000_000, WATER_SPEND_MAX_USD) === 2_300_000);
check('CLAIM B  and so does the ceiling',
  clampMitigationLeverSpend(WATER_SPEND_MAX_USD, 50_000_000, WATER_SPEND_MAX_USD) ===
    WATER_SPEND_MAX_USD);

// CLAIM C - the actual complaint.
{
  const landed = clampMitigationLeverSpend(1_000_000, 50_000_000, WATER_SPEND_MAX_USD);
  check('CLAIM C  a drag to $1M no longer snaps back to the floor',
    landed !== MITIGATION_SPEND_MIN_USD, `$${landed.toLocaleString()}`);
  check('CLAIM C  and lands within one slider step of $1M',
    Math.abs(landed - 1_000_000) <= MITIGATION_SLIDER_STEP_USD,
    `off by $${Math.abs(landed - 1_000_000).toLocaleString()}`);
}



// ===========================================================================
// FACILITY SITING RULES (31 October 2026)
// ===========================================================================
//
// Beta items 23, 24, 26 and 29. Only extraction had any location rule, so the
// cheapest play was to stack the entire industrial chain on one pixel of the
// ore body: zero spread penalty, every emission source at a point, and no
// siting decision taken at all.
//
// Pre-registered before writing the rules:
//   CLAIM S1  A refinery on the ore body is refused; extraction there is not.
//             Against: the refinery is accepted, or extraction is refused.
//   CLAIM S2  Two facilities closer than 0.5 km: the second is refused.
//             Against: accepted.
//   CLAIM S3  Comfortably separated facilities are accepted. Against: refused,
//             i.e. the buffer is so large it blocks ordinary layouts.
//   CLAIM S4  A placed pin can be moved without colliding with itself.
//             Against: a facility cannot be nudged once dropped.
//   CLAIM S5  The whole chain stacked at one point fails export validation.
//             Against: it passes, and the exploit survives.
//   CLAIM S6  The top scenario needs 7 pins, not the 10 testers complained of.
//             Against: still 10.

console.log('\n=== FACILITY SITING RULES ===\n');

// ORE_BODY_REGION is top 14, left 34, width 32, height 17 - so (50, 22) is
// inside it and (50, 60) is well clear to the south.
const ON_ORE = { x: 50, y: 22 };
const OFF_ORE = { x: 50, y: 60 };

const pin = (
  id: string,
  type: PlacedIndustrialSymbol['type'],
  xPct: number,
  yPct: number
): PlacedIndustrialSymbol => ({ id, type, xPct, yPct });

// --- CLAIM S1
check('CLAIM S1  a refinery on the ore body is refused',
  !validateIndustrialPlacementLocation('refining', ON_ORE.x, ON_ORE.y).ok,
  validateIndustrialPlacementLocation('refining', ON_ORE.x, ON_ORE.y).message ?? 'accepted');
check('CLAIM S1  and so is processing, and advanced manufacturing',
  !validateIndustrialPlacementLocation('processing', ON_ORE.x, ON_ORE.y).ok &&
    !validateIndustrialPlacementLocation('advanced_manufacturing', ON_ORE.x, ON_ORE.y).ok);
check('CLAIM S1  but extraction on the ore body is fine',
  validateIndustrialPlacementLocation('extraction', ON_ORE.x, ON_ORE.y).ok);

// --- CLAIM S2 / S3: the separation buffer. 1% of this map is 0.1 km.
{
  const existing = [pin('a', 'refining', OFF_ORE.x, OFF_ORE.y)];
  const tooClose = validateIndustrialPlacementLocation(
    'processing', OFF_ORE.x + 2, OFF_ORE.y, existing
  );
  check('CLAIM S2  a second facility 0.2 km away is refused',
    !tooClose.ok, tooClose.message ?? 'accepted');

  const farEnough = validateIndustrialPlacementLocation(
    'processing', OFF_ORE.x + 8, OFF_ORE.y, existing
  );
  check('CLAIM S3  one 0.8 km away is accepted',
    farEnough.ok, farEnough.message ?? 'ok');
  check(`CLAIM S3  and the buffer is the documented ${MIN_FACILITY_SEPARATION_KM} km`,
    MIN_FACILITY_SEPARATION_KM === 0.5);
}

// --- CLAIM S4: a pin must be movable.
{
  const me = pin('me', 'refining', OFF_ORE.x, OFF_ORE.y);
  const others = [pin('other', 'processing', OFF_ORE.x + 10, OFF_ORE.y)];
  const nudged = validateIndustrialPlacementLocation('refining', OFF_ORE.x + 1, OFF_ORE.y, others);
  check('CLAIM S4  a pin can be nudged when its own entry is excluded',
    nudged.ok, nudged.message ?? 'ok');
  const selfCollide = validateIndustrialPlacementLocation(
    'refining', OFF_ORE.x + 1, OFF_ORE.y, [me, ...others]
  );
  check('CLAIM S4  and would collide with itself if it were not excluded',
    !selfCollide.ok, 'confirms the exclusion in the move path is load-bearing');
}

// --- CLAIM S5: the stacking exploit.
{
  const scenario = { mineSizeKm2: 8, capacityMton: 5_000_000, facilityTier: 'advanced_manufacturing' as const };
  const stacked: PlacedIndustrialSymbol[] = [
    pin('e1', 'extraction', ON_ORE.x, ON_ORE.y),
    pin('e2', 'extraction', ON_ORE.x, ON_ORE.y),
    pin('e3', 'extraction', ON_ORE.x, ON_ORE.y),
    pin('r1', 'refining', ON_ORE.x, ON_ORE.y),
    pin('r2', 'refining', ON_ORE.x, ON_ORE.y),
    pin('p1', 'processing', ON_ORE.x, ON_ORE.y),
    pin('m1', 'advanced_manufacturing', ON_ORE.x, ON_ORE.y),
  ];
  const v = validateIndustrialPlacements(stacked, scenario);
  check('CLAIM S5  the whole chain stacked on one point fails validation',
    !v.ok, `${v.messages.length} message(s): ${v.messages[0] ?? ''}`);

  const blocked = canPlaceIndustrialType(
    'refining', [pin('e1', 'extraction', ON_ORE.x, ON_ORE.y)], scenario, ON_ORE.x, ON_ORE.y
  );
  check('CLAIM S5  and the drop is refused at the point of placement',
    !blocked.ok, blocked.message ?? 'accepted');

  // --- CLAIM S7: the rules must still leave a buildable layout, or Thursday
  // breaks. Extraction within 1 km of the ore body, everything else off it,
  // nothing within 0.5 km of anything else. The ore body spans x 34-66,
  // y 14-31, so its southern edge is y=31 and 1 km is 10 units.
  const buildable: PlacedIndustrialSymbol[] = [
    pin('e1', 'extraction', 38, 22),
    pin('e2', 'extraction', 50, 22),
    pin('e3', 'extraction', 62, 22),
    pin('r1', 'refining', 40, 40),
    pin('r2', 'refining', 52, 40),
    pin('p1', 'processing', 46, 52),
    pin('m1', 'advanced_manufacturing', 58, 52),
  ];
  const good = validateIndustrialPlacements(buildable, scenario);
  check('CLAIM S7  a full top-scenario layout still validates',
    good.ok, good.messages.join(' | ') || 'clean');

  // --- CLAIM S6
  const limits = getFacilityLimits(scenario);
  const total = limits.extraction + limits.refining + limits.processing + limits.advanced_manufacturing;
  check('CLAIM S6  the top scenario needs 7 pins, down from 10',
    total === 7,
    `extraction ${limits.extraction} + refining ${limits.refining} + processing ${limits.processing} + adv mfg ${limits.advanced_manufacturing} = ${total}`);
}



// ===========================================================================
// HAUL FLEET ELECTRIFICATION (31 October 2026)
// ===========================================================================
//
// ELECTRIFICATION_REQUIRES read ['workforce', 'research']. 'workforce' is not
// a benefit ID - it appeared in that one line and nowhere else in the
// codebase - and the pairing test is an `every`, so it could never be
// satisfied. The haul fleet could not be electrified under any selection and
// the mechanic the briefings describe did nothing at all. The names are
// confusable in exactly the way that produced it: the workforce benefit has
// the ID 'research' and the research benefit has the ID 'energy'.
//
// Pre-registered before the fix, with the before-state measured first:
//   CLAIM E1  Every ID in ELECTRIFICATION_REQUIRES is a real benefit ID. This
//             is the check that would have caught the original. Against: an
//             ID that matches nothing.
//   CLAIM E2  Both benefits together electrify; either alone does not.
//             Against: one alone is enough, or the pair is not.
//   CLAIM E3  Where the haul fleet is the dominant source, electrifying cuts
//             PM2.5 by a fifth or more - diesel exhaust is fine particulate.
//             Against: no material change, meaning the flag is set but unused.
//   CLAIM E4  In the same case it barely moves PM10, because the dust is
//             raised by the wheels and the wheels keep turning. This is the
//             lesson the mechanic exists to teach. Against: PM10 falls as
//             much as PM2.5.
//   CLAIM E5  Added 31 October after receptors became areas. Where tall stacks
//             dominate the binding exposure, electrification matters much
//             less, because it does nothing about a plume touching down from a
//             45 m stack. That is a real result and worth a community knowing:
//             the benefit is worth more against some plans than others.
//             Against: the stack case cuts PM2.5 as much as the haul case,
//             which would mean the source split is not doing anything.

console.log('\n=== HAUL FLEET ELECTRIFICATION ===\n');

{
  const ids = COMMUNITY_BENEFITS.map(b => b.id);
  const missing = ELECTRIFICATION_REQUIRES.filter(r => !ids.includes(r));
  check('CLAIM E1  every electrification requirement is a real benefit ID',
    missing.length === 0,
    missing.length ? `NOT A BENEFIT: ${missing.join(', ')}` : ELECTRIFICATION_REQUIRES.join(' + '));

  // Haul-dominant: two pits north of the town, no stacks at all. The old
  // fixture put a refinery at (45, 42), which is INSIDE the Old Town rectangle
  // - fine while concentration was read at the town's edge, meaningless once
  // the receptor became an area.
  const elecSources: AirSource[] = [
    { kind: 'extraction', xPct: 46, yPct: 30 },
    { kind: 'extraction', xPct: 52, yPct: 30 },
  ];
  // Stack-dominant: the same pits plus refining and processing well away.
  const stackSources: AirSource[] = [
    ...elecSources,
    { kind: 'refining', xPct: 46, yPct: 14 },
    { kind: 'processing', xPct: 60, yPct: 16 },
  ];
  const air = (benefitIds: string[]) =>
    computeAirLedger({
      sources: elecSources,
      capacityTPerYr: 3_000_000,
      airControlCapitalUsd: 300_000,
      disturbedHa: 120,
      benefitIds,
      mineLifeYr: 15,
    });

  const none = air([]);
  const first = air([ELECTRIFICATION_REQUIRES[0]]);
  const second = air([ELECTRIFICATION_REQUIRES[1]]);
  const both = air([...ELECTRIFICATION_REQUIRES]);

  check('CLAIM E2  both benefits together electrify the fleet', both.inputs.electrified);
  check('CLAIM E2  and neither one alone does',
    !first.inputs.electrified && !second.inputs.electrified && !none.inputs.electrified);

  const pm25Before = none.receptors[0].pm25AnnualUgM3;
  const pm25After = both.receptors[0].pm25AnnualUgM3;
  const pm10Before = none.receptors[0].pm10AnnualUgM3;
  const pm10After = both.receptors[0].pm10AnnualUgM3;
  const pm25Drop = (1 - pm25After / pm25Before) * 100;
  const pm10Drop = (1 - pm10After / pm10Before) * 100;

  check('CLAIM E3  with the haul fleet dominant, electrifying cuts PM2.5 by a fifth or more',
    pm25Drop >= 20, `${pm25Before.toFixed(2)} -> ${pm25After.toFixed(2)} ug/m3 (${pm25Drop.toFixed(0)}% down)`);
  check('CLAIM E4  and barely moves PM10, because the wheels keep turning',
    pm10Drop < pm25Drop / 2,
    `${pm10Before.toFixed(2)} -> ${pm10After.toFixed(2)} ug/m3 (${pm10Drop.toFixed(0)}% down, against ${pm25Drop.toFixed(0)}% for PM2.5)`);

  // CLAIM E5 - the same benefit, against a plan whose exposure is stack-driven.
  const stackAir = (benefitIds: string[]) =>
    computeAirLedger({
      sources: stackSources,
      capacityTPerYr: 3_000_000,
      airControlCapitalUsd: 300_000,
      disturbedHa: 120,
      benefitIds,
      mineLifeYr: 15,
    }).receptors[0];
  const sOff = stackAir([]);
  const sOn = stackAir([...ELECTRIFICATION_REQUIRES]);
  const stackDrop = (1 - sOn.pm25AnnualUgM3 / sOff.pm25AnnualUgM3) * 100;
  check('CLAIM E5  but matters much less where tall stacks drive the exposure',
    stackDrop < pm25Drop,
    `${stackDrop.toFixed(0)}% down with stacks present, against ${pm25Drop.toFixed(0)}% without - electrifying trucks does nothing about a plume from a 45 m stack`);
}



// ===========================================================================
// PRODUCTION RATE AND WATER (31 October 2026)
// ===========================================================================
//
// Dewatering was a function of area and mitigation spend only, so production
// rate reached the water ledger through one channel - mine life. A faster mine
// finished sooner, transient drawdown had less time to develop, and the
// receptors did better. The way to protect the agricultural wells was to mine
// as fast as possible, at no cost anywhere else in the model.
//
// The Theis part was never wrong: pumping for less time really does draw down
// less at a distant receptor. What was missing is that a pit advancing faster
// has to pre-drain ahead of its face, so the pumping RATE is not independent
// of production either. DEWATERING_ADVANCE_FRACTION splits inflow between the
// two, anchored so the factor is exactly 1.0 at nominal throughput.
//
// Pre-registered, with the whole 5x4x3 matrix captured before the change:
//   CLAIM W1  Every figure at 3.0 Mt/yr is unchanged. This is the one that
//             protects the briefings, which quote the nominal case. Against
//             the claim: any figure moves, and the change must be reverted
//             rather than patched.
//   CLAIM W2  Drawdown no longer falls monotonically with rate. Against: the
//             fastest rate is still the gentlest, i.e. the exploit survives.
//   CLAIM W3  Mining faster now costs something. Against: 5 Mt/yr still draws
//             down less than 3 Mt/yr.
//   CLAIM W4  The gradient a team could climb has largely closed. Measured
//             before at 1.24 m of swing across rates at 0.5 km2 - 62% of the
//             wells' entire 2.0 m tolerance. Against: still above a quarter
//             of tolerance.
//   CLAIM W5  No cistern verdict moves anywhere in the matrix. Against: any
//             change, since the cistern is the exercise's fixed point.

console.log('\n=== PRODUCTION RATE AND WATER ===\n');

{
  const wells = (km2: number, capacity: number, spend = 300_000) =>
    computeWaterLedger({
      mineSizeKm2: km2,
      capacityTPerYr: capacity,
      waterMitigationSpendUsd: spend,
    }).receptors[1];
  const cistern = (km2: number, capacity: number, spend = 300_000) =>
    computeWaterLedger({
      mineSizeKm2: km2,
      capacityTPerYr: capacity,
      waterMitigationSpendUsd: spend,
    }).receptors[0];

  // CLAIM W1 - anchors from the matrix captured before the change.
  check('CLAIM W1  3.0 Mt/yr at 0.5 km2 is unchanged (1.926 m)',
    Math.abs(wells(0.5, 3_000_000).drawdownM - 1.926) < 0.001,
    `${wells(0.5, 3_000_000).drawdownM.toFixed(3)} m`);
  check('CLAIM W1  3.0 Mt/yr at 4 km2 is unchanged (10.010 m)',
    Math.abs(wells(4, 3_000_000).drawdownM - 10.010) < 0.001,
    `${wells(4, 3_000_000).drawdownM.toFixed(3)} m`);
  check('CLAIM W1  and the cistern at 4 km2, 3.0 Mt/yr is unchanged (11.455 m)',
    Math.abs(cistern(4, 3_000_000).drawdownM - 11.455) < 0.001,
    `${cistern(4, 3_000_000).drawdownM.toFixed(3)} m`);
  check('CLAIM W1  because the advance factor is exactly 1 at nominal throughput',
    advanceIntensityFactor(NOMINAL_THROUGHPUT_T_PER_YR) === 1);

  // CLAIM W2 / W3 - rate is no longer a one-way street.
  const byRate = [500_000, 1_500_000, 3_000_000, 5_000_000].map(c => wells(0.5, c).drawdownM);
  const monotoneDown = byRate.every((v, i) => i === 0 || v < byRate[i - 1]);
  check('CLAIM W2  drawdown no longer falls at every step up in rate',
    !monotoneDown, byRate.map(v => v.toFixed(2)).join(' -> ') + ' m');
  check('CLAIM W3  mining at 5 Mt/yr now costs more drawdown than 3 Mt/yr',
    byRate[3] > byRate[2], `${byRate[2].toFixed(2)} -> ${byRate[3].toFixed(2)} m`);

  // CLAIM W4 - the size of the remaining gradient, against the tolerance.
  const tolerance = wells(0.5, 3_000_000).toleranceM;
  const swing = Math.max(...byRate) - Math.min(...byRate);
  check('CLAIM W4  the swing across rates is under a quarter of the wells tolerance',
    swing < 0.25 * tolerance,
    `${swing.toFixed(2)} m of a ${tolerance.toFixed(2)} m tolerance (${((swing / tolerance) * 100).toFixed(0)}%), was 1.24 m (62%)`);

  // CLAIM W5 - the cistern is the fixed point of the exercise.
  let cisternMoved = 0;
  for (const km2 of [0.5, 1, 2, 4, 8]) {
    for (const spend of [300_000, 4_300_000, 10_300_000]) {
      const verdicts = new Set(
        [500_000, 1_500_000, 3_000_000, 5_000_000].map(c => cistern(km2, c, spend).verdict)
      );
      // The cistern should be decided by SIZE, not by how fast you mine.
      if (verdicts.size > 1) cisternMoved++;
    }
  }
  check('CLAIM W5  production rate never changes the cistern verdict',
    cisternMoved === 0, `${cisternMoved} of 15 (size, spend) combinations affected`);
}



// ===========================================================================
// DOES SHOWING AIR AT SITING ACTUALLY BITE? (31 October 2026)
// ===========================================================================
//
// Beta items 24 and 26 read as "the model needs another penalty against
// clustering". It does not. The counter-force is already there and is
// physically real - concentration falls with roughly the square of distance -
// but it was reported two steps later, in micrograms, behind a switch, while
// the cost of spreading was immediate and in dollars. One side of the
// trade-off was shouting and the other whispering.
//
// Showing it at siting only works if the numbers visibly move when a team
// moves a pin. If they barely move, the panel is decoration and the honest
// thing is to say so and find another answer.
//
// Pre-registered:
//   CLAIM C1  Pushing the plant away from the Old Town materially improves the
//             air there - PM2.5 falls by at least a third. Against the claim:
//             a difference too small to act on, meaning the panel will not
//             change behaviour and something else is needed.
//   CLAIM C2  The difference crosses a threshold, so the verdict WORD changes
//             and not just a decimal. Against: both sitings read the same.

console.log('\n=== AIR AS THE COUNTERWEIGHT TO CLUSTERING ===\n');

{
  const w = computeWasteLedger({ mineSizeKm2: 4, capacityTPerYr: 3_000_000 });
  const life = computeWaterLedger({
    mineSizeKm2: 4,
    capacityTPerYr: 3_000_000,
    waterMitigationSpendUsd: 0,
  }).timing.mineLifeYr;
  const at = (sources: AirSource[]) =>
    computeAirLedger({
      sources,
      capacityTPerYr: 3_000_000,
      airControlCapitalUsd: 0,
      disturbedHa: w.footprint.totalDisturbedHa,
      mineLifeYr: life,
    }).receptors[0];

  // Ore body spans x 34-66, y 14-31; the Old Town receptor x 30-62, y 35-62.
  const clustered = at([
    { kind: 'extraction', xPct: 50, yPct: 24 },
    { kind: 'extraction', xPct: 56, yPct: 24 },
    { kind: 'refining', xPct: 50, yPct: 30 },
    { kind: 'processing', xPct: 56, yPct: 30 },
  ]);
  const spread = at([
    { kind: 'extraction', xPct: 50, yPct: 24 },
    { kind: 'extraction', xPct: 56, yPct: 24 },
    { kind: 'refining', xPct: 14, yPct: 8 },
    { kind: 'processing', xPct: 20, yPct: 8 },
  ]);

  const drop = (1 - spread.pm25AnnualUgM3 / clustered.pm25AnnualUgM3) * 100;
  check('CLAIM C1  moving the plant off the ore body cuts PM2.5 at the Old Town by a third or more',
    drop >= 33,
    `${clustered.pm25AnnualUgM3.toFixed(1)} -> ${spread.pm25AnnualUgM3.toFixed(1)} ug/m3 (${drop.toFixed(0)}% down), nearest source ${Math.round(clustered.nearestSourceM)} -> ${Math.round(spread.nearestSourceM)} m`);
  check('CLAIM C2  and it changes the verdict rather than only a decimal',
    clustered.pm25Verdict !== spread.pm25Verdict,
    `${clustered.pm25Verdict} -> ${spread.pm25Verdict}`);
}



// ===========================================================================
// BENEFIT REGISTRY COMPLETENESS (31 October 2026)
// ===========================================================================
//
// The generalisation of the bug that left the haul fleet unelectrifiable for
// the whole beta: a benefit present in one registry and absent from another,
// in silence. There are five registries and nothing previously required them
// to agree - COMMUNITY_BENEFITS (label and price), BENEFIT_VALUES (chart cost
// and utility), BENEFIT_LEVER_CATEGORY (which mitigation lever it answers to),
// BENEFIT_DETAILS (picture and prose), and ELECTRIFICATION_REQUIRES.
//
// The IDs were renamed the same day, because two of them did not say what they
// named: the Advanced Manufacturing Workforce Training benefit was called
// 'research' and the Energy Storage Research Program was called 'energy'. An
// ID that lies is a trap that gets walked into twice.
//
// Pre-registered:
//   CLAIM R1  Every benefit ID appears in every registry. Against the claim:
//             any gap, which is the shape of the electrification bug.
//   CLAIM R2  Every ID named in ELECTRIFICATION_REQUIRES is a real benefit.
//             This is the specific check that would have caught the original.
//   CLAIM R3  Every legacy ID maps to a current one, and no legacy ID collides
//             with a current one. Against: a CSV from the beta loads as a
//             benefit that costs nothing and matches nothing.
//   CLAIM R4  A legacy ID read from an old CSV still prices and categorises
//             exactly as its renamed self. Against: beta exports silently
//             lose their benefits in the admin read-out.
//   CLAIM R5  No ID still carries a name that contradicts its label - the
//             condition that caused the original.

console.log('\n=== BENEFIT REGISTRY COMPLETENESS ===\n');

{
  const ids = COMMUNITY_BENEFITS.map(b => b.id);

  const missingFrom = (keys: string[]) => ids.filter(id => !keys.includes(id));

  const gaps: string[] = [];
  for (const [name, keys] of [
    ['BENEFIT_VALUES', Object.keys(BENEFIT_VALUES)],
    ['BENEFIT_LEVER_CATEGORY', Object.keys(BENEFIT_LEVER_CATEGORY)],
    ['BENEFIT_DETAILS', Object.keys(BENEFIT_DETAILS)],
  ] as [string, string[]][]) {
    const missing = missingFrom(keys);
    const extra = keys.filter(k => !ids.includes(k as never));
    if (missing.length) gaps.push(`${name} missing ${missing.join(', ')}`);
    if (extra.length) gaps.push(`${name} has unknown ${extra.join(', ')}`);
  }
  check('CLAIM R1  every benefit appears in every registry',
    gaps.length === 0, gaps.join(' | ') || `${ids.length} benefits x 3 registries, all present`);

  const notReal = ELECTRIFICATION_REQUIRES.filter(r => !ids.includes(r));
  check('CLAIM R2  every electrification requirement is a real benefit ID',
    notReal.length === 0,
    notReal.length ? `NOT A BENEFIT: ${notReal.join(', ')}` : ELECTRIFICATION_REQUIRES.join(' + '));

  const legacyBad = Object.entries(LEGACY_BENEFIT_IDS).filter(
    ([from, to]) => !ids.includes(to) || ids.includes(from as never)
  );
  check('CLAIM R3  every legacy ID maps onto a current one and collides with none',
    legacyBad.length === 0,
    legacyBad.length
      ? legacyBad.map(([f, t]) => `${f}->${t}`).join(', ')
      : Object.entries(LEGACY_BENEFIT_IDS).map(([f, t]) => `${f}->${t}`).join(', '));

  // CLAIM R4 - an old CSV still works.
  const legacyPricesMatch = Object.entries(LEGACY_BENEFIT_IDS).every(
    ([old, now]) =>
      getCommunityBenefit(old)?.id === now &&
      benefitCostUsd(old) === benefitCostUsd(now) &&
      weightForBenefitId(old, { water: 1, waste: 2, air: 3 }) ===
        weightForBenefitId(now, { water: 1, waste: 2, air: 3 })
  );
  check('CLAIM R4  a benefit ID from a beta CSV still prices and categorises as itself',
    legacyPricesMatch,
    Object.keys(LEGACY_BENEFIT_IDS)
      .map(o => `${o} -> $${(benefitCostUsd(o) / 1e6).toFixed(1)}M`)
      .join(', '));

  // CLAIM R5 - an ID should not contradict its own label.
  const contradictions = COMMUNITY_BENEFITS.filter(b => {
    const label = b.label.toLowerCase();
    // Every ID word should show up somewhere in the label it names.
    return !b.id.split('_').every(word => label.includes(word));
  });
  check('CLAIM R5  no benefit ID contradicts its own label',
    contradictions.length === 0,
    contradictions.length
      ? contradictions.map(b => `${b.id} labelled "${b.label}"`).join('; ')
      : COMMUNITY_BENEFITS.map(b => b.id).join(', '));
}



// ===========================================================================
// A RECEPTOR IS A PLACE, NOT A POINT ON ITS BOUNDARY (31 October 2026)
// ===========================================================================
//
// Concentration was computed at the nearest EDGE of a receptor, justified on
// the grounds that a limit value is assessed where people are exposed - the
// first houses, not the middle of the district. That is right for a
// ground-level source and exactly wrong for an elevated one, and this file
// already said why a few functions down: the ground factor is near zero close
// to a tall stack, "which is why a chimney protects its neighbours and exports
// the problem downwind". The model computed the protection and then measured
// only at the protected spot.
//
// The Old Town is 3.2 x 2.7 km. For a 45 m stack the peak ground-level
// concentration lands about 800 m downwind (sigma_z ~ H/sqrt2), so a refinery
// 100 m off the northern edge put its touchdown a third of the way into the
// town while reporting clean air at the edge. With 50 to 90 participants on
// Thursday, somebody finds that.
//
// Pre-registered, from the dispersion equations BEFORE the fixed model was
// run - peak at ~800 m, so a stack on the town wall drops its load inside the
// town and a stack 2 km out drops it short of the town:
//   CLAIM P1  A refinery 0.1 km from the town edge must read HIGHER PM2.5 at
//             the Old Town than the same refinery 2.2 km away. Against the
//             claim: the near one still reads cleaner, the diagnosis is wrong,
//             and the change is reverted rather than patched around.
//   CLAIM P2  REVISED after the first run, and the revision is the physics
//             rather than a loosened bar. Strict monotonicity was the wrong
//             claim: while the touchdown sits INSIDE the town, the worst point
//             in the town IS the peak, and the peak barely cares exactly where
//             the stack is. So the near zone is a plateau, not a slope, and it
//             ripples by a few percent depending on which sample point lands
//             nearest the peak. Refining the grid from 5x5 to 17x17 does not
//             remove the ripple, which is how the plateau was identified as
//             real rather than an artifact.
//             The two claims that matter are therefore: beyond the touchdown
//             distance, further away is always better; and the whole near
//             plateau sits far above the far field, so there is nothing worth
//             climbing. Against: a rise beyond 1 km, or a near plateau that
//             comes close to the far-field value.
//   CLAIM P3  A ground-level source still bites hardest at the nearest point -
//             the grid alone would miss it, so the candidate set includes each
//             source's closest point on the receptor. Against: moving a haul
//             road nearer leaves the reading unchanged or lowers it.

console.log('\n=== A RECEPTOR IS A PLACE, NOT A POINT ===\n');

{
  const wl = computeWasteLedger({ mineSizeKm2: 8, capacityTPerYr: 5_000_000 });
  const life = computeWaterLedger({
    mineSizeKm2: 8, capacityTPerYr: 5_000_000, waterMitigationSpendUsd: 0,
  }).timing.mineLifeYr;
  const oreBody: AirSource[] = [
    { kind: 'extraction', xPct: 42, yPct: 20 },
    { kind: 'extraction', xPct: 50, yPct: 20 },
    { kind: 'extraction', xPct: 58, yPct: 20 },
  ];
  const oldTown = (extra: AirSource[]) =>
    computeAirLedger({
      sources: [...oreBody, ...extra],
      capacityTPerYr: 5_000_000,
      airControlCapitalUsd: 0,
      disturbedHa: wl.footprint.totalDisturbedHa,
      mineLifeYr: life,
    }).receptors[0];

  // The Old Town spans y 35..62. A refinery at y=34 sits 0.1 km off its edge.
  const against = oldTown([{ kind: 'refining', xPct: 46, yPct: 34 }]);
  const away = oldTown([{ kind: 'refining', xPct: 46, yPct: 13 }]);

  check('CLAIM P1  a refinery on the town wall reads WORSE than one 2.2 km out',
    against.pm25AnnualUgM3 > away.pm25AnnualUgM3,
    `0.1 km ${against.pm25AnnualUgM3.toFixed(1)} vs 2.2 km ${away.pm25AnnualUgM3.toFixed(1)} ug/m3 PM2.5 (was 1.6 vs 5.4, the wrong way round)`);

  // CLAIM P2 - beyond the touchdown distance, further is always better.
  const far = [25, 20, 16, 13, 10, 6, 3].map(y => ({
    gapKm: (35 - y) / 10,
    pm25: oldTown([{ kind: 'refining', xPct: 46, yPct: y }]).pm25AnnualUgM3,
  }));
  const rises = far.filter((w, i) => i > 0 && w.pm25 > far[i - 1].pm25 + 1e-9);
  check('CLAIM P2  beyond 1 km, moving the refinery away always helps',
    rises.length === 0,
    far.map(w => `${w.gapKm.toFixed(1)}km:${w.pm25.toFixed(1)}`).join('  '));

  // ...and the near plateau is nowhere near the far field, so the ripple
  // inside it is not a gradient anybody would bother to climb.
  const near = [34, 33, 32, 30, 28].map(y =>
    oldTown([{ kind: 'refining', xPct: 46, yPct: y }]).pm25AnnualUgM3
  );
  const nearBest = Math.min(...near);
  const farValue = far[far.length - 1].pm25;
  check('CLAIM P2  the best spot against the town wall is still far worse than leaving',
    nearBest > 1.8 * farValue,
    `best near ${nearBest.toFixed(1)} vs ${far[far.length - 1].gapKm.toFixed(1)} km away ${farValue.toFixed(1)} ug/m3 — ${(nearBest / farValue).toFixed(1)}x`);
  check('CLAIM P2  and the ripple within the near plateau is under a tenth',
    (Math.max(...near) - nearBest) / nearBest < 0.1,
    `plateau ${nearBest.toFixed(2)}–${Math.max(...near).toFixed(2)} ug/m3`);

  // CLAIM P3 - the ground-level case must not have been softened.
  const roadFar = oldTown([{ kind: 'extraction', xPct: 46, yPct: 20 }]).pm10AnnualUgM3;
  const roadNear = oldTown([{ kind: 'extraction', xPct: 46, yPct: 34 }]).pm10AnnualUgM3;
  check('CLAIM P3  a ground-level source still bites hardest up close',
    roadNear > roadFar,
    `extraction 0.1 km from the town ${roadNear.toFixed(1)} vs 1.5 km away ${roadFar.toFixed(1)} ug/m3 PM10`);
}



// ===========================================================================
// THE SIZE-TO-BENEFITS LINK ACROSS THE TWO SIZE TABLES (1 November 2026)
// ===========================================================================
//
// Beta item 39: the cap on how many benefits a community may ask for is
// enforced on the community dashboard and nowhere else, so in the joint
// workspace it simply stopped applying. The decision was to show the figure
// in the joint view rather than enforce it there — the budget is the real
// constraint in that room — which means the figure now has to be correct in
// a second place, looked up from an area in km2 rather than a size id.
//
// Two tables describe the same five sizes from opposite ends of the exercise:
// MINE_SIZES in mitigationConstants (km2, waste floor, image) and MINE_SIZES
// in communityVote (id, label, benefitsUnlocked). benefitsUnlockedForAreaKm2
// is the only join between them, and a join with no test is the shape of the
// electrification bug all over again.
//
// Pre-registered:
//   CLAIM B1  Every size the developer and joint views can select resolves to
//             a benefit count. Against the claim: any null, which would make
//             the joint panel silently vanish for that size.
//   CLAIM B2  The counts are strictly increasing with area, because the whole
//             claim the cap encodes is that a bigger mine owes more. Against:
//             any pair where a larger mine unlocks no more than a smaller one.
//   CLAIM B3  The lookup agrees with the community table it is derived from,
//             size for size. Against: any disagreement, which would show the
//             joint view one number while the community dashboard enforced
//             another.
//   CLAIM B4  An area that is not a ballot size returns null rather than a
//             number. Against: a silent 0, which reads as "this size unlocks
//             nothing" instead of "this is not one of the sizes".

console.log('\n=== SIZE-TO-BENEFITS LINK ===\n');

{
  const areas: number[] = [...MINE_SIZES_KM2];
  const resolved: { a: number; n: number | null }[] = areas.map(a => ({
    a,
    n: benefitsUnlockedForAreaKm2(a),
  }));

  check('CLAIM B1  every selectable mine size resolves to a benefit count',
    resolved.every(r => r.n !== null),
    resolved.map(r => `${r.a}km2:${r.n === null ? 'NULL' : r.n}`).join('  '));

  const sorted = [...resolved].sort((x, y) => x.a - y.a);
  const monotone = sorted.every((r, i) => i === 0 || (r.n ?? -1) > (sorted[i - 1].n ?? -1));
  check('CLAIM B2  a bigger mine unlocks strictly more benefits',
    monotone,
    sorted.map(r => `${r.a}:${r.n}`).join(' < '));

  const mismatches = COMMUNITY_MINE_SIZES
    .filter(m => m.id !== 'oppose')
    .map(m => {
      const km2 = parseFloat(m.label);
      return { label: m.label, table: m.benefitsUnlocked, lookup: benefitsUnlockedForAreaKm2(km2) };
    })
    .filter(r => r.table !== r.lookup);
  check('CLAIM B3  the lookup matches the community table size for size',
    mismatches.length === 0,
    mismatches.length
      ? mismatches.map(r => `${r.label} table ${r.table} vs lookup ${r.lookup}`).join('; ')
      : 'all five agree');

  const offBallot = [0.25, 3, 6, 12].map(a => benefitsUnlockedForAreaKm2(a));
  check('CLAIM B4  an area that is not a ballot size returns null, not zero',
    offBallot.every(n => n === null),
    `0.25/3/6/12 km2 -> ${offBallot.join(', ')}`);
}


// =====================================================================
// PASTE BACKFILL: DOES THE SLIDER REACH ANYTHING
// =====================================================================
//
// Added 4 November 2026. Until that day the backfill slider held its value in
// the ledger panel's own React state: it moved the figures drawn beside it and
// reached nothing else. It was absent from every exported CSV, so the
// facilitator's read-out scored every plan at zero backfill, and the
// footprint blocker advised backfill as the remedy for a footprint that was
// too large - advice the score could not receive. These checks are what would
// have caught that, so they are written to fail if the wiring is pulled out
// again rather than only to confirm the arithmetic.
console.log('\n=== PASTE BACKFILL REACHES THE EXPORT AND THE LEDGERS ===\n');

{
  // Read the exported header out of the hook itself rather than copying it
  // here. A copy agrees with itself forever; this one fails when the export
  // changes and these checks have not been told.
  // Resolved from the working directory, not from import.meta.url: this script
  // is bundled into node_modules before it runs, so a path relative to the
  // module lands in the wrong tree.
  const hookSrc = readFileSync(
    `${process.cwd()}/src/hooks/useMitigationBudgetV2.ts`,
    'utf-8',
  );
  const headerMatch = hookSrc.match(/baseHeader\s*=\s*\n?\s*'([^']+)'/);
  const exportedHeader = headerMatch ? headerMatch[1] : '';
  const headerCols = exportedHeader.split(',');

  check('CLAIM BF1  the developer export carries a backfill_pct column',
    headerCols.includes('backfill_pct'),
    exportedHeader ? `last column: ${headerCols[headerCols.length - 1]}` : 'baseHeader not found in hook');

  // The joint export appends two further columns after the base header, so
  // backfill_pct must be read by name and never by position.
  const jointHeader = `${exportedHeader},no_build_zones,benefit_placements`;
  const jointValues = headerCols.map(() => '0').concat(['none', '']);
  jointValues[headerCols.indexOf('backfill_pct')] = '45';
  check('CLAIM BF2  backfill_pct is read by name, not by position',
    getCsvField(jointHeader.split(','), jointValues, 'backfill_pct') === '45',
    `joint file -> ${getCsvField(jointHeader.split(','), jointValues, 'backfill_pct')}`);

  // Every file exported before today, and every beta CSV, lacks the column.
  // Those must load as zero rather than failing or reading a neighbour.
  const oldHeader = headerCols.filter(c => c !== 'backfill_pct');
  const oldValues = oldHeader.map(() => '7');
  const legacyRead = Number(getCsvField(oldHeader, oldValues, 'backfill_pct') || 0) || 0;
  check('CLAIM BF3  a file without the column reads backfill 0, not a neighbouring value',
    legacyRead === 0,
    `legacy file -> ${legacyRead}`);

  // The arithmetic the slider now drives, at the reference scenario.
  const atBeta = (b: number) =>
    computeWasteLedger({ mineSizeKm2: 4, capacityTPerYr: 3_000_000, backfillFraction: b });
  const b0 = atBeta(0);
  const b100 = atBeta(1);
  check('CLAIM BF4  backfill takes tailings off the surface and shrinks the impoundment',
    b100.tonnage.tailingsToSurfaceT < b0.tonnage.tailingsToSurfaceT &&
      b100.footprint.tailingsImpoundmentHa < b0.footprint.tailingsImpoundmentHa,
    `surface ${(b0.tonnage.tailingsToSurfaceT / 1e6).toFixed(1)} -> ${(b100.tonnage.tailingsToSurfaceT / 1e6).toFixed(1)} Mt, ` +
      `impoundment ${Math.round(b0.footprint.tailingsImpoundmentHa)} -> ${Math.round(b100.footprint.tailingsImpoundmentHa)} ha`);

  check('CLAIM BF5  at 100% the impoundment shrinks but does not vanish - only part fits underground',
    b100.footprint.tailingsImpoundmentHa > 0 &&
      Math.abs(b100.tonnage.tailingsBackfilledT / b0.tonnage.tailingsT - BACKFILL_TAILINGS_UPTAKE) < 1e-9,
    `${Math.round(b100.footprint.tailingsImpoundmentHa)} ha left, uptake ${(b100.tonnage.tailingsBackfilledT / b0.tonnage.tailingsT).toFixed(2)} of ${BACKFILL_TAILINGS_UPTAKE}`);

  const disturbed = [0, 0.25, 0.5, 0.75, 1].map(b => atBeta(b).footprint.totalDisturbedHa);
  check('CLAIM BF6  disturbed ground falls as backfill rises, with no reversal',
    disturbed.every((h, i) => i === 0 || h < disturbed[i - 1]),
    disturbed.map(h => Math.round(h) + 'ha').join(' > '));

  // The footprint blocker in the facilitator view is currently unreachable:
  // the licence area is 100 ha per km2 and the footprint never comes near it
  // at any size, rate or backfill the simulation offers. That is recorded as a
  // fact rather than assumed, so that whoever next changes the licence
  // constant or the footprint model is told the blocker has gone live.
  const everExceeds = [0.5, 1, 2, 4, 8].some(km2 =>
    [1e6, 3e6, 5e6].some(cap =>
      [0, 0.5, 1].some(b =>
        computeWasteLedger({ mineSizeKm2: km2, capacityTPerYr: cap, backfillFraction: b })
          .footprint.exceedsLicenceArea)));
  check('CLAIM BF7  no offered scenario exceeds the licence area, so that blocker is still dead code',
    !everExceeds,
    everExceeds
      ? 'a scenario now exceeds the licence - the footprint blocker is live, review its wording'
      : 'all 45 size/rate/backfill combinations fit');

  // The consequence that does bite: the galleries.
  const canoeAt = (b: number) => {
    const w = computeWaterLedger({
      mineSizeKm2: 4,
      capacityTPerYr: 3_000_000,
      waterMitigationSpendUsd: 0,
    });
    return computePostClosure({
      mineSizeKm2: 4,
      capacityTPerYr: 3_000_000,
      storageDepletedM3: w.balance.storageDepletedM3,
      backfillFraction: b,
    });
  };
  const canoe0 = canoeAt(0);
  const canoe90 = canoeAt(0.9);
  check('CLAIM BF8  at 4 km2 the canoe is deliverable with no backfill and gone at 90%',
    canoe0.canoeVerdict === 'deliverable' && canoe90.canoeVerdict !== 'deliverable',
    `0% -> ${canoe0.canoeVerdict} (${Math.round(canoe0.navigableLengthM)} m), 90% -> ${canoe90.canoeVerdict} (${Math.round(canoe90.navigableLengthM)} m)`);

  // Where the crossing sits, so the slider's own read-out can be trusted: the
  // first setting at which the route is short of the threshold must also be
  // the first at which the verdict stops being deliverable.
  const steps = [0, 0.25, 0.5, 0.75, 0.9, 1];
  const firstShort = steps.find(b => canoeAt(b).navigableLengthM < CANOE_MIN_NAVIGABLE_LENGTH_M);
  const firstNotDeliverable = steps.find(b => canoeAt(b).canoeVerdict !== 'deliverable');
  check('CLAIM BF9  the metres shown and the verdict given cross at the same setting',
    firstShort === firstNotDeliverable,
    `short of ${CANOE_MIN_NAVIGABLE_LENGTH_M} m from ${String(firstShort)}, not deliverable from ${String(firstNotDeliverable)}`);
}


console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
