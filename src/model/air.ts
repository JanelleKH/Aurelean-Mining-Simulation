/**
 * air.ts — the air ledger.
 *
 * REBUILT 24 October 2026, second pass. The first pass replaced AIR_TIERS
 * (a bare "aqiWorst" number per tier, with no source, no receptor and no
 * distance) with a real emissions-to-concentration chain. It was physically
 * defensible and practically inert: at the reference case the Old Town sat
 * within the WHO guideline with almost no spend, so no developer would ever
 * feel it.
 *
 * The reason was a single number. Receptor distance was a fixed 2 km, which I
 * had flagged as a placeholder. The map is 10 km across, so one map-percent is
 * 100 m, and the ore body's southern edge is 4 percent — 400 m — from the Old
 * Town's northern edge. Ground-level concentration goes as roughly 1/x^2, so
 * the placeholder was wrong by a factor of about fifteen in the answer.
 *
 * The fix is not a larger emission factor. It is geometry:
 *
 *   each placed facility is its own source, at its own point on the map
 *   -> distance to the nearest edge of each inhabited receptor
 *   -> Gaussian dispersion from each source
 *   -> concentrations summed at the receptor
 *   -> tested against a binding legal limit and an advisory health guideline
 *
 * WHAT THIS BUYS. Siting becomes an air decision. The developer already drags
 * facilities onto the map; now that choice moves exposure by more than an
 * order of magnitude, because extraction may sit anywhere within 1 km of the
 * ore body — from 400 m to about 3.1 km from the town edge.
 *
 * It also creates a conflict worth having in the room. Pushing the operation
 * north, away from the town, runs it into the Mountain Trails. If the
 * community has designated the trails a no-go zone, the mine is pressed back
 * toward the houses. Protecting the trails costs the town its air, and no
 * amount of money resolves it, because the two are not denominated in the same
 * thing. That is the trade-off the framework exists to make visible, and it
 * falls out of the geometry rather than being asserted.
 *
 * THE SHAPE OF THIS DIMENSION. Control reaches 85-95%, against 60% for
 * dewatering, so air is the dimension money CAN fix. What it cannot do is fix
 * it once: control is an operating cost paid every year the mine runs, and it
 * stops the year the budget does. Water fails as an irreversible loss at a
 * threshold; air fails as a permanent obligation.
 */

import {
  AIR_CONTROL_CAPITAL_MAX_USD,
  AIR_CONTROL_SPEND_SCALE_USD,
  AIR_OM_FRACTION_OF_CAPITAL,
  AIR_RECEPTORS,
  DIESEL_PM25_G_PER_T_MOVED,
  DUST_CONTROL_MAX_EFFECTIVENESS,
  ELECTRIFICATION_DIESEL_REMOVED_FRACTION,
  ELECTRIFICATION_REQUIRES,
  EU_LIMIT_PM10_ANNUAL_UG_M3,
  EU_LIMIT_PM25_ANNUAL_UG_M3,
  FACILITY_PM25_G_PER_S,
  FACILITY_SO2_G_PER_S,
  HANDLING_PM10_G_PER_T,
  HAUL_ROAD_PM10_KG_PER_VKT,
  HAUL_VKT_PER_T_MOVED,
  MAP_PCT_TO_M,
  NOMINAL_THROUGHPUT_T_PER_YR,
  PM25_FRACTION_OF_HANDLING_PM10,
  PM25_FRACTION_OF_ROAD_PM10,
  RECEPTOR_SECTOR_FREQUENCY,
  RELEASE_HEIGHT_M,
  STACK_CONTROL_MAX_EFFECTIVENESS,
  STRIP_RATIO_UNDERGROUND,
  WHO_GUIDELINE_PM10_ANNUAL_UG_M3,
  WHO_GUIDELINE_PM25_ANNUAL_UG_M3,
  WIND_EROSION_PM10_KG_PER_HA_YR,
  WIND_SPEED_M_PER_S,
  type ReceptorRectPct,
} from './params.ts';

