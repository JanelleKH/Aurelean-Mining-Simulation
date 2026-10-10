/**
 * water.ts — the water ledger.
 *
 * One dimension, denominated in cubic metres per year and metres of drawdown.
 * Commensurable within itself and deliberately not commensurable with waste or
 * air: there is no total at the bottom of this object, and none should be added.
 * Aggregating the dimensions is the move the equitable resilience framework
 * rejects, and the single utility score in the current app is that move.
 *
 * The ledger reports four things, and they are different kinds of fact:
 *   1. volumes moved        - withdrawal, return, consumption (m3/yr)
 *   2. a field consequence  - drawdown at each receptor (m)
 *   3. threshold verdicts   - whether each receptor survives (boolean)
 *   4. what it would take   - the spend that would change the verdict (USD)
 *
 * (4) is what makes this negotiable rather than merely reported. A community
 * that is told "the cistern is lost" can only object; a community that is told
 * "the cistern is lost unless 7.7 million is spent on reinjection, which is
 * most of the mitigation budget" has something to trade.
 */

import {
  CISTERN_AVAILABLE_COLUMN_M,
  DISTANCE_TO_CISTERN_M,
  DISTANCE_TO_FARM_WELLS_M,
  FARM_WELL_AVAILABLE_DRAWDOWN_M,
} from './params.ts';
import {
  grossDewateringM3PerDay,
  grossProcessWaterM3PerYr,
  netDewateringM3PerDay,
  processMakeupWaterM3PerYr,
  pumpingForDrawdownM3PerDay,
  spendForEffectiveness,
  thiemDrawdownM,
  waterMitigationEffectiveness,
} from './hydrology.ts';

const DAYS_PER_YR = 365;

export type ReceptorVerdict = 'safe' | 'at_risk' | 'lost';

export type ReceptorState = {
  id: 'cistern' | 'farm_wells';
  label: string;
  distanceM: number;
  /** Drawdown the receptor experiences under this scenario, m. */
  drawdownM: number;
  /** Drawdown at which the receptor fails, m. */
  toleranceM: number;
  verdict: ReceptorVerdict;
  /**
   * Additional water-mitigation spend that would return this receptor to
   * 'safe', USD. null means no spend can: the harm is outside what grouting
   * and reinjection can achieve in a conduit aquifer. This is where the
   * framework's irreplaceability claim becomes arithmetic rather than rhetoric.
   */
  spendToSaveUsd: number | null;
};

export type WaterLedger = {
  /** Inputs, echoed so a ledger is self-describing when exported to CSV. */
  inputs: {
    mineSizeKm2: number;
    capacityTPerYr: number;
    waterMitigationSpendUsd: number;
  };

  /** Volumes, m3/yr. */
  volumes: {
    /** Pumped out of the workings to keep them dry. */
    dewateringWithdrawal: number;
    /** Makeup water drawn for the plant, net of recirculation. */
    processWithdrawal: number;
    /** Water circulating inside the plant; not a withdrawal, shown for context. */
    processGrossCirculating: number;
    /** Total taken out of the ground. */
    totalWithdrawal: number;
    /** Discharged back to the aquifer. */
    returnedToAquifer: number;
    /** Discharged to surface water: leaves the aquifer, so it is a loss to it. */
    dischargedToSurface: number;
    /** Genuinely consumed: evaporated or locked in tailings. */
    consumed: number;
  };

  /** What the mitigation spend bought, as a fraction of inflow suppressed. */
  mitigation: {
    spendUsd: number;
    effectiveness: number;
    grossDewateringM3PerDay: number;
    netDewateringM3PerDay: number;
  };

  receptors: ReceptorState[];

  /** Drawdown immediately at the workings, used for post-closure rebound. */
  drawdownAtWorkingsM: number;
};

