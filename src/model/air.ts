/**
 * air.ts — the air ledger.
 *
 * Built 24 October 2026. It replaces AIR_TIERS in
 * src/data/mitigationConstants.ts, where each supply-chain tier carried a
 * bare "aqiWorst" figure — 0, 100, 150, 200 — with no source, no receptor,
 * no distance and no way for a participant to check it. The application also
 * added each tier's budget and then immediately spent the same amount on air
 * mitigation, so the investment available after locking never moved. That is
 * the defect Janelle found in the 23 September trial.
 *
 * What replaces it:
 *
 *   emissions (g/s, by source)  ->  dispersion (Gaussian, to a named place)
 *   ->  concentration (ug/m3)   ->  two thresholds, legal and health
 *
 * Every step is in physical units and every step can be argued with.
 *
 * THE SHAPE OF THIS DIMENSION, and why it is not water. Dust and stack
 * emissions respond well to control: watering and stabilisers reach 85%,
 * baghouses and scrubbers 95%. So air is the dimension money CAN fix. What it
 * cannot do is fix it once. Control is an operating cost paid every year the
 * mine runs, and it stops the year the budget does. Water gives you an
 * irreversible loss at a threshold; air gives you a permanent obligation. A
 * community that wins a large air-control commitment has won something real
 * and something fragile, and the model should let them feel the difference.
 */

import {
  AIR_CONTROL_SPEND_SCALE_USD,
  DIESEL_PM25_G_PER_T_MOVED,
  DISTANCE_TO_CAMPUS_M,
  DISTANCE_TO_OLD_TOWN_M,
  DUST_CONTROL_MAX_EFFECTIVENESS,
  ELECTRIFICATION_DIESEL_REMOVED_FRACTION,
  ELECTRIFICATION_REQUIRES,
  EU_LIMIT_PM10_ANNUAL_UG_M3,
  EU_LIMIT_PM25_ANNUAL_UG_M3,
  HANDLING_PM10_G_PER_T,
  HAUL_ROAD_PM10_KG_PER_VKT,
  HAUL_VKT_PER_T_MOVED,
  PM25_FRACTION_OF_HANDLING_PM10,
  PM25_FRACTION_OF_ROAD_PM10,
  RECEPTOR_SECTOR_FREQUENCY,
  STACK_CONTROL_MAX_EFFECTIVENESS,
  STRIP_RATIO_UNDERGROUND,
  TIER_PROCESS_PM25_G_PER_S,
  TIER_PROCESS_SO2_G_PER_S,
  WHO_GUIDELINE_PM10_ANNUAL_UG_M3,
  WHO_GUIDELINE_PM25_ANNUAL_UG_M3,
  WIND_EROSION_PM10_KG_PER_HA_YR,
  WIND_SPEED_M_PER_S,
} from './params.ts';

const SECONDS_PER_YR = 365 * 24 * 3600;

export type AirTierId = 'extraction' | 'refining' | 'processing' | 'advanced_manufacturing';
export type AirVerdict = 'within_guideline' | 'within_limit' | 'exceeds_limit';

/* ------------------------------------------------------------------ *
 * Dispersion
 * ------------------------------------------------------------------ */

/**
 * Briggs rural dispersion coefficients, Pasquill stability class D
 * (neutral) — the class that dominates an annual mean.
 *
 *   sigma_y = 0.08 x (1 + 0.0001 x)^-1/2
 *   sigma_z = 0.06 x (1 + 0.0015 x)^-1/2
 *
 * x in metres. Class D is used rather than a worst case because the
 * thresholds being tested are annual means, not hourly peaks.
 */
export function briggsSigmaYM(distanceM: number): number {
  const x = Math.max(1, distanceM);
  return (0.08 * x) / Math.sqrt(1 + 0.0001 * x);
}

export function briggsSigmaZM(distanceM: number): number {
  const x = Math.max(1, distanceM);
  return (0.06 * x) / Math.sqrt(1 + 0.0015 * x);
}

