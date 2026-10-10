/**
 * hydrology.ts — the physical relations behind the water ledger.
 *
 * Nothing in this file knows about budgets, benefits, utility or the UI. It
 * takes physical quantities and returns physical quantities, so it can be
 * tested on its own and reused by the digital twin against real site data.
 */

import {
  AQUIFER_RADIUS_OF_INFLUENCE_M,
  AQUIFER_TRANSMISSIVITY_M2_PER_D,
  DEWATERING_M3_PER_D_PER_KM2,
  PROCESS_WATER_M3_PER_T_ORE,
  PROCESS_WATER_RECYCLE_FRACTION,
  REBOUND_YR_PER_M_DRAWDOWN,
  WATER_MITIGATION_MAX_EFFECTIVENESS,
  WATER_MITIGATION_SPEND_SCALE_USD,
} from './params.ts';

/* ------------------------------------------------------------------ *
 * Process water
 * ------------------------------------------------------------------ */

/** Gross water circulating through the plant, m3/yr. */
export function grossProcessWaterM3PerYr(capacityTPerYr: number): number {
  return capacityTPerYr * PROCESS_WATER_M3_PER_T_ORE;
}

/**
 * Makeup water that must actually be withdrawn, m3/yr. This is the volume that
 * is consumed and never returned: entrained in tailings moisture, lost to
 * evaporation. Recycling reduces this and does not reduce drawdown, which is
 * why recycling is the wrong instrument for protecting the cistern.
 */
export function processMakeupWaterM3PerYr(
  capacityTPerYr: number,
  recycleFraction: number = PROCESS_WATER_RECYCLE_FRACTION,
): number {
  const recycle = clamp01(recycleFraction);
  return grossProcessWaterM3PerYr(capacityTPerYr) * (1 - recycle);
}

/* ------------------------------------------------------------------ *
 * Dewatering
 * ------------------------------------------------------------------ */

/**
 * Gross groundwater inflow that must be pumped out of the workings, m3/d,
 * before any mitigation. Scales with licence area, not with throughput: it is
 * a function of how much of the aquifer the workings intersect.
 *
 * This is the hinge of the whole model. The community chooses mine size and
 * therefore chooses the dewatering rate; the developer chooses capacity and
 * therefore chooses process consumption. Each side owns one half of the water
 * ledger, and the half the community owns is the half that threatens the
 * cistern.
 */
export function grossDewateringM3PerDay(mineSizeKm2: number): number {
  return mineSizeKm2 * DEWATERING_M3_PER_D_PER_KM2;
}

/**
 * Fraction by which grouting and reinjection reduce the net dewatering rate,
 * for a given spend. Saturating: 1 - exp(-spend / scale), capped at the maximum
 * physically achievable in a conduit-flow aquifer.
 */
export function waterMitigationEffectiveness(spendUsd: number): number {
  if (!(spendUsd > 0)) return 0;
  const approach = 1 - Math.exp(-spendUsd / WATER_MITIGATION_SPEND_SCALE_USD);
  return WATER_MITIGATION_MAX_EFFECTIVENESS * approach;
}

/** Spend needed to reach a given effectiveness, USD, or null if unreachable. */
export function spendForEffectiveness(target: number): number | null {
  if (target <= 0) return 0;
  if (target >= WATER_MITIGATION_MAX_EFFECTIVENESS) return null;
  const approach = target / WATER_MITIGATION_MAX_EFFECTIVENESS;
  return -WATER_MITIGATION_SPEND_SCALE_USD * Math.log(1 - approach);
}

/** Net dewatering rate after mitigation, m3/d. */
export function netDewateringM3PerDay(mineSizeKm2: number, waterSpendUsd: number): number {
  const gross = grossDewateringM3PerDay(mineSizeKm2);
  return gross * (1 - waterMitigationEffectiveness(waterSpendUsd));
}

/* ------------------------------------------------------------------ *
 * Drawdown
 * ------------------------------------------------------------------ */

/**
 * Steady-state drawdown at a radial distance from the pumping centre, m.
 *
 * Thiem (1906) confined steady-state solution:
 *
 *     s = Q / (2 pi T) * ln(R / r)
 *
 * s = drawdown (m), Q = pumping rate (m3/d), T = transmissivity (m2/d),
 * R = radius of influence (m), r = distance to the receptor (m).
 *
 * Thiem assumes a homogeneous confined aquifer and radial flow. A karst aquifer
 * satisfies neither assumption: conduit flow makes the real drawdown surface
 * anisotropic, deeper along conduits and shallower across them. Using Thiem
 * with a high transmissivity is a deliberate simplification that preserves the
 * ordering and the thresholds while understating the variance. The digital
 * twin, with real conduit mapping, should not use this function.
 */
export function thiemDrawdownM(
  pumpingM3PerDay: number,
  distanceM: number,
  transmissivityM2PerDay: number = AQUIFER_TRANSMISSIVITY_M2_PER_D,
  radiusOfInfluenceM: number = AQUIFER_RADIUS_OF_INFLUENCE_M,
): number {
  if (!(pumpingM3PerDay > 0)) return 0;
  const r = Math.max(1, Math.min(distanceM, radiusOfInfluenceM));
  if (r >= radiusOfInfluenceM) return 0;
  return (pumpingM3PerDay / (2 * Math.PI * transmissivityM2PerDay)) * Math.log(radiusOfInfluenceM / r);
}

/**
 * Maximum pumping rate that keeps drawdown at a receptor within a tolerance,
 * m3/d. The inverse of the above, used to answer "what would it take to save
 * the cistern" rather than only "is it lost".
 */
export function pumpingForDrawdownM3PerDay(
  toleratedDrawdownM: number,
  distanceM: number,
  transmissivityM2PerDay: number = AQUIFER_TRANSMISSIVITY_M2_PER_D,
  radiusOfInfluenceM: number = AQUIFER_RADIUS_OF_INFLUENCE_M,
): number {
  const r = Math.max(1, Math.min(distanceM, radiusOfInfluenceM));
  if (r >= radiusOfInfluenceM) return Number.POSITIVE_INFINITY;
  return (toleratedDrawdownM * 2 * Math.PI * transmissivityM2PerDay) / Math.log(radiusOfInfluenceM / r);
}

/* ------------------------------------------------------------------ *
 * Rebound
 * ------------------------------------------------------------------ */

/** Years for the water table to recover once pumping stops. */
export function reboundYears(drawdownAtWorkingsM: number): number {
  return Math.max(0, drawdownAtWorkingsM) * REBOUND_YR_PER_M_DRAWDOWN;
}

/* ------------------------------------------------------------------ */

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
