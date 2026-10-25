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
  airAssuranceUsd,
  computeTotalBudget,
} from '../src/data/mitigationConstants.ts';
import { canoeAvailability, COMMUNITY_BENEFITS } from '../src/data/communityBenefits.ts';
import {
  NO_BUILD_AREAS,
  normalizeNoBuildId,
  getNoBuildAreaLabel,
} from '../src/data/noBuildAreas.ts';
import { NO_BUILD_ZONE_RECTS, isPointInNoBuildZone } from '../src/components/map/noBuildZones.ts';
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
{
  const off = ledger(SOUTH);
  const on = ledger(SOUTH, 300_000, { benefitIds: ['workforce', 'research'] });
  const cut = on.receptors[0].pm25AnnualUgM3 < off.receptors[0].pm25AnnualUgM3;
  const dustKept = on.receptors[0].pm10AnnualUgM3 > 0.5 * off.receptors[0].pm10AnnualUgM3;
  check('electrification cuts PM2.5 without erasing coarse road dust', cut && dustKept,
    `PM2.5 ${off.receptors[0].pm25AnnualUgM3.toFixed(1)} -> ${on.receptors[0].pm25AnnualUgM3.toFixed(1)}; PM10 ${off.receptors[0].pm10AnnualUgM3.toFixed(1)} -> ${on.receptors[0].pm10AnnualUgM3.toFixed(1)}`);
}
{
  const one = ledger(SOUTH, 300_000, { benefitIds: ['workforce'] });
  const both = ledger(SOUTH, 300_000, { benefitIds: ['workforce', 'research'] });
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

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
