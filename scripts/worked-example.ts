import {
  AQUIFER_CAPTURE_SCALE_KM2, AQUIFER_OUTCROP_AREA_KM2, AQUIFER_RECHARGE_M3_PER_D,
  AQUIFER_STORATIVITY, AQUIFER_TRANSMISSIVITY_M2_PER_D, DISTANCE_TO_CISTERN_M,
  SPECIFIC_INFLOW_M3_PER_D_PER_KM2_CONNECTED, STRIP_RATIO_UNDERGROUND,
  aquiferCaptureFraction, computeWasteLedger, computeWaterLedger, grossDewateringM3PerDay,
  mineLifeYr, taylorLifeYr, theisDrawdownM, waterMitigationEffectiveness, wellFunction,
} from '../src/model/index.ts';

const KM2 = 4.0, CAP = 3_000_000, SPEND = 2_300_000;
const f = (n: number, d = 2) => n.toFixed(d);

console.log('WORKED EXAMPLE: 4 km2 licence, 3.0 Mt/yr, $2.3M water mitigation\n');
const reserve = KM2 * 15e6;
console.log(`1. reserve        = ${KM2} km2 x 15 Mt/km2            = ${f(reserve/1e6,1)} Mt`);
console.log(`2. mine life      = ${f(reserve/1e6,1)} / 3.0                      = ${f(mineLifeYr(reserve,CAP),1)} yr   (Taylor predicts ${f(taylorLifeYr(reserve),1)} yr)`);
const cf = aquiferCaptureFraction(KM2);
console.log(`3. capture        = 1 - exp(-${KM2}/${AQUIFER_CAPTURE_SCALE_KM2})              = ${f(cf*100,1)}% of the aquifer`);
const gross = grossDewateringM3PerDay(KM2);
console.log(`4. gross inflow   = ${f(cf,3)} x ${AQUIFER_OUTCROP_AREA_KM2} km2 x ${SPECIFIC_INFLOW_M3_PER_D_PER_KM2_CONNECTED}    = ${f(gross,0)} m3/d`);
const e = waterMitigationEffectiveness(SPEND);
console.log(`5. mitigation     = 0.6 x (1-exp(-2.3/4.0))        = ${f(e*100,1)}% suppressed`);
const net = gross*(1-e);
console.log(`6. net inflow     = ${f(gross,0)} x (1-${f(e,3)})             = ${f(net,0)} m3/d`);
console.log(`7. vs recharge    = ${f(net,0)} / ${f(AQUIFER_RECHARGE_M3_PER_D,0)}                 = ${f(net/AQUIFER_RECHARGE_M3_PER_D,2)}x  -> storage is being spent`);
const t = mineLifeYr(reserve,CAP)*365;
const u = DISTANCE_TO_CISTERN_M**2*AQUIFER_STORATIVITY/(4*AQUIFER_TRANSMISSIVITY_M2_PER_D*t);
console.log(`8. u              = ${DISTANCE_TO_CISTERN_M}^2 x ${AQUIFER_STORATIVITY} / (4 x ${AQUIFER_TRANSMISSIVITY_M2_PER_D} x ${f(t,0)}) = ${u.toExponential(3)}`);
console.log(`9. W(u)           = well function                  = ${f(wellFunction(u),4)}`);
const s = theisDrawdownM(net, DISTANCE_TO_CISTERN_M, t);
console.log(`10. drawdown      = ${f(net,0)}/(4pi x ${AQUIFER_TRANSMISSIVITY_M2_PER_D}) x ${f(wellFunction(u),3)}  = ${f(s,2)} m at the cistern (unshielded)`);
const L = computeWaterLedger({mineSizeKm2:KM2, capacityTPerYr:CAP, waterMitigationSpendUsd:SPEND});
console.log(`11. barrier       = 4 km2 > 2 km2 breach threshold  -> breached, full drawdown applies`);
console.log(`12. verdict       = ${f(L.receptors[0].drawdownM,2)} m vs 1.20 m tolerance       -> ${L.receptors[0].verdict.toUpperCase()}, cost to avert: ${L.receptors[0].spendToSaveUsd===null?'IMPOSSIBLE':'$'+f(L.receptors[0].spendToSaveUsd/1e6,1)+'M'}`);
const W = computeWasteLedger({mineSizeKm2:KM2, capacityTPerYr:CAP, backfillFraction:0});
console.log(`\n13. waste rock    = ${f(reserve/1e6,1)} Mt x ${STRIP_RATIO_UNDERGROUND}                 = ${f(W.tonnage.wasteRockT/1e6,1)} Mt`);
console.log(`14. mass yield    = 0.012 x 0.72 / 0.0575            = ${f(W.massYield.yieldFraction*100,1)}%`);
console.log(`15. tailings      = ${f(reserve/1e6,1)} Mt x (1 - ${f(W.massYield.yieldFraction,3)})         = ${f(W.tonnage.tailingsT/1e6,1)} Mt`);
console.log(`16. dump area     = 0.59 x ${f(W.tonnage.wasteRockT/1e6,1)} + 16               = ${f(W.footprint.wasteDumpHa,0)} ha`);
console.log(`17. tails area    = 1.57 x ${f(W.tonnage.tailingsToSurfaceT/1e6,1)} + 13              = ${f(W.footprint.tailingsImpoundmentHa,0)} ha`);
console.log(`18. total vs licence = ${f(W.footprint.totalDisturbedHa,0)} ha vs ${f(W.footprint.licenceAreaHa,0)} ha      -> ${W.footprint.exceedsLicenceArea?'EXCEEDS':'fits'}`);
