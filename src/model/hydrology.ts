/**
 * hydrology.ts — the physical relations behind the water ledger.
 *
 * Nothing here knows about budgets, benefits, utility or the UI. Physical
 * quantities in, physical quantities out, so it can be tested on its own and
 * reused by the digital twin against real site data.
 *
 * REVISED 24 October 2026. The substantive change is that drawdown is now
 * computed with a TRANSIENT solution (Theis) rather than a steady-state one
 * (Thiem). An operating mine in this aquifer pumps several times the recharge,
 * so the cone of depression never stabilises and a steady-state equation is
 * simply the wrong tool. Thiem is kept, clearly labelled, as a reference curve.
 *
 * The practical consequence: time enters the model. Drawdown grows with how
 * long the mine pumps, so mine life — and therefore the developer's capacity
 * choice — now bears on the cistern, which the previous version could not
 * represent at all.
 */

import {
  AQUIFER_CAPTURE_SCALE_KM2,
  AQUIFER_OUTCROP_AREA_KM2,
  AQUIFER_RADIUS_OF_INFLUENCE_M,
  AQUIFER_RECHARGE_M3_PER_D,
  AQUIFER_STORATIVITY,
  AQUIFER_TRANSMISSIVITY_M2_PER_D,
  PROCESS_WATER_M3_PER_T_ORE,
  PROCESS_WATER_RECYCLE_FRACTION,
  REBOUND_YR_PER_M_DRAWDOWN,
  SPECIFIC_INFLOW_M3_PER_D_PER_KM2_CONNECTED,
  TAYLOR_COEFFICIENT,
  TAYLOR_EXPONENT,
  TAYLOR_PLAUSIBILITY_FACTOR,
  WATER_MITIGATION_MAX_EFFECTIVENESS,
  WATER_MITIGATION_SPEND_SCALE_USD,
} from './params.ts';

const DAYS_PER_YR = 365;

/* ------------------------------------------------------------------ *
 * Process water
 * ------------------------------------------------------------------ */

/** Gross water circulating through the plant, m3/yr. */
export function grossProcessWaterM3PerYr(capacityTPerYr: number): number {
  return capacityTPerYr * PROCESS_WATER_M3_PER_T_ORE;
}

/**
 * Makeup water that must actually be withdrawn, m3/yr: the volume consumed and
 * never returned. Recycling reduces this and does nothing for drawdown, which
 * is why recycling is the wrong instrument for protecting the cistern.
 */
export function processMakeupWaterM3PerYr(
  capacityTPerYr: number,
  recycleFraction: number = PROCESS_WATER_RECYCLE_FRACTION,
): number {
  return grossProcessWaterM3PerYr(capacityTPerYr) * (1 - clamp01(recycleFraction));
}

/* ------------------------------------------------------------------ *
 * Capture and inflow
 * ------------------------------------------------------------------ */

/**
 * Share of the aquifer hydraulically connected to the workings, 0-1.
 *
 * Karst captures disproportionately: conduits connect what the footprint does
 * not touch, so capture rises steeply with area and then saturates. At Reocin
 * 1.08 km2 of workings drained a 44 km2 watershed.
 */
export function aquiferCaptureFraction(mineSizeKm2: number): number {
  if (!(mineSizeKm2 > 0)) return 0;
  return 1 - Math.exp(-mineSizeKm2 / AQUIFER_CAPTURE_SCALE_KM2);
}

/**
 * Gross groundwater inflow to the workings, m3/d, before mitigation.
 *
 * Set by how much of the AQUIFER the workings drain, not by the area of the
 * workings themselves. This is the correction made on 24 October: the previous
 * version multiplied licence area by a per-licence-km2 rate, which no analogue
 * supports.
 */
export function grossDewateringM3PerDay(mineSizeKm2: number): number {
  return (
    aquiferCaptureFraction(mineSizeKm2) *
    AQUIFER_OUTCROP_AREA_KM2 *
    SPECIFIC_INFLOW_M3_PER_D_PER_KM2_CONNECTED
  );
}

/** Pumping as a multiple of natural recharge. Above 1, storage is being spent. */
export function rechargeMultiple(pumpingM3PerDay: number): number {
  return pumpingM3PerDay / AQUIFER_RECHARGE_M3_PER_D;
}

/* ------------------------------------------------------------------ *
 * Mitigation
 * ------------------------------------------------------------------ */

/** Fraction by which grouting and reinjection cut net inflow, for a given spend. */
export function waterMitigationEffectiveness(spendUsd: number): number {
  if (!(spendUsd > 0)) return 0;
  return (
    WATER_MITIGATION_MAX_EFFECTIVENESS *
    (1 - Math.exp(-spendUsd / WATER_MITIGATION_SPEND_SCALE_USD))
  );
}

/** Spend needed to reach a given effectiveness, USD, or null if unreachable. */
export function spendForEffectiveness(target: number): number | null {
  if (target <= 0) return 0;
  if (target >= WATER_MITIGATION_MAX_EFFECTIVENESS) return null;
  const approach = target / WATER_MITIGATION_MAX_EFFECTIVENESS;
  return -WATER_MITIGATION_SPEND_SCALE_USD * Math.log(1 - approach);
}

/** Net inflow after mitigation, m3/d. */
export function netDewateringM3PerDay(mineSizeKm2: number, waterSpendUsd: number): number {
  return grossDewateringM3PerDay(mineSizeKm2) * (1 - waterMitigationEffectiveness(waterSpendUsd));
}

/* ------------------------------------------------------------------ *
 * Drawdown
 * ------------------------------------------------------------------ */