export function computeWaterLedger(input: {
  mineSizeKm2: number;
  capacityTPerYr: number;
  waterMitigationSpendUsd: number;
  /** Share of dewatering discharge deliberately reinjected rather than released. */
  reinjectionFraction?: number;
}): WaterLedger {
  const { mineSizeKm2, capacityTPerYr, waterMitigationSpendUsd } = input;
  const reinjection = clamp01(input.reinjectionFraction ?? 0);

  const grossDewateringDay = grossDewateringM3PerDay(mineSizeKm2);
  const netDewateringDay = netDewateringM3PerDay(mineSizeKm2, waterMitigationSpendUsd);
  const effectiveness = waterMitigationEffectiveness(waterMitigationSpendUsd);

  const dewateringWithdrawal = netDewateringDay * DAYS_PER_YR;
  const processWithdrawal = processMakeupWaterM3PerYr(capacityTPerYr);
  const processGrossCirculating = grossProcessWaterM3PerYr(capacityTPerYr);

  const returnedToAquifer = dewateringWithdrawal * reinjection;
  const dischargedToSurface = dewateringWithdrawal * (1 - reinjection);

  const ledger: WaterLedger = {
    inputs: { mineSizeKm2, capacityTPerYr, waterMitigationSpendUsd },
    volumes: {
      dewateringWithdrawal,
      processWithdrawal,
      processGrossCirculating,
      totalWithdrawal: dewateringWithdrawal + processWithdrawal,
      returnedToAquifer,
      dischargedToSurface,
      // Dewatering water is not consumed, it is relocated. Process makeup is.
      consumed: processWithdrawal,
    },
    mitigation: {
      spendUsd: waterMitigationSpendUsd,
      effectiveness,
      grossDewateringM3PerDay: grossDewateringDay,
      netDewateringM3PerDay: netDewateringDay,
    },
    receptors: [
      receptorState({
        id: 'cistern',
        label: 'Old Cistern',
        distanceM: DISTANCE_TO_CISTERN_M,
        toleranceM: CISTERN_AVAILABLE_COLUMN_M,
        grossDewateringDay,
        netDewateringDay,
      }),
      receptorState({
        id: 'farm_wells',
        label: 'Agricultural wells',
        distanceM: DISTANCE_TO_FARM_WELLS_M,
        toleranceM: FARM_WELL_AVAILABLE_DRAWDOWN_M,
        grossDewateringDay,
        netDewateringDay,
      }),
    ],
    // Drawdown at the workings themselves: distance taken as the radius of a
    // circular licence area, which is the nearest thing to a well radius here.
    drawdownAtWorkingsM: thiemDrawdownM(
      netDewateringDay,
      Math.sqrt((mineSizeKm2 * 1_000_000) / Math.PI),
    ),
  };

  return ledger;
}

function receptorState(args: {
  id: ReceptorState['id'];
  label: string;
  distanceM: number;
  toleranceM: number;
  grossDewateringDay: number;
  netDewateringDay: number;
}): ReceptorState {
  const { id, label, distanceM, toleranceM, grossDewateringDay, netDewateringDay } = args;

  const drawdownM = thiemDrawdownM(netDewateringDay, distanceM);

  // What pumping rate would this receptor tolerate, and what suppression of
  // gross inflow does that imply?
  const toleratedPumping = pumpingForDrawdownM3PerDay(toleranceM, distanceM);
  const requiredEffectiveness =
    grossDewateringDay > 0 ? 1 - toleratedPumping / grossDewateringDay : 0;

  let spendToSaveUsd: number | null = 0;
  if (drawdownM <= toleranceM) {
    spendToSaveUsd = 0;
  } else {
    spendToSaveUsd = spendForEffectiveness(requiredEffectiveness);
  }

  let verdict: ReceptorVerdict;
  if (drawdownM <= toleranceM) {
    verdict = drawdownM > 0.8 * toleranceM ? 'at_risk' : 'safe';
  } else {
    verdict = 'lost';
  }

  return { id, label, distanceM, drawdownM, toleranceM, verdict, spendToSaveUsd };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
