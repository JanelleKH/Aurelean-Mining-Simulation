/**
 * scripts/model-matrix.ts — harness for the water ledger and post-closure model.
 *
 * Run: node scripts/model-matrix.ts
 *
 * It prints the full scenario space and then asserts a set of pre-registered
 * properties. The assertions are the point: they state in advance what the
 * model has to do to be worth keeping, so that a bad calibration fails loudly
 * instead of producing plausible-looking numbers.
 */

import {
  CAPACITIES_T_PER_YR,
  MINE_SIZES_KM2,
  computePostClosure,
  computeWaterLedger,
} from '../src/model/index.ts';

const WATER_SPEND_STEPS = [300_000, 2_300_000, 4_300_000, 6_300_000, 8_300_000, 10_300_000];

const usd = (n: number | null) =>
  n === null ? '  impossible' : '$' + (n / 1_000_000).toFixed(2) + 'M';
const m3 = (n: number) => (n / 1_000_000).toFixed(2) + ' Mm3';

/* ---------------------------------------------------------------- *
 * 1. Drawdown and verdicts across size, at minimum mitigation
 * ---------------------------------------------------------------- */
console.log('\n=== WATER LEDGER: drawdown by mine size (capacity 3.0 Mt/yr, minimum water spend) ===\n');
console.log('size   dewater m3/d   cistern s   verdict   save for     wells s   verdict   save for');
for (const size of MINE_SIZES_KM2) {
  const L = computeWaterLedger({
    mineSizeKm2: size,
    capacityTPerYr: 3_000_000,
    waterMitigationSpendUsd: 300_000,
  });
  const c = L.receptors[0];
  const w = L.receptors[1];
  console.log(
    `${size.toFixed(1).padStart(4)}   ${L.mitigation.netDewateringM3PerDay.toFixed(0).padStart(12)}   ` +
      `${c.drawdownM.toFixed(2).padStart(9)}   ${c.verdict.padEnd(7)}   ${usd(c.spendToSaveUsd).padStart(11)}   ` +
      `${w.drawdownM.toFixed(2).padStart(7)}   ${w.verdict.padEnd(7)}   ${usd(w.spendToSaveUsd).padStart(11)}`,
  );
}

/* ---------------------------------------------------------------- *
 * 2. Does mitigation spend save the cistern?
 * ---------------------------------------------------------------- */
console.log('\n=== Can the cistern be bought back? (cistern drawdown, m; tolerance 1.20 m) ===\n');
process.stdout.write('size  ');
for (const s of WATER_SPEND_STEPS) process.stdout.write(('$' + (s / 1e6).toFixed(1) + 'M').padStart(9));
console.log('');
for (const size of MINE_SIZES_KM2) {
  process.stdout.write(size.toFixed(1).padStart(4) + '  ');
  for (const spend of WATER_SPEND_STEPS) {
    const L = computeWaterLedger({
      mineSizeKm2: size,
      capacityTPerYr: 3_000_000,
      waterMitigationSpendUsd: spend,
    });
    const c = L.receptors[0];
    const mark = c.verdict === 'lost' ? '*' : ' ';
    process.stdout.write((c.drawdownM.toFixed(2) + mark).padStart(9));
  }
  console.log('');
}
console.log('  * = cistern dry');

/* ---------------------------------------------------------------- *
 * 3. Withdrawal split: who owns which half of the ledger
 * ---------------------------------------------------------------- */
console.log('\n=== Withdrawal split (water spend $300k, no reinjection) ===\n');
console.log('size  cap Mt/yr   dewatering      process makeup   consumed       to surface');
for (const size of [1.0, 8.0]) {
  for (const cap of CAPACITIES_T_PER_YR) {
    const L = computeWaterLedger({
      mineSizeKm2: size,
      capacityTPerYr: cap,
      waterMitigationSpendUsd: 300_000,
    });
    console.log(
      `${size.toFixed(1).padStart(4)}  ${(cap / 1e6).toFixed(1).padStart(8)}   ` +
        `${m3(L.volumes.dewateringWithdrawal).padStart(12)}   ${m3(L.volumes.processWithdrawal).padStart(14)}   ` +
        `${m3(L.volumes.consumed).padStart(12)}   ${m3(L.volumes.dischargedToSurface).padStart(12)}`,
    );
  }
}

