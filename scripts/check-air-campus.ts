/**
 * scripts/check-air-campus.ts — pre-registered checks for the two fixes of
 * 24 October 2026: University Campus restored as a no-go zone, and the air
 * ledger built to match water and waste.
 *
 * Run: node scripts/check-air-campus.ts
 *
 * Each check states in advance what would have to be true for the change to be
 * worth keeping, so a wrong calibration fails loudly rather than producing
 * plausible-looking numbers.
 */

import {
  NO_BUILD_AREAS,
  normalizeNoBuildId,
  getNoBuildAreaLabel,
} from '../src/data/noBuildAreas.ts';
import { NO_BUILD_ZONE_RECTS, isPointInNoBuildZone } from '../src/components/map/noBuildZones.ts';
import { computeAirLedger, computeWasteLedger, mineLifeYr, ORE_T_PER_KM2 } from '../src/model/index.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
};
const usd = (n: number | null) =>
  n === null ? 'unreachable' : '$' + (n / 1_000_000).toFixed(2) + 'M/yr';

/* ================= CAMPUS ================= */
console.log('\n=== UNIVERSITY CAMPUS AS A NO-GO ZONE ===\n');

check('campus is a selectable no-go area',
  NO_BUILD_AREAS.some(a => a.id === 'campus'),
  NO_BUILD_AREAS.filter(a => a.id !== 'none').map(a => a.label).join(', '));

check('campus is no longer silently rewritten to agriculture',
  normalizeNoBuildId('campus') === 'campus',
  `normalizeNoBuildId('campus') = ${normalizeNoBuildId('campus')}`);

check('campus label matches the map legend',
  getNoBuildAreaLabel('campus') === 'University Campus',
  getNoBuildAreaLabel('campus'));

// The purple boundary measured from regional-map.png.
const DRAWN = { left: 67.9, right: 84.8, top: 51.4, bottom: 67.7 };
{
  const r = NO_BUILD_ZONE_RECTS.find(z => z.id === 'campus');
  const ok = !!r
    && r.left >= DRAWN.left - 1 && r.left + r.width <= DRAWN.right + 1
    && r.top >= DRAWN.top - 1 && r.top + r.height <= DRAWN.bottom + 1;
  check('campus rect sits within the boundary drawn on the map', ok,
    r ? `rect x ${r.left}-${r.left + r.width}, y ${r.top}-${r.top + r.height}; drawn x ${DRAWN.left}-${DRAWN.right}, y ${DRAWN.top}-${DRAWN.bottom}` : 'no rect');
}

{
  // A zone that overlaps another would make one no-go selection silently
  // exclude ground belonging to a different zone.
  const campus = NO_BUILD_ZONE_RECTS.filter(z => z.id === 'campus');
  const others = NO_BUILD_ZONE_RECTS.filter(z => z.id !== 'campus');
  const overlaps = campus.flatMap(c => others.filter(o =>
    c.left < o.left + o.width && o.left < c.left + c.width &&
    c.top < o.top + o.height && o.top < c.top + c.height));
  check('campus rect overlaps no other no-go zone', overlaps.length === 0,
    overlaps.map(o => o.id).join(',') || 'none');
}

{
  const cx = 76, cy = 59; // inside the drawn campus
  const inCampus = isPointInNoBuildZone(cx, cy, ['campus']);
  const inOthers = isPointInNoBuildZone(cx, cy, ['mountain', 'oldtown', 'aquifer', 'agriculture']);
  check('a point on the campus is caught by campus and by nothing else',
    inCampus && !inOthers, `campus=${inCampus}, others=${inOthers}`);
}

{
  // Five selectable zones, but at most four may ever be chosen, so the
  // community can never exclude every area at once.
  const selectable = NO_BUILD_AREAS.filter(a => a.id !== 'none').length;
  check('selectable zones now exceed the maximum any mine size allows',
    selectable === 5, `${selectable} zones, max selectable is 4`);
}

/* ================= AIR ================= */
console.log('\n=== AIR LEDGER ===\n');

const waste = computeWasteLedger({ mineSizeKm2: 4, capacityTPerYr: 3_000_000, backfillFraction: 0 });
const life = mineLifeYr(4 * ORE_T_PER_KM2, 3_000_000);
const base = (over: Partial<Parameters<typeof computeAirLedger>[0]> = {}) =>
  computeAirLedger({
    capacityTPerYr: 3_000_000,
    tier: 'processing',
    airControlSpendUsdPerYr: 300_000,
    disturbedHa: waste.footprint.totalDisturbedHa,
    mineLifeYr: life,
    ...over,
  });

console.log('reference case: 4 km2, 3.0 Mt/yr, processing tier, $0.3M/yr control');
{
  const L = base();
  for (const r of L.receptors) {
    console.log(`  ${r.label.padEnd(18)} ${r.distanceM} m   PM10 ${r.pm10AnnualUgM3.toFixed(1).padStart(5)}  (${r.pm10Verdict})   PM2.5 ${r.pm25AnnualUgM3.toFixed(1).padStart(5)}  (${r.pm25Verdict})`);
    console.log(`  ${''.padEnd(18)}   to EU limit ${usd(r.spendToMeetLimitUsdPerYr)};  to WHO guideline ${usd(r.spendToMeetGuidelineUsdPerYr)}`);
  }
  console.log(`  disturbed ground ${waste.footprint.totalDisturbedHa.toFixed(0)} ha, mine life ${life.toFixed(1)} yr`);
}
console.log('');

