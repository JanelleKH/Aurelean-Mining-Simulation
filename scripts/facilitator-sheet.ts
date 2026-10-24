/** Emits the precomputed water numbers for a facilitator to read out in the room. */
import {
  AQUIFER_RECHARGE_M3_PER_D, CAPACITIES_T_PER_YR, MINE_SIZES_KM2,
  computePostClosure, computeWaterLedger,
} from '../src/model/index.ts';

const MIN = 300_000;
const usd = (n: number | null) => (n === null ? 'nothing can' : '$' + (n / 1e6).toFixed(1) + 'M');
const L = (k: number, c = 3e6, s = MIN) =>
  computeWaterLedger({ mineSizeKm2: k, capacityTPerYr: c, waterMitigationSpendUsd: s });

console.log('## A. Water, by mine size (at 3 Mt/yr, minimum mitigation)\n');
console.log('| Mine | Pumped from the aquifer | Against recharge | Cistern | Cost to save it | Farm wells |');
console.log('|---|---|---|---|---|---|');
for (const k of MINE_SIZES_KM2) {
  const l = L(k);
  const c = l.receptors[0], w = l.receptors[1];
  console.log(`| ${k} km² | ${Math.round(l.mitigation.netDewateringM3PerDay).toLocaleString()} m³/day | ${l.balance.multipleOfRecharge.toFixed(1)}× | ${c.verdict === 'lost' ? '**dry**' : 'survives'} | ${c.verdict === 'lost' ? usd(c.spendToSaveUsd) : '—'} | ${w.verdict === 'lost' ? 'fail' : w.verdict === 'at_risk' ? 'at risk' : 'ok'} |`);
}
console.log(`\nAquifer recharge is ${Math.round(AQUIFER_RECHARGE_M3_PER_D).toLocaleString()} m³/day. Anything above 1.0× is spending stored water, not rainfall.\n`);

console.log('## B. The same, with no compartment barrier (the unshielded case)\n');
console.log('| Mine | Cistern drawdown | Verdict | Cost to save it |');
console.log('|---|---|---|---|');
for (const k of MINE_SIZES_KM2) {
  const c = computeWaterLedger({ mineSizeKm2: k, capacityTPerYr: 3e6, waterMitigationSpendUsd: MIN, overrideCisternShielded: false }).receptors[0];
  console.log(`| ${k} km² | ${c.drawdownM.toFixed(1)} m | ${c.verdict === 'lost' ? '**dry**' : 'survives'} | ${usd(c.spendToSaveUsd)} |`);
}

console.log('\n## C. Mine life, and which plans are real\n');
console.log('| Mine | 0.5 Mt/yr | 1.5 Mt/yr | 3 Mt/yr | 5 Mt/yr |');
console.log('|---|---|---|---|---|');
for (const k of MINE_SIZES_KM2) {
  const cells = CAPACITIES_T_PER_YR.map(c => {
    const t = L(k, c).timing;
    return `${t.mineLifeYr.toFixed(0)} yr${t.plausibleMinePlan ? '' : ' ✗'}`;
  });
  console.log(`| ${k} km² | ${cells.join(' | ')} |`);
}
console.log('\n✗ = not a plan anyone would fund (more than double or less than half the life Taylor\'s Rule predicts for that reserve).\n');

console.log('## D. The canoe, and what backfill costs it (4 km², 3 Mt/yr)\n');
console.log('| Backfill of voids | Navigable route | Canoe | Old Town subsidence risk | Cost to keep, 50 yr |');
console.log('|---|---|---|---|---|');
{
  const l = L(4);
  for (const b of [0, 0.5, 0.9, 1.0]) {
    const pc = computePostClosure({ mineSizeKm2: 4, capacityTPerYr: 3e6, drawdownAtWorkingsM: l.drawdownAtWorkingsM, backfillFraction: b });
    console.log(`| ${(b * 100).toFixed(0)}% | ${(pc.navigableLengthM / 1000).toFixed(1)} km | ${pc.canoeVerdict === 'deliverable' ? 'works' : '**gone**'} | ${(pc.subsidenceIndex * 100).toFixed(0)}% of worst case | ${usd(pc.canoeCost.recurringPvUsd)} |`);
  }
}
console.log('\nCapital cost of the canoe is about $0.9M. The 50-year cost of keeping it is fifteen times that. It is the cheapest thing to promise and the most expensive thing to be held to.\n');