/* ---------------------------------------------------------------- *
 * 4. The canoe and the backfill conflict
 * ---------------------------------------------------------------- */
console.log('\n=== CANOE vs BACKFILL (4 km2, 3.0 Mt/yr) ===\n');
console.log('backfill   navigable m   verdict            subsidence idx   capital    recurring/yr   PV50');
{
  const L = computeWaterLedger({
    mineSizeKm2: 4.0,
    capacityTPerYr: 3_000_000,
    waterMitigationSpendUsd: 300_000,
  });
  for (const beta of [0, 0.25, 0.5, 0.75, 0.9, 1.0]) {
    const pc = computePostClosure({
      mineSizeKm2: 4.0,
      capacityTPerYr: 3_000_000,
      drawdownAtWorkingsM: L.drawdownAtWorkingsM,
      backfillFraction: beta,
    });
    console.log(
      `${(beta * 100).toFixed(0).padStart(7)}%   ${pc.navigableLengthM.toFixed(0).padStart(11)}   ` +
        `${pc.canoeVerdict.padEnd(17)}  ${pc.subsidenceIndex.toFixed(3).padStart(14)}   ` +
        `${usd(pc.canoeCost.capitalUsd).padStart(8)}   ${usd(pc.canoeCost.annualRecurringUsd).padStart(12)}   ${usd(pc.canoeCost.recurringPvUsd)}`,
    );
  }
}

console.log('\n=== CANOE: when does it open, and what does it cost to keep? (backfill 0%) ===\n');
console.log('size  cap   life yr   rebound yr   navigable m   capital    recurring/yr   PV50');
for (const size of MINE_SIZES_KM2) {
  const L = computeWaterLedger({
    mineSizeKm2: size,
    capacityTPerYr: 3_000_000,
    waterMitigationSpendUsd: 300_000,
  });
  const pc = computePostClosure({
    mineSizeKm2: size,
    capacityTPerYr: 3_000_000,
    drawdownAtWorkingsM: L.drawdownAtWorkingsM,
    backfillFraction: 0,
  });
  console.log(
    `${size.toFixed(1).padStart(4)}  3.0   ${pc.mineLifeYr.toFixed(1).padStart(7)}   ` +
      `${pc.yearsToNavigableAfterClosure.toFixed(1).padStart(10)}   ${pc.navigableLengthM.toFixed(0).padStart(11)}   ` +
      `${usd(pc.canoeCost.capitalUsd).padStart(8)}   ${usd(pc.canoeCost.annualRecurringUsd).padStart(12)}   ${usd(pc.canoeCost.recurringPvUsd)}`,
  );
}

/* ---------------------------------------------------------------- *
 * 5. Pre-registered assertions
 * ---------------------------------------------------------------- */
console.log('\n=== PRE-REGISTERED CHECKS ===\n');

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
};

const atSize = (size: number, spend = 300_000) =>
  computeWaterLedger({ mineSizeKm2: size, capacityTPerYr: 3_000_000, waterMitigationSpendUsd: spend });

// (a) Monotonicity. Bigger mine must never mean less drawdown.
{
  let mono = true;
  let prev = -1;
  for (const s of MINE_SIZES_KM2) {
    const d = atSize(s).receptors[0].drawdownM;
    if (d < prev) mono = false;
    prev = d;
  }
  check('drawdown is monotone increasing in mine size', mono);
}

// (b) More mitigation spend must never increase drawdown.
{
  let mono = true;
  let prev = Number.POSITIVE_INFINITY;
  for (const spend of WATER_SPEND_STEPS) {
    const d = atSize(8.0, spend).receptors[0].drawdownM;
    if (d > prev) mono = false;
    prev = d;
  }
  check('drawdown is monotone decreasing in mitigation spend', mono);
}

