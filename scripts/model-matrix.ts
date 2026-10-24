/**
 * scripts/model-matrix.ts — harness for the water ledger and post-closure model.
 * Run: npm run model
 *
 * The assertions at the bottom are the point: they state in advance what the
 * model has to do to be worth keeping, so a bad calibration fails loudly instead
 * of producing plausible-looking numbers.
 */

import {
  AQUIFER_RECHARGE_M3_PER_D,
  AQUIFER_TRANSMISSIVITY_HIGH_M2_PER_D,
  CAPACITIES_T_PER_YR,
  COMPARTMENT_BREACH_AREA_KM2,
  MINE_SIZES_KM2,
  ORE_T_PER_KM2,
  computePostClosure,
  computeWaterLedger,
  grossDewateringM3PerDay,
  pumpingDurationDays,
  theisDrawdownM,
  wellFunction,
} from '../src/model/index.ts';

const SPEND = [300_000, 2_300_000, 4_300_000, 6_300_000, 8_300_000, 10_300_000];
const MIN_SPEND = 300_000;
const REF_CAP = 3_000_000;

const usd = (n: number | null) =>
  n === null ? 'impossible' : '$' + (n / 1_000_000).toFixed(2) + 'M';
const mm3 = (n: number) => (n / 1_000_000).toFixed(2) + ' Mm3';
const at = (km2: number, spend = MIN_SPEND, cap = REF_CAP) =>
  computeWaterLedger({ mineSizeKm2: km2, capacityTPerYr: cap, waterMitigationSpendUsd: spend });

/* ---------------------------------------------------------------- *
 * 0. Sanity: the well function against published values
 * ---------------------------------------------------------------- */
console.log('\n=== W(u) against published Theis well-function values ===\n');
for (const [u, expected] of [
  [1e-5, 10.9357],
  [1e-3, 6.3315],
  [1e-1, 1.8229],
  [1.0, 0.2194],
  [5.0, 0.001148],
] as [number, number][]) {
  const got = wellFunction(u);
  const err = Math.abs(got - expected) / expected;
  console.log(
    `  u=${u.toExponential(0).padStart(6)}  W=${got.toFixed(5).padStart(10)}  ` +
      `published ${expected.toFixed(5).padStart(10)}  rel.err ${(100 * err).toFixed(4)}%`,
  );
}

/* ---------------------------------------------------------------- *
 * 1. The water balance — the honest centre of it
 * ---------------------------------------------------------------- */
console.log('\n=== WATER BALANCE (capacity 3.0 Mt/yr, minimum spend) ===');
console.log(`Aquifer recharge: ${AQUIFER_RECHARGE_M3_PER_D.toFixed(0)} m3/d\n`);
console.log('size  capture   gross m3/d   net m3/d   x recharge   life yr   storage spent');
for (const km2 of MINE_SIZES_KM2) {
  const L = at(km2);
  console.log(
    `${km2.toFixed(1).padStart(4)}  ${(100 * L.mitigation.aquiferCaptureFraction).toFixed(1).padStart(6)}%  ` +
      `${L.mitigation.grossDewateringM3PerDay.toFixed(0).padStart(10)}  ` +
      `${L.mitigation.netDewateringM3PerDay.toFixed(0).padStart(9)}  ` +
      `${L.balance.multipleOfRecharge.toFixed(2).padStart(10)}   ` +
      `${L.timing.mineLifeYr.toFixed(1).padStart(7)}   ` +
      `${mm3(L.balance.storageDepletedM3).padStart(12)}`,
  );
}

/* ---------------------------------------------------------------- *
 * 2. The equation change: what the old steady-state model said
 * ---------------------------------------------------------------- */
console.log('\n=== OLD EQUATION vs NEW (cistern drawdown, m, barrier ignored) ===\n');
console.log('size   Thiem (steady, old)   Theis (transient, new)   ratio');
for (const km2 of MINE_SIZES_KM2) {
  const L = at(km2);
  const theis = theisDrawdownM(
    L.mitigation.netDewateringM3PerDay,
    2000,
    pumpingDurationDays(km2 * ORE_T_PER_KM2, REF_CAP),
  );
  console.log(
    `${km2.toFixed(1).padStart(4)}   ${L.referenceSteadyStateCisternDrawdownM.toFixed(2).padStart(19)}   ` +
      `${theis.toFixed(2).padStart(22)}   ${(theis / L.referenceSteadyStateCisternDrawdownM).toFixed(2)}x`,
  );
}

/* ---------------------------------------------------------------- *
 * 3. The honest result with no compartment barrier
 * ---------------------------------------------------------------- */