/**
 * Ground-level centreline concentration from a ground-level source,
 * Gaussian plume, ug/m3:
 *
 *   C = Q / (pi u sigma_y sigma_z)
 *
 * Q in g/s, u in m/s, sigmas in m. Release height is taken as zero, which
 * is right for fugitive dust and conservative for stacks — a real stack
 * lifts the plume and reduces ground-level concentration nearby. The twin,
 * with real stack heights, should add the exponential height term.
 */
export function centrelineConcentrationUgM3(emissionGPerS: number, distanceM: number): number {
  if (!(emissionGPerS > 0)) return 0;
  const sy = briggsSigmaYM(distanceM);
  const sz = briggsSigmaZM(distanceM);
  const gPerM3 = emissionGPerS / (Math.PI * WIND_SPEED_M_PER_S * sy * sz);
  return gPerM3 * 1e6;
}

/**
 * Annual mean at a receptor. The centreline value applies only while the
 * wind blows that way; the rest of the year the receptor is upwind or
 * crosswind. Multiplying by the sector frequency is the crudest possible
 * wind rose and is flagged as such in params.ts.
 */
export function annualMeanConcentrationUgM3(emissionGPerS: number, distanceM: number): number {
  return centrelineConcentrationUgM3(emissionGPerS, distanceM) * RECEPTOR_SECTOR_FREQUENCY;
}

/* ------------------------------------------------------------------ *
 * Control
 * ------------------------------------------------------------------ */

/** Saturating control response, as for water but with a far higher ceiling. */
export function controlEffectiveness(spendUsdPerYr: number, maxEffectiveness: number): number {
  if (!(spendUsdPerYr > 0)) return 0;
  return maxEffectiveness * (1 - Math.exp(-spendUsdPerYr / AIR_CONTROL_SPEND_SCALE_USD));
}

/* ------------------------------------------------------------------ *
 * Emissions
 * ------------------------------------------------------------------ */

export type AirEmissions = {
  /** g/s, after control and after any electrification. */
  haulRoadPm10: number;
  haulRoadPm25: number;
  handlingPm10: number;
  handlingPm25: number;
  windErosionPm10: number;
  dieselPm25: number;
  processPm25: number;
  processSo2: number;
  totalPm10: number;
  totalPm25: number;
};

export type ReceptorAir = {
  id: 'old_town' | 'campus';
  label: string;
  distanceM: number;
  pm10AnnualUgM3: number;
  pm25AnnualUgM3: number;
  pm10Verdict: AirVerdict;
  pm25Verdict: AirVerdict;
  /** Annual control spend that would bring PM2.5 inside the EU limit. */
  spendToMeetLimitUsdPerYr: number | null;
  /** Annual control spend that would bring PM2.5 inside the WHO guideline. */
  spendToMeetGuidelineUsdPerYr: number | null;
};

export type AirLedger = {
  inputs: {
    capacityTPerYr: number;
    tier: AirTierId;
    airControlSpendUsdPerYr: number;
    disturbedHa: number;
    electrified: boolean;
  };
  /** Before any control, for comparison. g/s. */
  uncontrolled: AirEmissions;
  /** After control and electrification. g/s. */
  controlled: AirEmissions;
  control: {
    spendUsdPerYr: number;
    /** How the single allocation is split between the two kinds of kit. */
    shareToDust: number;
    dustEffectiveness: number;
    stackEffectiveness: number;
  };
  receptors: ReceptorAir[];
  /**
   * Control is an operating cost, not a capital one. This is what the
   * commitment actually costs over the life of the mine, and it is the
   * number that distinguishes air from every other dimension here.
   */
  obligation: { annualUsd: number; mineLifeYr: number; lifetimeUsd: number };
};

