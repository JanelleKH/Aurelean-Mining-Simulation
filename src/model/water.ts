/**
 * water.ts — the water ledger.
 *
 * One dimension, denominated in cubic metres per year and metres of drawdown.
 * Commensurable within itself and deliberately not commensurable with waste or
 * air: there is no total in this object and none should be added. Aggregating
 * the dimensions is the move the equitable resilience framework rejects, and the
 * single utility score in the current app is that move.
 *
 * The ledger reports five things, and they are different kinds of fact:
 *   1. volumes moved        - withdrawal, return, consumption (m3/yr)
 *   2. a water balance      - pumping against recharge (a ratio)
 *   3. a field consequence  - drawdown at each receptor (m)
 *   4. threshold verdicts   - whether each receptor survives
 *   5. what it would take   - the spend that would change the verdict (USD)
 *
 * (2) is new on 24 October and is the honest centre of the thing. Every scenario
 * above the smallest pumps more than the aquifer receives, which means the mine
 * is spending the aquifer's savings rather than its income, and the drawdown
 * grows for as long as that continues. That is why the drawdown figures are
 * transient and carry a duration, and it is the fact a community would most want
 * stated plainly.
 *
 * (5) is what makes the ledger negotiable rather than merely reported, and it
 * must be able to express impossibility as distinct from expense: null means no
 * spend reaches the threshold.
 */

import {
  AQUIFER_RECHARGE_M3_PER_D,
  CISTERN_AVAILABLE_COLUMN_M,
  CISTERN_IN_SEPARATE_COMPARTMENT,
  COMPARTMENT_BREACH_AREA_KM2,
  DISTANCE_TO_CISTERN_M,
  DISTANCE_TO_FARM_WELLS_M,
  FARM_WELL_AVAILABLE_DRAWDOWN_M,
  INTACT_BARRIER_LEAKAGE_FRACTION,
  ORE_T_PER_KM2,
} from './params.ts';
import {
  aquiferCaptureFraction,
  grossDewateringM3PerDay,
  grossProcessWaterM3PerYr,
  isPlausibleMinePlan,
  mineLifeYr,
  netDewateringM3PerDay,
  processMakeupWaterM3PerYr,
  pumpingDurationDays,
  pumpingForDrawdownM3PerDay,
  rechargeMultiple,
  spendForEffectiveness,
  taylorLifeYr,
  theisDrawdownM,
  thiemDrawdownM,
  waterMitigationEffectiveness,
} from './hydrology.ts';

const DAYS_PER_YR = 365;

export type ReceptorVerdict = 'safe' | 'at_risk' | 'lost';

export type ReceptorState = {
  id: 'cistern' | 'farm_wells';
  label: string;
  distanceM: number;
  /** Drawdown the receptor experiences, m, at the end of the mine's life. */
  drawdownM: number;
  /** Drawdown at which the receptor fails, m. */
  toleranceM: number;
  verdict: ReceptorVerdict;
  /**
   * Additional water-mitigation spend that would return this receptor to 'safe',
   * USD. null means no spend can: the harm is outside what grouting and
   * reinjection achieve in a conduit aquifer. This is where irreplaceability
   * becomes arithmetic rather than rhetoric.
   */
  spendToSaveUsd: number | null;
  /** Whether a compartment barrier currently shields this receptor. */
  shieldedByBarrier: boolean;
};

export type WaterLedger = {
  inputs: {
    mineSizeKm2: number;
    capacityTPerYr: number;
    waterMitigationSpendUsd: number;
  };

  /** How long the mine pumps, which is what makes the drawdown figures mean anything. */
  timing: {
    reserveT: number;
    mineLifeYr: number;
    taylorLifeYr: number;
    /** False when this size-and-rate pair is not a mine plan anyone would fund. */
    plausibleMinePlan: boolean;
  };

  /** Volumes, m3/yr. */
  volumes: {
    dewateringWithdrawal: number;
    processWithdrawal: number;
    processGrossCirculating: number;
    totalWithdrawal: number;
    returnedToAquifer: number;
    dischargedToSurface: number;
    consumed: number;
  };

  /**
   * The water balance. Above 1.0, the mine takes more than the aquifer receives
   * and the deficit comes out of storage, so no steady state exists and the
   * drawdown keeps growing while pumping continues.
   */
  balance: {
    rechargeM3PerDay: number;
    netPumpingM3PerDay: number;
    multipleOfRecharge: number;
    spendingStorage: boolean;
    /** Storage drawn over the life of the mine, m3. */
    storageDepletedM3: number;
  };

  mitigation: {
    spendUsd: number;
    effectiveness: number;
    aquiferCaptureFraction: number;
    grossDewateringM3PerDay: number;
    netDewateringM3PerDay: number;
  };

  receptors: ReceptorState[];

  /** Drawdown at the workings, used for post-closure rebound. */
  drawdownAtWorkingsM: number;

  /**
   * The steady-state figure the previous version of this model reported, kept so
   * the two can be compared. It is not the ledger's answer; it is what the wrong
   * equation would have said.
   */
  referenceSteadyStateCisternDrawdownM: number;
};