const SECONDS_PER_YR = 365 * 24 * 3600;

export type AirSourceKind = 'extraction' | 'refining' | 'processing' | 'advanced_manufacturing';
export type AirVerdict = 'within_guideline' | 'within_limit' | 'exceeds_limit';

/** A facility as placed on the map. Percent of map width/height. */
export type AirSource = { kind: AirSourceKind; xPct: number; yPct: number };

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

/**
 * Distance from a map point to the nearest edge of a receptor, in metres.
 * Nearest edge rather than centroid because an EU limit value is assessed
 * where people are actually exposed — the first houses, not the middle of
 * the district. Zero inside the receptor, which is then floored for the
 * dispersion model, since a plume has no meaning at zero range.
 */
export function distanceToReceptorM(xPct: number, yPct: number, rect: ReceptorRectPct): number {
  const nx = Math.max(rect.left, Math.min(xPct, rect.left + rect.width));
  const ny = Math.max(rect.top, Math.min(yPct, rect.top + rect.height));
  const dx = xPct - nx;
  const dy = yPct - ny;
  return Math.sqrt(dx * dx + dy * dy) * MAP_PCT_TO_M;
}

/* ------------------------------------------------------------------ *
 * Dispersion
 * ------------------------------------------------------------------ */

/**
 * Briggs rural dispersion coefficients, Pasquill class D (neutral), the class
 * that dominates an annual mean:
 *   sigma_y = 0.08 x (1 + 0.0001 x)^-1/2
 *   sigma_z = 0.06 x (1 + 0.0015 x)^-1/2
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
 * Minimum range for the Gaussian plume, m. Below about 100 m the model is not
 * valid and over-predicts badly, so a source placed on top of the receptor is
 * held here rather than allowed to produce an infinite concentration.
 */
export const MIN_PLUME_RANGE_M = 100;

/**
 * Ground-level centreline concentration from a ground-level source, ug/m3:
 *   C = Q / (pi u sigma_y sigma_z)
 * Q in g/s. Release height is taken as zero: right for fugitive dust, and
 * conservative for stacks, since a real stack lifts the plume and lowers the
 * nearby ground-level concentration. The twin, with real stack heights, should
 * add the exponential height term.
 */
export function centrelineConcentrationUgM3(
  emissionGPerS: number,
  distanceM: number,
  releaseHeightM = 0,
): number {
  if (!(emissionGPerS > 0)) return 0;
  const x = Math.max(MIN_PLUME_RANGE_M, distanceM);
  const sy = briggsSigmaYM(x);
  const sz = briggsSigmaZM(x);
  // Elevated release: the plume must reach the ground before anyone breathes
  // it. exp(-H^2 / 2 sigma_z^2) is near zero close to a tall stack and tends
  // to one far away, which is why a chimney protects its neighbours and
  // exports the problem downwind.
  const h = Math.max(0, releaseHeightM);
  const groundFactor = h > 0 ? Math.exp(-(h * h) / (2 * sz * sz)) : 1;
  return (emissionGPerS / (Math.PI * WIND_SPEED_M_PER_S * sy * sz)) * groundFactor * 1e6;
}

/**
 * Ground-level concentration from an AREA source, ug/m3.
 *
 * Waste dumps and tailings beaches are not points. A 118 ha facility is
 * roughly 1.1 km across, and collapsing it to a point puts its whole emission
 * through the dispersion of a chimney, which over-predicts badly at short
 * range — by more than an order of magnitude in the siting cases that matter
 * most here.
 *
 * The standard treatment (EPA virtual-source method) gives the area an initial
 * spread and adds it in quadrature to the travel-distance spread:
 *
 *   sigma_y0 = side / 4.3        sigma_z0 = height / 2.15
 *   sigma_eff = sqrt(sigma^2 + sigma_0^2)
 *
 * The divisors come from matching a uniform rectangle to a Gaussian of equal
 * area. Without this the model refuses sitings it has no business refusing.
 */
