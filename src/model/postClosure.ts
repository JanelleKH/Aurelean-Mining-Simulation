/**
 * postClosure.ts — the canoe benefit, and the conflict it creates.
 *
 * The underground canoe route is not a new structure. It is the mine's own
 * dewatering galleries, kept rather than filled, and opened once mining ends.
 * The galleries are dry only while the mine pumps them; after closure the water
 * table rebounds and floods them, and that is what makes them navigable.
 *
 * Three consequences, all of which the model has to carry if the benefit is to
 * mean anything:
 *
 *   1. It cannot be delivered during the simulation's horizon. It matures years
 *      after the negotiation that awards it, and the delay is longer the larger
 *      the mine, because rebound follows drawdown.
 *
 *   2. It is cheap to promise and expensive to keep. Capital is near zero, as
 *      the galleries are driven anyway. The cost is deferred and recurring:
 *      backfill foregone, water treatment after rebound, access maintenance in
 *      perpetuity. The existing benefits model prices every benefit as a single
 *      payment, which cannot represent this at all.
 *
 *   3. It sets the community against itself. Cemented paste backfill is what
 *      protects the Old Town and the cistern from subsidence; backfilled
 *      galleries are not navigable. The heritage interest and the tourism
 *      interest inside the same community want opposite values of beta.
 */

import {
  CANOE_MIN_NAVIGABLE_LENGTH_M,
  GALLERY_FRACTION_AT_REBOUND_HORIZON,
  GALLERY_M_PER_T_ORE,
  ORE_DENSITY_T_PER_M3,
  ORE_T_PER_KM2,
} from './params.ts';
import { reboundYears } from './hydrology.ts';

export type CanoeVerdict = 'deliverable' | 'too_short' | 'backfilled_away';

export type PostClosureState = {
  /** Total ore in the licence area, tonnes. */
  reserveT: number;
  /** Years of operation at the chosen capacity. */
  mineLifeYr: number;
  /** Void created by extraction, m3. */
  voidVolumeM3: number;
  /** Gallery driven, m. */
  galleryLengthM: number;

  /** Share of void filled with cemented paste backfill, 0-1. */
  backfillFraction: number;
  /** Void left open beneath the town after backfill, m3. Drives subsidence. */
  unfilledVoidM3: number;
  /**
   * Relative subsidence exposure of the Old Town, dimensionless index on 0-1
   * against the largest unfilled void in the scenario space. Deliberately an
   * index and not a millimetre figure: predicting subsidence magnitude needs
   * the overburden profile, which an abstract simulation does not have.
   */
  subsidenceIndex: number;

  /** Years after closure before the galleries are navigable. */
  yearsToNavigableAfterClosure: number;
  /** Navigable gallery length once rebound completes, m. */
  navigableLengthM: number;
  canoeVerdict: CanoeVerdict;

  /** Cost structure of the canoe benefit. */
  canoeCost: {
    capitalUsd: number;
    annualRecurringUsd: number;
    /** Present value of the recurring obligation over the stated horizon. */
    recurringPvUsd: number;
    horizonYr: number;
    discountRate: number;
  };
};

export function computePostClosure(input: {
  mineSizeKm2: number;
  capacityTPerYr: number;
  /** Drawdown at the workings during operation, m, from the water ledger. */
  drawdownAtWorkingsM: number;
  /** Share of voids backfilled, 0-1. The community's own internal argument. */
  backfillFraction: number;
  /** Horizon over which the recurring obligation is valued, years. */
  horizonYr?: number;
  discountRate?: number;
}): PostClosureState {
  const { mineSizeKm2, capacityTPerYr, drawdownAtWorkingsM } = input;
  const beta = clamp01(input.backfillFraction);
  const horizonYr = input.horizonYr ?? 50;
  const discountRate = input.discountRate ?? 0.03;

  const reserveT = mineSizeKm2 * ORE_T_PER_KM2;
  const mineLifeYr = capacityTPerYr > 0 ? reserveT / capacityTPerYr : 0;
  const voidVolumeM3 = reserveT / ORE_DENSITY_T_PER_M3;
  const galleryLengthM = reserveT * GALLERY_M_PER_T_ORE;

  const unfilledVoidM3 = voidVolumeM3 * (1 - beta);

  // Normalising constant: the largest void in the scenario space, unfilled.
  const maxVoidM3 = (8.0 * ORE_T_PER_KM2) / ORE_DENSITY_T_PER_M3;
  const subsidenceIndex = clamp01(unfilledVoidM3 / maxVoidM3);

  const navigableLengthM = galleryLengthM * GALLERY_FRACTION_AT_REBOUND_HORIZON * (1 - beta);

  let canoeVerdict: CanoeVerdict;
  if (beta >= 0.9) {
    canoeVerdict = 'backfilled_away';
  } else if (navigableLengthM < CANOE_MIN_NAVIGABLE_LENGTH_M) {
    canoeVerdict = 'too_short';
  } else {
    canoeVerdict = 'deliverable';
  }

  // Cost structure. Capital is access works only: a portal, a landing, lighting.
  // Recurring scales with the length that has to be kept open and treated, and
  // with the volume of water that rebounds through exposed workings.
  const capitalUsd = 250_000 + 120 * navigableLengthM;
  const annualRecurringUsd = 40_000 + 85 * navigableLengthM + 0.0009 * unfilledVoidM3;
  const recurringPvUsd = presentValueOfAnnuity(annualRecurringUsd, discountRate, horizonYr);

  return {
    reserveT,
    mineLifeYr,
    voidVolumeM3,
    galleryLengthM,
    backfillFraction: beta,
    unfilledVoidM3,
    subsidenceIndex,
    yearsToNavigableAfterClosure: reboundYears(drawdownAtWorkingsM),
    navigableLengthM,
    canoeVerdict,
    canoeCost: { capitalUsd, annualRecurringUsd, recurringPvUsd, horizonYr, discountRate },
  };
}

function presentValueOfAnnuity(annual: number, rate: number, years: number): number {
  if (rate <= 0) return annual * years;
  return annual * ((1 - Math.pow(1 + rate, -years)) / rate);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