console.log('\n=== NO BARRIER: the physically unmitigated result ===\n');
console.log('size   cistern s   verdict   cost to avert     wells s   verdict   cost to avert');
for (const km2 of MINE_SIZES_KM2) {
  const L = computeWaterLedger({
    mineSizeKm2: km2,
    capacityTPerYr: REF_CAP,
    waterMitigationSpendUsd: MIN_SPEND,
    overrideCisternShielded: false,
  });
  const c = L.receptors[0];
  const w = L.receptors[1];
  console.log(
    `${km2.toFixed(1).padStart(4)}   ${c.drawdownM.toFixed(2).padStart(9)}   ${c.verdict.padEnd(7)}   ` +
      `${usd(c.spendToSaveUsd).padStart(13)}   ${w.drawdownM.toFixed(2).padStart(9)}   ` +
      `${w.verdict.padEnd(7)}   ${usd(w.spendToSaveUsd).padStart(13)}`,
  );
}

/* ---------------------------------------------------------------- *
 * 4. With the compartment proposal
 * ---------------------------------------------------------------- */
console.log(`\n=== WITH COMPARTMENT BARRIER (breach above ${COMPARTMENT_BREACH_AREA_KM2} km2) ===\n`);
console.log('size   shielded   cistern s   verdict   cost to avert');
for (const km2 of MINE_SIZES_KM2) {
  const c = at(km2).receptors[0];
  console.log(
    `${km2.toFixed(1).padStart(4)}   ${(c.shieldedByBarrier ? 'yes' : 'NO').padStart(8)}   ` +
      `${c.drawdownM.toFixed(2).padStart(9)}   ${c.verdict.padEnd(7)}   ${usd(c.spendToSaveUsd)}`,
  );
}

/* ---------------------------------------------------------------- *
 * 5. Time now matters: a slower mine pumps for longer
 * ---------------------------------------------------------------- */
console.log('\n=== TIME: same reserve, different rate (4 km2, barrier ignored) ===\n');
console.log('capacity Mt/yr   life yr   Taylor yr   plausible   cistern s   verdict');
for (const cap of CAPACITIES_T_PER_YR) {
  const L = computeWaterLedger({
    mineSizeKm2: 4.0,
    capacityTPerYr: cap,
    waterMitigationSpendUsd: MIN_SPEND,
    overrideCisternShielded: false,
  });
  const c = L.receptors[0];
  console.log(
    `${(cap / 1e6).toFixed(1).padStart(14)}   ${L.timing.mineLifeYr.toFixed(1).padStart(7)}   ` +
      `${L.timing.taylorLifeYr.toFixed(1).padStart(9)}   ${(L.timing.plausibleMinePlan ? 'yes' : 'NO').padStart(9)}   ` +
      `${c.drawdownM.toFixed(2).padStart(9)}   ${c.verdict}`,
  );
}

/* ---------------------------------------------------------------- *
 * 6. Transmissivity sensitivity
 * ---------------------------------------------------------------- */
console.log('\n=== SENSITIVITY to transmissivity (cistern drawdown, m, barrier ignored) ===\n');
console.log(`size   T=1000 (used)   T=${AQUIFER_TRANSMISSIVITY_HIGH_M2_PER_D} (upper range)`);
for (const km2 of MINE_SIZES_KM2) {
  const t = pumpingDurationDays(km2 * ORE_T_PER_KM2, REF_CAP);
  const q = grossDewateringM3PerDay(km2);
  console.log(
    `${km2.toFixed(1).padStart(4)}   ${theisDrawdownM(q, 2000, t).toFixed(2).padStart(13)}   ` +
      `${theisDrawdownM(q, 2000, t, AQUIFER_TRANSMISSIVITY_HIGH_M2_PER_D).toFixed(2).padStart(20)}`,
  );
}

/* ---------------------------------------------------------------- *
 * 7. Can spend save the cistern once the barrier is breached?
 * ---------------------------------------------------------------- */
console.log('\n=== Does money help after a breach? (cistern drawdown, m; tolerance 1.20) ===\n');
process.stdout.write('size  ');
for (const s of SPEND) process.stdout.write(('$' + (s / 1e6).toFixed(1) + 'M').padStart(9));
console.log('');
for (const km2 of [4.0, 8.0]) {
  process.stdout.write(km2.toFixed(1).padStart(4) + '  ');
  for (const spend of SPEND) {
    const c = at(km2, spend).receptors[0];
    process.stdout.write((c.drawdownM.toFixed(2) + (c.verdict === 'lost' ? '*' : ' ')).padStart(9));
  }
  console.log('');
}
console.log('  * = cistern dry');

/* ---------------------------------------------------------------- *
 * 8. The canoe and the backfill conflict (unchanged)
 * ---------------------------------------------------------------- */