export function areaSourceConcentrationUgM3(
  emissionGPerS: number,
  distanceM: number,
  areaHa: number,
  heightM = 20,
): number {
  if (!(emissionGPerS > 0)) return 0;
  const sideM = Math.sqrt(Math.max(0, areaHa) * 10_000);
  const x = Math.max(MIN_PLUME_RANGE_M, distanceM);
  const sy = Math.hypot(briggsSigmaYM(x), sideM / 4.3);
  const sz = Math.hypot(briggsSigmaZM(x), heightM / 2.15);
  return (emissionGPerS / (Math.PI * WIND_SPEED_M_PER_S * sy * sz)) * 1e6;
}

/** Annual mean: centreline, weighted by how often the wind blows that way. */
export function annualMeanConcentrationUgM3(
  emissionGPerS: number,
  distanceM: number,
  releaseHeightM = 0,
): number {
  return centrelineConcentrationUgM3(emissionGPerS, distanceM, releaseHeightM)
    * RECEPTOR_SECTOR_FREQUENCY;
}

/** Annual mean from an area source. */
export function annualMeanAreaUgM3(
  emissionGPerS: number,
  distanceM: number,
  areaHa: number,
): number {
  return areaSourceConcentrationUgM3(emissionGPerS, distanceM, areaHa) * RECEPTOR_SECTOR_FREQUENCY;
}

/* ------------------------------------------------------------------ *
 * Control
 * ------------------------------------------------------------------ */

export function controlEffectiveness(capitalUsd: number, maxEffectiveness: number): number {
  if (!(capitalUsd > 0)) return 0;
  return maxEffectiveness * (1 - Math.exp(-capitalUsd / AIR_CONTROL_SPEND_SCALE_USD));
}

/** Annual cost of running the control equipment the capital bought. */
export function annualOmUsd(capitalUsd: number): number {
  return Math.max(0, capitalUsd) * AIR_OM_FRACTION_OF_CAPITAL;
}

/* ------------------------------------------------------------------ *
 * Emissions, per source
 * ------------------------------------------------------------------ */

export type SourceEmission = {
  kind: AirSourceKind;
  xPct: number;
  yPct: number;
  pm10GPerS: number;
  pm25GPerS: number;
  so2GPerS: number;
  /** Wind erosion off the dumps, dispersed as an area source. */
  areaPm10GPerS: number;
};

export type ReceptorAir = {
  id: string;
  label: string;
  /** Distance to the nearest source, m — the one that dominates. */
  nearestSourceM: number;
  /**
   * Distance actually used in the dispersion model, m. Below MIN_PLUME_RANGE_M
   * a Gaussian plume has no meaning, so it is floored — and the panel must show
   * this rather than nearestSourceM, or it displays a number the model did not
   * use. Rendering the app showed "nearest operation 15 m" beside a
   * concentration computed at 100 m.
   */
  modelledRangeM: number;
  /** True when a facility sits closer than the model can represent. */
  withinPlumeFloor: boolean;
  pm10AnnualUgM3: number;
  pm25AnnualUgM3: number;
  pm10Verdict: AirVerdict;
  pm25Verdict: AirVerdict;
  /**
   * Control CAPITAL bringing both pollutants inside the EU limit, or null when
   * no affordable amount does. null is the important case: it means the
   * facilities have to move, which is the decision the model exists to force.
   */
  capitalToMeetLimitUsd: number | null;
  /** Control capital reaching the WHO guideline for both, or null. */
  capitalToMeetGuidelineUsd: number | null;
  /** True when the limit is reachable only beyond what the budget allows. */
  limitNeedsRelocation: boolean;
};