function emissionsFor(args: {
  capacityTPerYr: number;
  tier: AirTierId;
  disturbedHa: number;
  electrified: boolean;
  dustEffectiveness: number;
  stackEffectiveness: number;
}): AirEmissions {
  const { capacityTPerYr, tier, disturbedHa, electrified } = args;
  const dustKept = 1 - clamp01(args.dustEffectiveness);
  const stackKept = 1 - clamp01(args.stackEffectiveness);

  // Everything raised to surface moves on haul roads: ore plus waste rock.
  const materialMovedTPerYr = capacityTPerYr * (1 + STRIP_RATIO_UNDERGROUND);

  const haulPm10GPerYr =
    materialMovedTPerYr * HAUL_VKT_PER_T_MOVED * HAUL_ROAD_PM10_KG_PER_VKT * 1000;
  const handlingPm10GPerYr = capacityTPerYr * HANDLING_PM10_G_PER_T;
  const windPm10GPerYr = Math.max(0, disturbedHa) * WIND_EROSION_PM10_KG_PER_HA_YR * 1000;
  const dieselPm25GPerYr = materialMovedTPerYr * DIESEL_PM25_G_PER_T_MOVED;

  const haulRoadPm10 = (haulPm10GPerYr / SECONDS_PER_YR) * dustKept;
  const handlingPm10 = (handlingPm10GPerYr / SECONDS_PER_YR) * dustKept;
  const windErosionPm10 = (windPm10GPerYr / SECONDS_PER_YR) * dustKept;

  const haulRoadPm25 = haulRoadPm10 * PM25_FRACTION_OF_ROAD_PM10;
  const handlingPm25 = handlingPm10 * PM25_FRACTION_OF_HANDLING_PM10;

  // Electrifying the fleet removes diesel particulate. It does nothing for
  // road dust: an electric truck raises dust with its wheels exactly as a
  // diesel one does. Keeping these separate is the whole point of splitting
  // the sources out rather than carrying one "air" number.
  const electrifiedFactor = electrified ? 1 - ELECTRIFICATION_DIESEL_REMOVED_FRACTION : 1;
  const dieselPm25 = (dieselPm25GPerYr / SECONDS_PER_YR) * electrifiedFactor * dustKept;

  const processPm25 = (TIER_PROCESS_PM25_G_PER_S[tier] ?? 0) * stackKept;
  const processSo2 = (TIER_PROCESS_SO2_G_PER_S[tier] ?? 0) * stackKept;

  const totalPm10 = haulRoadPm10 + handlingPm10 + windErosionPm10 + dieselPm25 + processPm25;
  const totalPm25 = haulRoadPm25 + handlingPm25 + dieselPm25 + processPm25;

  return {
    haulRoadPm10,
    haulRoadPm25,
    handlingPm10,
    handlingPm25,
    windErosionPm10,
    dieselPm25,
    processPm25,
    processSo2,
    totalPm10,
    totalPm25,
  };
}