console.log('\n=== CANOE vs BACKFILL (4 km2, 3.0 Mt/yr) ===\n');
console.log('backfill   navigable m   verdict            subsidence   capital    recurring/yr   PV50');
{
  const L = at(4.0);
  for (const beta of [0, 0.25, 0.5, 0.75, 0.9, 1.0]) {
    const pc = computePostClosure({
      mineSizeKm2: 4.0,
      capacityTPerYr: REF_CAP,
      drawdownAtWorkingsM: L.drawdownAtWorkingsM,
      backfillFraction: beta,
    });
    console.log(
      `${(beta * 100).toFixed(0).padStart(7)}%   ${pc.navigableLengthM.toFixed(0).padStart(11)}   ` +
        `${pc.canoeVerdict.padEnd(17)}  ${pc.subsidenceIndex.toFixed(3).padStart(10)}   ` +
        `${usd(pc.canoeCost.capitalUsd).padStart(8)}   ${usd(pc.canoeCost.annualRecurringUsd).padStart(12)}   ${usd(pc.canoeCost.recurringPvUsd)}`,
    );
  }
}

console.log('\n=== CANOE: when does it open? (backfill 0%, 3.0 Mt/yr) ===\n');
console.log('size   life yr   rebound yr   navigable m   verdict            PV50');
for (const km2 of MINE_SIZES_KM2) {
  const L = at(km2);
  const pc = computePostClosure({
    mineSizeKm2: km2,
    capacityTPerYr: REF_CAP,
    drawdownAtWorkingsM: L.drawdownAtWorkingsM,
    backfillFraction: 0,
  });
  console.log(
    `${km2.toFixed(1).padStart(4)}   ${pc.mineLifeYr.toFixed(1).padStart(7)}   ` +
      `${pc.yearsToNavigableAfterClosure.toFixed(1).padStart(10)}   ${pc.navigableLengthM.toFixed(0).padStart(11)}   ` +
      `${pc.canoeVerdict.padEnd(17)}  ${usd(pc.canoeCost.recurringPvUsd)}`,
  );
}

/* ---------------------------------------------------------------- *
 * 9. Pre-registered checks
 * ---------------------------------------------------------------- */
console.log('\n=== PRE-REGISTERED CHECKS ===\n');

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
};

// (a) The well function must match published tables, or nothing below is meaningful.
{
  const ok = Math.abs(wellFunction(1e-3) - 6.3315) / 6.3315 < 0.001;
  check('well function matches published Theis tables', ok, `W(1e-3)=${wellFunction(1e-3).toFixed(4)}`);
}

// (b) Monotone in size.
{
  let mono = true;
  let prev = -1;
  for (const km2 of MINE_SIZES_KM2) {
    const d = computeWaterLedger({
      mineSizeKm2: km2, capacityTPerYr: REF_CAP, waterMitigationSpendUsd: MIN_SPEND,
      overrideCisternShielded: false,
    }).receptors[0].drawdownM;
    if (d < prev) mono = false;
    prev = d;
  }
  check('drawdown is monotone increasing in mine size', mono);
}

// (c) Monotone in spend.
{
  let mono = true;
  let prev = Number.POSITIVE_INFINITY;
  for (const spend of SPEND) {
    const d = at(8.0, spend).receptors[0].drawdownM;
    if (d > prev) mono = false;
    prev = d;
  }
  check('drawdown is monotone decreasing in mitigation spend', mono);
}

// (d) The honest finding: pumping exceeds recharge above the smallest mine. If
//     this failed, the move to a transient solution was unnecessary.
{
  const small = at(0.5).balance.multipleOfRecharge;
  const rest = MINE_SIZES_KM2.slice(1).every(k => at(k).balance.spendingStorage);
  check('every scenario above the smallest spends aquifer storage', rest,
    `0.5 km2 at ${small.toFixed(2)}x recharge`);
}

// (e) Theis must exceed Thiem over these durations. If not, the old equation was
//     not understating the harm and the rebuild changed nothing.
{
  const L = at(8.0);
  const theis = theisDrawdownM(L.mitigation.netDewateringM3PerDay, 2000,
    pumpingDurationDays(8 * ORE_T_PER_KM2, REF_CAP));
  check('transient drawdown exceeds the old steady-state figure',
    theis > L.referenceSteadyStateCisternDrawdownM,
    `${theis.toFixed(2)} m vs ${L.referenceSteadyStateCisternDrawdownM.toFixed(2)} m`);
}

// (f) Recorded honestly: with no barrier the cistern is lost everywhere. This is
//     the result that went against the earlier calibration.
{
  const all = MINE_SIZES_KM2.every(k => computeWaterLedger({
    mineSizeKm2: k, capacityTPerYr: REF_CAP, waterMitigationSpendUsd: MIN_SPEND,
    overrideCisternShielded: false,
  }).receptors[0].verdict === 'lost');
  check('WITHOUT a compartment barrier the cistern is lost in every scenario', all,
    'the honest unmitigated result');
}