export type AirLedger = {
  inputs: {
    capacityTPerYr: number;
    airControlCapitalUsd: number;
    disturbedHa: number;
    electrified: boolean;
    sourceCount: number;
  };
  sources: SourceEmission[];
  control: {
    spendUsdPerYr: number;
    shareToDust: number;
    dustEffectiveness: number;
    stackEffectiveness: number;
  };
  receptors: ReceptorAir[];
  /**
   * The hard gate. EU limit values are binding, not advisory: a scenario that
   * exceeds one is not permittable, and no benefits package buys past it. The
   * developer must move facilities, spend on control, or drop a tier.
   */
  permitting: {
    compliant: boolean;
    /** Which receptor and pollutant bind, when one does. */
    bindingReceptor: string | null;
    bindingPollutant: 'PM10' | 'PM2.5' | null;
    exceedanceUgM3: number;
    reason: string | null;
  };
  /**
   * Control is an operating cost. This is what the commitment actually costs,
   * and it is what distinguishes air from every other dimension in the model:
   * a benefit is bought once, clean air is rented.
   */
  /**
   * Capital buys the kit; operating it recurs. Both are reported, because the
   * budget charges only the first and the mine owes the second every year it
   * runs. That gap is the honest version of "clean air is rented" — and it is
   * reported in figures commensurable with the budget rather than five times
   * larger than it.
   */
  obligation: {
    capitalUsd: number;
    annualOmUsd: number;
    mineLifeYr: number;
    /** Capital plus operating cost over the life of the mine. */
    lifetimeUsd: number;
    presentValueUsd: number;
    discountRate: number;
  };
};

function buildSources(args: {
  sources: AirSource[];
  capacityTPerYr: number;
  disturbedHa: number;
  electrified: boolean;
  dustEffectiveness: number;
  stackEffectiveness: number;
}): SourceEmission[] {
  const { sources, capacityTPerYr, disturbedHa, electrified } = args;
  const dustKept = 1 - clamp01(args.dustEffectiveness);
  const stackKept = 1 - clamp01(args.stackEffectiveness);

  const extraction = sources.filter(s => s.kind === 'extraction');
  const nExtraction = Math.max(1, extraction.length);

  // Everything raised to surface moves on haul roads: ore plus waste rock.
  const materialMovedTPerYr = capacityTPerYr * (1 + STRIP_RATIO_UNDERGROUND);

  const haulPm10GPerS =
    (materialMovedTPerYr * HAUL_VKT_PER_T_MOVED * HAUL_ROAD_PM10_KG_PER_VKT * 1000) / SECONDS_PER_YR;
  const handlingPm10GPerS = (capacityTPerYr * HANDLING_PM10_G_PER_T) / SECONDS_PER_YR;
  const windPm10GPerS =
    (Math.max(0, disturbedHa) * WIND_EROSION_PM10_KG_PER_HA_YR * 1000) / SECONDS_PER_YR;
  const dieselPm25GPerS = (materialMovedTPerYr * DIESEL_PM25_G_PER_T_MOVED) / SECONDS_PER_YR;

  // Electrifying the fleet removes diesel particulate. It does nothing for
  // road dust, which is raised by the wheels of any vehicle. Keeping the two
  // apart is the point of itemising sources at all.
  const electrifiedFactor = electrified ? 1 - ELECTRIFICATION_DIESEL_REMOVED_FRACTION : 1;

  const throughputScale = capacityTPerYr / NOMINAL_THROUGHPUT_T_PER_YR;
  const kindCount = (k: AirSourceKind) => Math.max(1, sources.filter(s => s.kind === k).length);

  return sources.map(s => {
    let pm10 = 0;
    let pm25 = 0;
    let so2 = 0;
    let areaPm10 = 0;

    if (s.kind === 'extraction') {
      // Fugitive sources sit at the workings: haulage, run-of-mine handling,
      // and wind off the dumps. Shared equally across extraction sites.
      const share = 1 / nExtraction;
      const haul = haulPm10GPerS * share * dustKept;
      const handling = handlingPm10GPerS * share * dustKept;
      const diesel = dieselPm25GPerS * share * electrifiedFactor * dustKept;
      pm10 += haul + handling + diesel;
      pm25 += haul * PM25_FRACTION_OF_ROAD_PM10 + handling * PM25_FRACTION_OF_HANDLING_PM10 + diesel;
      // Wind erosion is kept separate because it disperses as an area source,
      // not from a point. Bundling it here was over-predicting by roughly an
      // order of magnitude at close range.
      areaPm10 += windPm10GPerS * share * dustKept;
    } else {
      const share = 1 / kindCount(s.kind);
      const p = (FACILITY_PM25_G_PER_S[s.kind] ?? 0) * throughputScale * share * stackKept;
      const q = (FACILITY_SO2_G_PER_S[s.kind] ?? 0) * throughputScale * share * stackKept;
      pm10 += p;
      pm25 += p;
      so2 += q;
    }

    return {
      kind: s.kind, xPct: s.xPct, yPct: s.yPct,
      pm10GPerS: pm10, pm25GPerS: pm25, so2GPerS: so2,
      areaPm10GPerS: areaPm10,
    };
  });
}