export function computeAirLedger(input: {
  capacityTPerYr: number;
  tier: AirTierId;
  /** Annual spend on dust and stack control. */
  airControlSpendUsdPerYr: number;
  /** Disturbed ground from the waste ledger, ha. Wind erosion scales with it. */
  disturbedHa: number;
  /** Benefit ids the community secured, used to test for electrification. */
  benefitIds?: readonly string[];
  mineLifeYr?: number;
}): AirLedger {
  const { capacityTPerYr, tier, airControlSpendUsdPerYr, disturbedHa } = input;
  const benefits = input.benefitIds ?? [];
  const electrified = ELECTRIFICATION_REQUIRES.every(r => benefits.includes(r));
  const lifeYr = input.mineLifeYr ?? 0;

  // The baseline is both uncontrolled AND un-electrified, so it is a fixed
  // reference that does not move when the community wins a benefit.
  const uncontrolled = emissionsFor({
    capacityTPerYr,
    tier,
    disturbedHa,
    electrified: false,
    dustEffectiveness: 0,
    stackEffectiveness: 0,
  });

  // The single air allocation buys two different kinds of equipment. It is
  // apportioned by each stream's uncontrolled contribution to receptor PM2.5,
  // which is the order an engineer would actually spend in. Exposed in the
  // ledger rather than hidden, so the apportionment can be argued with.
  //
  // The split is taken from the UN-ELECTRIFIED baseline deliberately. If it
  // were taken after electrification, removing diesel would re-apportion the
  // budget and change road-dust control as a side effect — so a community
  // benefit would be quietly altering a quantity it has nothing to do with.
  // Tying the split to the plant configuration keeps each lever to its own
  // effect, which is the whole reason the sources are itemised.
  const dustPm25 = uncontrolled.haulRoadPm25 + uncontrolled.handlingPm25 + uncontrolled.dieselPm25;
  const stackPm25 = uncontrolled.processPm25;
  const shareToDust = dustPm25 + stackPm25 > 0 ? dustPm25 / (dustPm25 + stackPm25) : 1;

  const dustEffectiveness = controlEffectiveness(
    airControlSpendUsdPerYr * shareToDust,
    DUST_CONTROL_MAX_EFFECTIVENESS,
  );
  const stackEffectiveness = controlEffectiveness(
    airControlSpendUsdPerYr * (1 - shareToDust),
    STACK_CONTROL_MAX_EFFECTIVENESS,
  );

  const controlled = emissionsFor({
    capacityTPerYr,
    tier,
    disturbedHa,
    electrified,
    dustEffectiveness,
    stackEffectiveness,
  });

  const receptorDefs: { id: ReceptorAir['id']; label: string; distanceM: number }[] = [
    { id: 'old_town', label: 'Old Town', distanceM: DISTANCE_TO_OLD_TOWN_M },
    { id: 'campus', label: 'University Campus', distanceM: DISTANCE_TO_CAMPUS_M },
  ];

  const receptors = receptorDefs.map(def => {
    const pm10 = annualMeanConcentrationUgM3(controlled.totalPm10, def.distanceM);
    const pm25 = annualMeanConcentrationUgM3(controlled.totalPm25, def.distanceM);

    const pm25At = (spend: number) => {
      const d = controlEffectiveness(spend * shareToDust, DUST_CONTROL_MAX_EFFECTIVENESS);
      const s = controlEffectiveness(spend * (1 - shareToDust), STACK_CONTROL_MAX_EFFECTIVENESS);
      const e = emissionsFor({
        capacityTPerYr,
        tier,
        disturbedHa,
        electrified,
        dustEffectiveness: d,
        stackEffectiveness: s,
      });
      return annualMeanConcentrationUgM3(e.totalPm25, def.distanceM);
    };

    return {
      id: def.id,
      label: def.label,
      distanceM: def.distanceM,
      pm10AnnualUgM3: pm10,
      pm25AnnualUgM3: pm25,
      pm10Verdict: verdict(pm10, WHO_GUIDELINE_PM10_ANNUAL_UG_M3, EU_LIMIT_PM10_ANNUAL_UG_M3),
      pm25Verdict: verdict(pm25, WHO_GUIDELINE_PM25_ANNUAL_UG_M3, EU_LIMIT_PM25_ANNUAL_UG_M3),
      spendToMeetLimitUsdPerYr: solveSpend(pm25At, EU_LIMIT_PM25_ANNUAL_UG_M3),
      spendToMeetGuidelineUsdPerYr: solveSpend(pm25At, WHO_GUIDELINE_PM25_ANNUAL_UG_M3),
    };
  });

  return {
    inputs: { capacityTPerYr, tier, airControlSpendUsdPerYr, disturbedHa, electrified },
    uncontrolled,
    controlled,
    control: { spendUsdPerYr: airControlSpendUsdPerYr, shareToDust, dustEffectiveness, stackEffectiveness },
    receptors,
    obligation: {
      annualUsd: airControlSpendUsdPerYr,
      mineLifeYr: lifeYr,
      lifetimeUsd: airControlSpendUsdPerYr * lifeYr,
    },
  };
}

function verdict(value: number, guideline: number, limit: number): AirVerdict {
  if (value <= guideline) return 'within_guideline';
  if (value <= limit) return 'within_limit';
  return 'exceeds_limit';
}

/**
 * Smallest annual spend reaching a target concentration, by bisection.
 * Returns null when the target is unreachable at any spend, which happens
 * whenever the uncontrolled load is far enough above the target that even the
 * control ceiling cannot close the gap. Solved numerically rather than
 * algebraically because the two control curves have different ceilings and
 * share one budget.
 */
function solveSpend(
  concentrationAt: (spendUsdPerYr: number) => number,
  targetUgM3: number,
): number | null {
  if (concentrationAt(0) <= targetUgM3) return 0;
  const ceiling = 80_000_000;
  if (concentrationAt(ceiling) > targetUgM3) return null;
  let lo = 0;
  let hi = ceiling;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (concentrationAt(mid) > targetUgM3) lo = mid;
    else hi = mid;
  }
  return hi;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