/**
 * The Theis well function W(u), which is the exponential integral E1(u).
 * Abramowitz & Stegun 5.1.53 for u < 1 and 5.1.56 for u >= 1; both are accurate
 * to better than 2e-7 over their ranges, far beyond what this model needs.
 */
export function wellFunction(u: number): number {
  if (!(u > 0)) return Number.POSITIVE_INFINITY;
  if (u < 1) {
    const a = [-0.57721566, 0.99999193, -0.24991055, 0.05519968, -0.00976004, 0.00107857];
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * Math.pow(u, i);
    return s - Math.log(u);
  }
  const b = [8.5733287401, 18.059016973, 8.6347608925, 0.2677737343];
  const c = [9.5733223454, 25.6329561486, 21.0996530827, 3.9584969228];
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const num = u4 + b[0] * u3 + b[1] * u2 + b[2] * u + b[3];
  const den = u4 + c[0] * u3 + c[1] * u2 + c[2] * u + c[3];
  return num / den / (u * Math.exp(u));
}

/**
 * Transient drawdown at a radial distance after a given pumping duration, m.
 *
 * Theis (1935):
 *     s = Q / (4 pi T) * W(u),     u = r^2 S / (4 T t)
 *
 * s drawdown (m), Q pumping (m3/d), T transmissivity (m2/d), S storativity,
 * r distance (m), t time since pumping began (d).
 *
 * Theis assumes a homogeneous confined aquifer of infinite extent and radial
 * flow. A karst aquifer satisfies none of those: conduit flow makes the real
 * drawdown surface anisotropic, and compartment barriers cut it off entirely in
 * some directions. Using Theis with a conduit-scale transmissivity preserves
 * the ordering, the growth with time, and the thresholds, while understating the
 * variance. The digital twin, with conduit mapping, should not use this.
 */
export function theisDrawdownM(
  pumpingM3PerDay: number,
  distanceM: number,
  pumpingDurationDays: number,
  transmissivityM2PerDay: number = AQUIFER_TRANSMISSIVITY_M2_PER_D,
  storativity: number = AQUIFER_STORATIVITY,
): number {
  if (!(pumpingM3PerDay > 0) || !(pumpingDurationDays > 0)) return 0;
  const r = Math.max(1, distanceM);
  const u = (r * r * storativity) / (4 * transmissivityM2PerDay * pumpingDurationDays);
  return (pumpingM3PerDay / (4 * Math.PI * transmissivityM2PerDay)) * wellFunction(u);
}

/**
 * Pumping rate that holds transient drawdown at a receptor to a tolerance, m3/d.
 * Theis is linear in Q, so this inverts exactly.
 */
export function pumpingForDrawdownM3PerDay(
  toleratedDrawdownM: number,
  distanceM: number,
  pumpingDurationDays: number,
  transmissivityM2PerDay: number = AQUIFER_TRANSMISSIVITY_M2_PER_D,
  storativity: number = AQUIFER_STORATIVITY,
): number {
  const unit = theisDrawdownM(1, distanceM, pumpingDurationDays, transmissivityM2PerDay, storativity);
  if (!(unit > 0)) return Number.POSITIVE_INFINITY;
  return toleratedDrawdownM / unit;
}

/**
 * Steady-state drawdown, Thiem (1906), KEPT FOR REFERENCE ONLY.
 *
 * Valid only where pumping is below recharge, so the cone of depression can
 * stabilise. In this aquifer every scenario above the smallest exceeds recharge,
 * which is why the ledger uses Theis. Retained so the two can be compared and
 * the difference shown rather than asserted.
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
  return (
    (pumpingM3PerDay / (2 * Math.PI * transmissivityM2PerDay)) *
    Math.log(radiusOfInfluenceM / r)
  );
}

/* ------------------------------------------------------------------ *
 * Mine life
 * ------------------------------------------------------------------ */

/** Mine life implied by reserve and chosen rate, years. */
export function mineLifeYr(reserveT: number, capacityTPerYr: number): number {
  return capacityTPerYr > 0 ? reserveT / capacityTPerYr : 0;
}

/** Days of pumping over the life of the mine. */
export function pumpingDurationDays(reserveT: number, capacityTPerYr: number): number {
  return mineLifeYr(reserveT, capacityTPerYr) * DAYS_PER_YR;
}

/** Life Taylor's Rule would predict for a reserve of this size, years. */
export function taylorLifeYr(reserveT: number): number {
  if (!(reserveT > 0)) return 0;
  return TAYLOR_COEFFICIENT * Math.pow(reserveT, TAYLOR_EXPONENT);
}

/**
 * Whether a size-and-rate pair is a real mine plan. A life more than a factor
 * of two away from Taylor's Rule in either direction is not something an
 * investor would fund, and the model currently offers twenty such pairs without
 * comment.
 */
export function isPlausibleMinePlan(reserveT: number, capacityTPerYr: number): boolean {
  const actual = mineLifeYr(reserveT, capacityTPerYr);
  const expected = taylorLifeYr(reserveT);
  if (!(actual > 0) || !(expected > 0)) return false;
  const ratio = actual / expected;
  return ratio >= 1 / TAYLOR_PLAUSIBILITY_FACTOR && ratio <= TAYLOR_PLAUSIBILITY_FACTOR;
}

/* ------------------------------------------------------------------ *
 * Rebound
 * ------------------------------------------------------------------ */

/** Years for the water table to recover once pumping stops. */
/** Currently unused — see REBOUND_YR_PER_M_DRAWDOWN in params.ts. */
export function reboundYears(drawdownAtWorkingsM: number): number {
  return Math.max(0, drawdownAtWorkingsM) * REBOUND_YR_PER_M_DRAWDOWN;
}

/* ------------------------------------------------------------------ */

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