export function computeAirLedger(input: {
  sources: AirSource[];
  capacityTPerYr: number;
  airControlCapitalUsd: number;
  /** Disturbed ground from the waste ledger, ha. Wind erosion scales with it. */
  disturbedHa: number;
  benefitIds?: readonly string[];
  mineLifeYr?: number;
  discountRate?: number;
  receptors?: ReceptorRectPct[];
}): AirLedger {
  const { sources, capacityTPerYr, airControlCapitalUsd, disturbedHa } = input;
  const benefits = input.benefitIds ?? [];
  const electrified = ELECTRIFICATION_REQUIRES.every(r => benefits.includes(r));
  const lifeYr = input.mineLifeYr ?? 0;
  const discountRate = input.discountRate ?? 0.03;
  const receptorDefs = input.receptors ?? AIR_RECEPTORS;

  // Baseline is uncontrolled AND un-electrified, so the apportionment below is
  // a property of the plant configuration and does not shift when the
  // community wins a benefit. Without this, electrification would quietly
  // re-apportion the budget and change road-dust control as a side effect.
  const baseline = buildSources({
    sources, capacityTPerYr, disturbedHa,
    electrified: false, dustEffectiveness: 0, stackEffectiveness: 0,
  });
  // Apportioning the one allocation between dust kit and stack kit.
  //
  // CORRECTED: this was split by each stream's share of PM2.5, which starved
  // dust control of the budget — stacks dominate fine particulate, so dust
  // received about a tenth of the money while COARSE dust was the thing
  // actually breaching the limit. The budget was buying the wrong equipment.
  //
  // It now spends against whichever pollutant sits closest to its limit at the
  // most exposed receptor, which is what an engineer facing a permit refusal
  // would do. Computed at the receptor rather than at the stack, so elevated
  // releases are weighted by what actually reaches the ground.
  const worstRect = receptorDefs.reduce((worst, rect) => {
    const here = Math.max(
      concentrationFrom(baseline, rect, 'pm10') / EU_LIMIT_PM10_ANNUAL_UG_M3,
      concentrationFrom(baseline, rect, 'pm25') / EU_LIMIT_PM25_ANNUAL_UG_M3,
    );
    const best = Math.max(
      concentrationFrom(baseline, worst, 'pm10') / EU_LIMIT_PM10_ANNUAL_UG_M3,
      concentrationFrom(baseline, worst, 'pm25') / EU_LIMIT_PM25_ANNUAL_UG_M3,
    );
    return here > best ? rect : worst;
  }, receptorDefs[0]);

  const dustSet = baseline.filter(s => s.kind === 'extraction');
  const stackSet = baseline.filter(s => s.kind !== 'extraction');
  const pm10Ratio = concentrationFrom(baseline, worstRect, 'pm10') / EU_LIMIT_PM10_ANNUAL_UG_M3;
  const pm25Ratio = concentrationFrom(baseline, worstRect, 'pm25') / EU_LIMIT_PM25_ANNUAL_UG_M3;
  const binding: 'pm10' | 'pm25' = pm10Ratio >= pm25Ratio ? 'pm10' : 'pm25';
  const dustAtReceptor = concentrationFrom(dustSet, worstRect, binding);
  const stackAtReceptor = concentrationFrom(stackSet, worstRect, binding);
  const shareToDust =
    dustAtReceptor + stackAtReceptor > 0
      ? dustAtReceptor / (dustAtReceptor + stackAtReceptor)
      : 1;

  const effAt = (spend: number) => ({
    dust: controlEffectiveness(spend * shareToDust, DUST_CONTROL_MAX_EFFECTIVENESS),
    stack: controlEffectiveness(spend * (1 - shareToDust), STACK_CONTROL_MAX_EFFECTIVENESS),
  });

  const e = effAt(airControlCapitalUsd);
  const built = buildSources({
    sources, capacityTPerYr, disturbedHa, electrified,
    dustEffectiveness: e.dust, stackEffectiveness: e.stack,
  });

  const concentrationsAt = (spend: number, rect: ReceptorRectPct) => {
    const eff = effAt(spend);
    const set = buildSources({
      sources, capacityTPerYr, disturbedHa, electrified,
      dustEffectiveness: eff.dust, stackEffectiveness: eff.stack,
    });
    let pm10 = 0;
    let pm25 = 0;
    for (const s of set) {
      const d = distanceToReceptorM(s.xPct, s.yPct, rect);
      const h = RELEASE_HEIGHT_M[s.kind] ?? 0;
      pm10 += annualMeanConcentrationUgM3(s.pm10GPerS, d, h);
      pm25 += annualMeanConcentrationUgM3(s.pm25GPerS, d, h);
      // Dump and tailings dust spreads from an area, not a point.
      pm10 += annualMeanAreaUgM3(s.areaPm10GPerS, d, disturbedHa);
    }
    return { pm10, pm25 };
  };

  const receptors: ReceptorAir[] = receptorDefs.map(rect => {
    const now = concentrationsAt(airControlCapitalUsd, rect);
    const nearest = sources.length
      ? Math.min(...sources.map(s => distanceToReceptorM(s.xPct, s.yPct, rect)))
      : Number.POSITIVE_INFINITY;

    const meets = (target: { pm10: number; pm25: number }) => (spend: number) => {
      const c = concentrationsAt(spend, rect);
      return c.pm10 <= target.pm10 && c.pm25 <= target.pm25;
    };

    const limitCapital = solveCapital(
      meets({ pm10: EU_LIMIT_PM10_ANNUAL_UG_M3, pm25: EU_LIMIT_PM25_ANNUAL_UG_M3 }),
    );

    return {
      id: rect.id,
      label: rect.label,
      nearestSourceM: nearest,
      modelledRangeM: Math.max(MIN_PLUME_RANGE_M, nearest),
      withinPlumeFloor: nearest < MIN_PLUME_RANGE_M,
      pm10AnnualUgM3: now.pm10,
      pm25AnnualUgM3: now.pm25,
      pm10Verdict: verdict(now.pm10, WHO_GUIDELINE_PM10_ANNUAL_UG_M3, EU_LIMIT_PM10_ANNUAL_UG_M3),
      pm25Verdict: verdict(now.pm25, WHO_GUIDELINE_PM25_ANNUAL_UG_M3, EU_LIMIT_PM25_ANNUAL_UG_M3),
      capitalToMeetLimitUsd: limitCapital,
      capitalToMeetGuidelineUsd: solveCapital(
        meets({ pm10: WHO_GUIDELINE_PM10_ANNUAL_UG_M3, pm25: WHO_GUIDELINE_PM25_ANNUAL_UG_M3 }),
      ),
      limitNeedsRelocation: limitCapital === null,
    };
  });

  // The gate: worst exceedance across receptors and pollutants.
  let bindingReceptor: string | null = null;
  let bindingPollutant: 'PM10' | 'PM2.5' | null = null;
  let exceedanceUgM3 = 0;
  for (const r of receptors) {
    const over10 = r.pm10AnnualUgM3 - EU_LIMIT_PM10_ANNUAL_UG_M3;
    const over25 = r.pm25AnnualUgM3 - EU_LIMIT_PM25_ANNUAL_UG_M3;
    if (over10 > exceedanceUgM3) {
      exceedanceUgM3 = over10;
      bindingReceptor = r.label;
      bindingPollutant = 'PM10';
    }
    if (over25 > exceedanceUgM3) {
      exceedanceUgM3 = over25;
      bindingReceptor = r.label;
      bindingPollutant = 'PM2.5';
    }
  }
  const compliant = bindingReceptor === null;

  const capitalUsd = airControlCapitalUsd;
  const omUsd = annualOmUsd(capitalUsd);
  return {
    inputs: {
      capacityTPerYr, airControlCapitalUsd, disturbedHa, electrified,
      sourceCount: sources.length,
    },
    sources: built,
    control: {
      spendUsdPerYr: airControlCapitalUsd,
      shareToDust,
      dustEffectiveness: e.dust,
      stackEffectiveness: e.stack,
    },
    receptors,
    permitting: {
      compliant,
      bindingReceptor,
      bindingPollutant,
      exceedanceUgM3,
      // Deliberately does NOT repeat "cannot be permitted as sited": the places
      // that display this already say so, and rendering the panel showed the
      // sentence twice inside the same red box.
      reason: compliant
        ? null
        : `${bindingPollutant} at the ${bindingReceptor} is ${exceedanceUgM3.toFixed(1)} ug/m3 over the EU annual limit value.`,
    },
    obligation: {
      capitalUsd,
      annualOmUsd: omUsd,
      mineLifeYr: lifeYr,
      lifetimeUsd: capitalUsd + omUsd * lifeYr,
      presentValueUsd: capitalUsd + presentValueOfAnnuity(omUsd, discountRate, lifeYr),
      discountRate,
    },
  };
}