// (c) The small mine must not already destroy the cistern, or the game has no
//     interior and refusal is the only move. This is the check that would go
//     against my calibration if the dewatering prior is too high.
{
  const v = atSize(0.5).receptors[0].verdict;
  check('cistern survives the 0.5 km2 mine unaided', v === 'safe', `verdict=${v}`);
}

// (d) There must be a size at which money saves the cistern — otherwise the
//     model offers nothing to negotiate.
{
  const r = atSize(4.0).receptors[0];
  const savable = r.verdict === 'lost' && r.spendToSaveUsd !== null;
  check('the 4 km2 mine threatens the cistern but can be bought back', savable,
    `verdict=${r.verdict}, cost=${usd(r.spendToSaveUsd)}`);
}

// (e) And a size at which money does not. If this fails, the irreplaceability
//     claim in the briefings is rhetoric with no arithmetic behind it.
{
  const r = atSize(8.0).receptors[0];
  check('the 8 km2 mine destroys the cistern at any price', r.spendToSaveUsd === null,
    `cost=${usd(r.spendToSaveUsd)}`);
}

// (f) Agriculture must be the replaceable harm: hurt at the top, cheaply saved.
{
  const r = atSize(8.0).receptors[1];
  const ok = r.verdict === 'lost' && r.spendToSaveUsd !== null && r.spendToSaveUsd < 4_000_000;
  check('agricultural wells are harmed at 8 km2 but cheap to save', ok,
    `verdict=${r.verdict}, cost=${usd(r.spendToSaveUsd)}`);
}

// (g) Dewatering must dominate withdrawal for an underground mine in karst.
{
  const L = computeWaterLedger({
    mineSizeKm2: 4.0, capacityTPerYr: 5_000_000, waterMitigationSpendUsd: 300_000,
  });
  check('dewatering dominates total withdrawal',
    L.volumes.dewateringWithdrawal > L.volumes.processWithdrawal,
    `${m3(L.volumes.dewateringWithdrawal)} vs ${m3(L.volumes.processWithdrawal)}`);
}

// (h) No total. The ledger must not expose an aggregate across dimensions.
{
  const L = atSize(4.0);
  const keys = Object.keys(L as unknown as Record<string, unknown>);
  const hasScore = keys.some(k => /score|utility|total(?!Withdrawal)/i.test(k));
  check('ledger exposes no cross-dimension score', !hasScore, keys.join(','));
}

// (i) The canoe must be cheap to build and expensive to keep. This is the
//     claim the whole benefit rests on; if PV of recurring is not well above
//     capital, the benefit is just another priced item and the design argument
//     collapses.
{
  const L = atSize(4.0);
  const pc = computePostClosure({
    mineSizeKm2: 4.0, capacityTPerYr: 3_000_000,
    drawdownAtWorkingsM: L.drawdownAtWorkingsM, backfillFraction: 0,
  });
  const ratio = pc.canoeCost.recurringPvUsd / pc.canoeCost.capitalUsd;
  check('canoe recurring PV exceeds capital by at least 3x', ratio >= 3,
    `ratio=${ratio.toFixed(2)}, capital=${usd(pc.canoeCost.capitalUsd)}, PV=${usd(pc.canoeCost.recurringPvUsd)}`);
}

// (j) Backfill must genuinely trade off: protecting the town must cost the canoe.
{
  const L = atSize(4.0);
  const open = computePostClosure({
    mineSizeKm2: 4.0, capacityTPerYr: 3_000_000,
    drawdownAtWorkingsM: L.drawdownAtWorkingsM, backfillFraction: 0,
  });
  const filled = computePostClosure({
    mineSizeKm2: 4.0, capacityTPerYr: 3_000_000,
    drawdownAtWorkingsM: L.drawdownAtWorkingsM, backfillFraction: 0.9,
  });
  const ok = open.canoeVerdict === 'deliverable'
    && filled.canoeVerdict !== 'deliverable'
    && filled.subsidenceIndex < open.subsidenceIndex;
  check('backfill protects the town and removes the canoe', ok,
    `open=${open.canoeVerdict}/${open.subsidenceIndex.toFixed(2)}, filled=${filled.canoeVerdict}/${filled.subsidenceIndex.toFixed(2)}`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