export function computeWaterLedger(input: {
  mineSizeKm2: number;
  capacityTPerYr: number;
  waterMitigationSpendUsd: number;
  reinjectionFraction?: number;
  /** Test/compare override for the compartment proposal. Omit in the app. */
  overrideCisternShielded?: boolean;
}): WaterLedger {
  const { mineSizeKm2, capacityTPerYr, waterMitigationSpendUsd } = input;
  const reinjection = clamp01(input.reinjectionFraction ?? 0);

  const reserveT = mineSizeKm2 * ORE_T_PER_KM2;
  const lifeYr = mineLifeYr(reserveT, capacityTPerYr);
  const durationDays = pumpingDurationDays(reserveT, capacityTPerYr);

  const grossDay = grossDewateringM3PerDay(mineSizeKm2);
  const netDay = netDewateringM3PerDay(mineSizeKm2, waterMitigationSpendUsd);

  const dewateringWithdrawal = netDay * DAYS_PER_YR;
  const processWithdrawal = processMakeupWaterM3PerYr(capacityTPerYr);

  const multiple = rechargeMultiple(netDay);
  const deficitPerDay = Math.max(0, netDay - AQUIFER_RECHARGE_M3_PER_D);

  const breached =
    input.overrideCisternShielded !== undefined
      ? !input.overrideCisternShielded
      : !CISTERN_IN_SEPARATE_COMPARTMENT || mineSizeKm2 > COMPARTMENT_BREACH_AREA_KM2;

  return {
    inputs: { mineSizeKm2, capacityTPerYr, waterMitigationSpendUsd },

    timing: {
      reserveT,
      mineLifeYr: lifeYr,
      taylorLifeYr: taylorLifeYr(reserveT),
      plausibleMinePlan: isPlausibleMinePlan(reserveT, capacityTPerYr),
    },

    volumes: {
      dewateringWithdrawal,
      processWithdrawal,
      processGrossCirculating: grossProcessWaterM3PerYr(capacityTPerYr),
      totalWithdrawal: dewateringWithdrawal + processWithdrawal,
      returnedToAquifer: dewateringWithdrawal * reinjection,
      dischargedToSurface: dewateringWithdrawal * (1 - reinjection),
      // Dewatering water is relocated, not consumed. Process makeup is consumed.
      consumed: processWithdrawal,
    },

    balance: {
      rechargeM3PerDay: AQUIFER_RECHARGE_M3_PER_D,
      netPumpingM3PerDay: netDay,
      multipleOfRecharge: multiple,
      spendingStorage: multiple > 1,
      storageDepletedM3: deficitPerDay * durationDays,
    },

    mitigation: {
      spendUsd: waterMitigationSpendUsd,
      effectiveness: waterMitigationEffectiveness(waterMitigationSpendUsd),
      aquiferCaptureFraction: aquiferCaptureFraction(mineSizeKm2),
      grossDewateringM3PerDay: grossDay,
      netDewateringM3PerDay: netDay,
    },

    receptors: [
      receptorState({
        id: 'cistern',
        label: 'Old Cistern',
        distanceM: DISTANCE_TO_CISTERN_M,
        toleranceM: CISTERN_AVAILABLE_COLUMN_M,
        grossDay,
        netDay,
        durationDays,
        // Only the cistern sits behind a compartment barrier. The farm wells are
        // in the same compartment as the workings.
        shieldedByBarrier: !breached,
      }),
      receptorState({
        id: 'farm_wells',
        label: 'Agricultural wells',
        distanceM: DISTANCE_TO_FARM_WELLS_M,
        toleranceM: FARM_WELL_AVAILABLE_DRAWDOWN_M,
        grossDay,
        netDay,
        durationDays,
        shieldedByBarrier: false,
      }),
    ],

    // Distance taken as the radius of a circular licence area, the nearest thing
    // to a well radius available here.
    drawdownAtWorkingsM: theisDrawdownM(
      netDay,
      Math.sqrt((mineSizeKm2 * 1_000_000) / Math.PI),
      durationDays,
    ),

    referenceSteadyStateCisternDrawdownM: thiemDrawdownM(netDay, DISTANCE_TO_CISTERN_M),
  };
}

function receptorState(args: {
  id: ReceptorState['id'];
  label: string;
  distanceM: number;
  toleranceM: number;
  grossDay: number;
  netDay: number;
  durationDays: number;
  shieldedByBarrier: boolean;
}): ReceptorState {
  const { id, label, distanceM, toleranceM, grossDay, netDay, durationDays, shieldedByBarrier } =
    args;

  const transmission = shieldedByBarrier ? INTACT_BARRIER_LEAKAGE_FRACTION : 1;
  const drawdownM = theisDrawdownM(netDay, distanceM, durationDays) * transmission;

  // What inflow would this receptor tolerate, and what suppression of gross
  // inflow does that imply?
  const toleratedPumping =
    pumpingForDrawdownM3PerDay(toleranceM, distanceM, durationDays) / transmission;
  const requiredEffectiveness = grossDay > 0 ? 1 - toleratedPumping / grossDay : 0;

  const spendToSaveUsd =
    drawdownM <= toleranceM ? 0 : spendForEffectiveness(requiredEffectiveness);

  let verdict: ReceptorVerdict;
  if (drawdownM <= toleranceM) {
    verdict = drawdownM > 0.8 * toleranceM ? 'at_risk' : 'safe';
  } else {
    verdict = 'lost';
  }

  return { id, label, distanceM, drawdownM, toleranceM, verdict, spendToSaveUsd, shieldedByBarrier };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
