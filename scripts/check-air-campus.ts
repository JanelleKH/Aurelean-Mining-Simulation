/**
 * scripts/check-air-campus.ts — pre-registered checks for the 24 October 2026
 * fixes: University Campus restored as a no-go zone, and the air ledger made a
 * function of where facilities are sited.
 *
 * Run: npm run check:fixes
 */

import {
  NO_BUILD_AREAS,
  normalizeNoBuildId,
  getNoBuildAreaLabel,
} from '../src/data/noBuildAreas.ts';
import { NO_BUILD_ZONE_RECTS, isPointInNoBuildZone } from '../src/components/map/noBuildZones.ts';
import {
  computeAirLedger,
  computeWasteLedger,
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

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