/** Annual-mean concentration at a receptor from a set of built sources. */
function concentrationFrom(
  set: SourceEmission[],
  rect: ReceptorRectPct,
  pollutant: 'pm10' | 'pm25',
): number {
  let total = 0;
  for (const s of set) {
    const d = distanceToReceptorM(s.xPct, s.yPct, rect);
    const h = RELEASE_HEIGHT_M[s.kind] ?? 0;
    total += annualMeanConcentrationUgM3(
      pollutant === 'pm10' ? s.pm10GPerS : s.pm25GPerS,
      d,
      h,
    );
    if (pollutant === 'pm10') {
      total += annualMeanAreaUgM3(s.areaPm10GPerS, d, 0);
    }
  }
  return total;
}

function verdict(value: number, guideline: number, limit: number): AirVerdict {
  if (value <= guideline) return 'within_guideline';
  if (value <= limit) return 'within_limit';
  return 'exceeds_limit';
}

/**
 * Smallest annual spend satisfying a predicate, by bisection. Returns null when
 * no spend does — which is the honest answer when a facility is sited so close
 * to the houses that the control ceiling cannot close the gap, and is the point
 * at which the developer must move rather than pay.
 */
function solveCapital(satisfiedAt: (capitalUsd: number) => boolean): number | null {
  if (satisfiedAt(0)) return 0;
  // Capped at what the application actually allows a developer to allocate.
  // Returning null for anything beyond it is the point: a figure larger than
  // the budget is not an option, it is a instruction to move the facilities,
  // and quoting an unaffordable number as though it were a choice was the
  // error this replaces.
  const ceiling = AIR_CONTROL_CAPITAL_MAX_USD;
  if (!satisfiedAt(ceiling)) return null;
  let lo = 0;
  let hi = ceiling;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (satisfiedAt(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function presentValueOfAnnuity(annual: number, rate: number, years: number): number {
  if (!(years > 0)) return 0;
  if (rate <= 0) return annual * years;
  return annual * ((1 - Math.pow(1 + rate, -years)) / rate);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