// (g) The compartment proposal must restore an interior, or it is not worth having.
{
  const below = MINE_SIZES_KM2.filter(k => k <= COMPARTMENT_BREACH_AREA_KM2)
    .every(k => at(k).receptors[0].verdict !== 'lost');
  const above = MINE_SIZES_KM2.filter(k => k > COMPARTMENT_BREACH_AREA_KM2)
    .every(k => at(k).receptors[0].verdict === 'lost');
  check('WITH a barrier the cistern survives at or below the breach area and is lost above',
    below && above, `breach at ${COMPARTMENT_BREACH_AREA_KM2} km2`);
}

// (h) And a breach must not be purchasable away, or irreplaceability is empty.
{
  const r = at(8.0).receptors[0];
  check('once breached, no spend saves the cistern', r.spendToSaveUsd === null,
    `cost=${usd(r.spendToSaveUsd)}`);
}

// (i) The new coupling: a slower mine pumps longer and draws down more. This is
//     what gives the developer's capacity choice a lever on the cistern.
{
  const fast = computeWaterLedger({
    mineSizeKm2: 4.0, capacityTPerYr: 5_000_000, waterMitigationSpendUsd: MIN_SPEND,
    overrideCisternShielded: false,
  }).receptors[0].drawdownM;
  const slow = computeWaterLedger({
    mineSizeKm2: 4.0, capacityTPerYr: 1_500_000, waterMitigationSpendUsd: MIN_SPEND,
    overrideCisternShielded: false,
  }).receptors[0].drawdownM;
  check('a slower mine on the same reserve causes more drawdown', slow > fast,
    `1.5 Mt/yr ${slow.toFixed(2)} m vs 5 Mt/yr ${fast.toFixed(2)} m`);
}

// (j) Dewatering must dominate withdrawal for an underground mine in karst.
{
  const L = computeWaterLedger({
    mineSizeKm2: 4.0, capacityTPerYr: 5_000_000, waterMitigationSpendUsd: MIN_SPEND,
  });
  check('dewatering dominates total withdrawal',
    L.volumes.dewateringWithdrawal > L.volumes.processWithdrawal,
    `${mm3(L.volumes.dewateringWithdrawal)} vs ${mm3(L.volumes.processWithdrawal)}`);
}

// (k) Some offered size-and-rate pairs are not mine plans. The model should know.
{
  const implausible = MINE_SIZES_KM2.flatMap(k =>
    CAPACITIES_T_PER_YR.map(c => computeWaterLedger({
      mineSizeKm2: k, capacityTPerYr: c, waterMitigationSpendUsd: MIN_SPEND,
    }).timing.plausibleMinePlan),
  ).filter(p => !p).length;
  check('the Taylor check flags implausible size-and-rate pairs', implausible > 0,
    `${implausible} of 20 pairs implausible`);
}

// (l) No total. The ledger must not expose an aggregate across dimensions.
{
  const keys = Object.keys(at(4.0) as unknown as Record<string, unknown>);
  const hasScore = keys.some(k => /score|utility|^total$/i.test(k));
  check('ledger exposes no cross-dimension score', !hasScore, keys.join(','));
}

// (m) The canoe must be cheap to build and expensive to keep.
{
  const L = at(4.0);
  const pc = computePostClosure({
    mineSizeKm2: 4.0, capacityTPerYr: REF_CAP,
    drawdownAtWorkingsM: L.drawdownAtWorkingsM, backfillFraction: 0,
  });
  const ratio = pc.canoeCost.recurringPvUsd / pc.canoeCost.capitalUsd;
  check('canoe recurring PV exceeds capital by at least 3x', ratio >= 3,
    `ratio=${ratio.toFixed(2)}`);
}

// (n) Backfill must trade the town against the canoe.
{
  const L = at(4.0);
  const open = computePostClosure({
    mineSizeKm2: 4.0, capacityTPerYr: REF_CAP,
    drawdownAtWorkingsM: L.drawdownAtWorkingsM, backfillFraction: 0,
  });
  const filled = computePostClosure({
    mineSizeKm2: 4.0, capacityTPerYr: REF_CAP,
    drawdownAtWorkingsM: L.drawdownAtWorkingsM, backfillFraction: 0.9,
  });
  check('backfill protects the town and removes the canoe',
    open.canoeVerdict === 'deliverable' && filled.canoeVerdict !== 'deliverable'
      && filled.subsidenceIndex < open.subsidenceIndex);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