// (a) Distance must reduce concentration, or siting on the map means nothing.
{
  const L = base();
  const town = L.receptors[0];
  const campus = L.receptors[1];
  check('the farther receptor sees less', campus.pm25AnnualUgM3 < town.pm25AnnualUgM3,
    `old town ${town.pm25AnnualUgM3.toFixed(2)} vs campus ${campus.pm25AnnualUgM3.toFixed(2)} ug/m3`);
}

// (b) Spending more must never make the air worse.
{
  let mono = true, prev = Infinity;
  for (const s of [300_000, 2_000_000, 4_000_000, 8_000_000, 16_000_000]) {
    const v = base({ airControlSpendUsdPerYr: s }).receptors[0].pm25AnnualUgM3;
    if (v > prev + 1e-9) mono = false;
    prev = v;
  }
  check('concentration is monotone decreasing in control spend', mono);
}

// (c) Supply-chain tier must drive air, which is the link Janelle specified.
{
  const e = base({ tier: 'extraction' }).receptors[0].pm25AnnualUgM3;
  const a = base({ tier: 'advanced_manufacturing' }).receptors[0].pm25AnnualUgM3;
  check('a longer supply chain raises PM2.5 at the Old Town', a > e,
    `extraction ${e.toFixed(2)} -> advanced manufacturing ${a.toFixed(2)} ug/m3`);
}

// (d) Electrification must cut diesel and must NOT cut road dust. If PM10 moves,
//     the sources are wrongly lumped and the benefit is doing magic.
{
  const off = base();
  const on = base({ benefitIds: ['workforce', 'research'] });
  const dieselCut = on.controlled.dieselPm25 < off.controlled.dieselPm25;
  const dustSame = Math.abs(on.controlled.haulRoadPm10 - off.controlled.haulRoadPm10) < 1e-9;
  check('electrifying the fleet cuts diesel PM2.5 but not road dust',
    dieselCut && dustSame,
    `diesel ${off.controlled.dieselPm25.toFixed(3)} -> ${on.controlled.dieselPm25.toFixed(3)} g/s; road dust PM10 ${off.controlled.haulRoadPm10.toFixed(3)} -> ${on.controlled.haulRoadPm10.toFixed(3)} g/s`);
}

// (e) Electrification must need BOTH benefits, or the pairing is decorative.
{
  const one = base({ benefitIds: ['workforce'] });
  const both = base({ benefitIds: ['workforce', 'research'] });
  check('electrification requires both benefits, not either',
    !one.inputs.electrified && both.inputs.electrified);
}

// (f) THE CENTRAL CLAIM: air is the dimension money can fix. If the EU limit
//     were unreachable at any spend, that claim is false and the contrast
//     drawn with the cistern in the README collapses.
{
  const worst = base({ tier: 'advanced_manufacturing', capacityTPerYr: 5_000_000 });
  const r = worst.receptors[0];
  check('at the worst scenario the legal limit is still reachable for money',
    r.spendToMeetLimitUsdPerYr !== null,
    `${usd(r.spendToMeetLimitUsdPerYr)} at 5 Mt/yr, advanced manufacturing`);
}

// (g) But it must not be free, or there is nothing to negotiate.
{
  const worst = base({ tier: 'advanced_manufacturing', capacityTPerYr: 5_000_000 });
  const g = worst.receptors[0].spendToMeetGuidelineUsdPerYr;
  check('the health guideline costs more than the legal limit, or is out of reach',
    g === null || g > (worst.receptors[0].spendToMeetLimitUsdPerYr ?? 0),
    `limit ${usd(worst.receptors[0].spendToMeetLimitUsdPerYr)}, guideline ${usd(g)}`);
}

// (h) Wind erosion must tie air to the waste ledger's footprint.
{
  const small = base({ disturbedHa: 50 }).receptors[0].pm10AnnualUgM3;
  const large = base({ disturbedHa: 500 }).receptors[0].pm10AnnualUgM3;
  check('more disturbed ground means more dust', large > small,
    `50 ha ${small.toFixed(2)} -> 500 ha ${large.toFixed(2)} ug/m3`);
}

// (i) Air must be a recurring obligation, not a one-off payment. This is what
//     distinguishes it from every other dimension in the model.
{
  const L = base({ airControlSpendUsdPerYr: 4_000_000 });
  check('control is priced as an annual obligation over the mine life',
    L.obligation.lifetimeUsd > 5 * L.obligation.annualUsd,
    `$${(L.obligation.annualUsd / 1e6).toFixed(1)}M/yr x ${L.obligation.mineLifeYr.toFixed(1)} yr = $${(L.obligation.lifetimeUsd / 1e6).toFixed(0)}M`);
}

// (j) No cross-dimension total, same rule as water and waste.
{
  const keys = Object.keys(base() as unknown as Record<string, unknown>);
  check('air ledger exposes no cross-dimension score',
    !keys.some(k => /score|utility|aqi/i.test(k)), keys.join(','));
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
