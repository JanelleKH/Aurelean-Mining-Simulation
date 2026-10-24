/**
 * params.ts — every physical prior in the model, in one file, with provenance.
 *
 * Rule for this file: a number lives here only if it is either (a) an observable
 * quantity with a source, or (b) a calibration constant whose chosen value is
 * stated along with what it was calibrated against. No number appears in the
 * hydrology or ledger code itself.
 *
 * REVISED 24 October 2026 after researching real mine dewatering. The previous
 * version used DEWATERING_M3_PER_D_PER_KM2 = 1500, per km2 of licence area, as
 * an admitted calibration. Two things were wrong with it and one was right:
 *
 *   - WRONG DENOMINATOR. Inflow does not scale with the footprint of the
 *     workings. At Reocin (Cantabria, karstic carbonate) workings of 1.08 km2
 *     took 1,100-1,299 L/s, which is about 88,000 m3/d per km2 of workings —
 *     sixty times the old figure.
 *   - WRONG EQUATION. The old figure was fed to a steady-state solution while
 *     exceeding the aquifer's recharge, which no steady state can do.
 *   - RIGHT MAGNITUDE, wrong label. Per km2 of the aquifer the workings drain,
 *     two independent karst mines agree closely with 1500: see below.
 *
 * Units are named in the identifier. m3 = cubic metres, d = day, yr = year.
 */

/* ------------------------------------------------------------------ *
 * Scenario space (mirrors src/data/mitigationConstants.ts)
 * ------------------------------------------------------------------ */

/** Licence-area options offered to the community, km2. */
export const MINE_SIZES_KM2 = [0.5, 1.0, 2.0, 4.0, 8.0] as const;

/** Throughput options offered to the developer, tonnes of ore milled per year. */
export const CAPACITIES_T_PER_YR = [500_000, 1_500_000, 3_000_000, 5_000_000] as const;

/* ------------------------------------------------------------------ *
 * Process water
 * ------------------------------------------------------------------ */

/**
 * Gross process-water demand per tonne of ore milled. Hard-rock (spodumene)
 * concentration is reported at 0.15-0.7 m3/t net make-up; 0.5 is mid-range and
 * is the figure the existing app already uses implicitly.
 */
export const PROCESS_WATER_M3_PER_T_ORE = 0.5;

/** Share of process water recirculated in the plant. 70-85% typical. */
export const PROCESS_WATER_RECYCLE_FRACTION = 0.75;

/* ------------------------------------------------------------------ *
 * The aquifer
 * ------------------------------------------------------------------ */

/**
 * Outcrop area of the karst aquifer beneath the city, km2. From the El Calerizo
 * figures in the case research: about 14 km2 at outcrop within a 30 km2 recharge
 * area, in the core of a syncline sealed above and below by slates and
 * quartzites.
 */
export const AQUIFER_OUTCROP_AREA_KM2 = 14.0;

/**
 * Natural recharge, m3/d. El Calerizo averages about 3 hm3/yr.
 *
 * This number is the discipline on everything else in the water ledger. An
 * operating mine that pumps more than this is not drawing water, it is draining
 * storage, and the drawdown keeps growing for as long as it does so.
 */
export const AQUIFER_RECHARGE_M3_PER_D = 3.0e6 / 365;

/**
 * Steady-state inflow to workings, m3/d per km2 of aquifer HYDRAULICALLY
 * CONNECTED to them (not per km2 of workings). Two independent karst analogues:
 *
 *   Far West Rand, Bank Compartment (dolomitic karst, 170 km2, dewatered by
 *   West Driefontein from 1969): active dewatering averaged 252 Ml/d = 1,482
 *   m3/d per km2 of compartment; the 1968 inrush 386 Ml/d = 2,271; the 1996
 *   steady state 61 Ml/d = 359.
 *
 *   Reocin (Cantabria, karstic carbonate, closed 2003): 1,100-1,299 L/s against
 *   a 44 km2 watershed = 2,160-2,551 m3/d per km2 of catchment.
 *
 * 1,800 is mid-range across the two. Confidence: moderate. Both are zinc-lead
 * rather than lithium, which does not matter — this is a property of the
 * aquifer, not of the ore.
 *
 * Internal check: full capture of 14 km2 at this rate gives 25,200 m3/d, which
 * is 3.1x recharge. Both analogues pumped 4-6x recharge during operation, so
 * the two routes to the same number agree.
 */
export const SPECIFIC_INFLOW_M3_PER_D_PER_KM2_CONNECTED = 1_800;

/**
 * Area scale over which workings capture the aquifer, km2.
 *
 * CALIBRATION, and the one genuinely soft parameter left. Karst captures
 * disproportionately: at Reocin 1.08 km2 of workings drained a 44 km2
 * watershed, because conduits connect what the footprint does not touch. So
 * capture saturates fast. Modelled as 1 - exp(-area / scale), which at 1.5
 * gives 28% capture at 0.5 km2 and 99.5% at 8 km2.
 */
export const AQUIFER_CAPTURE_SCALE_KM2 = 1.5;

/**
 * Transmissivity, m2/d. Far West Rand derivations: 285 from dewatering data,
 * 2,468 from inrush data, 1,818 and 2,983 in the earlier literature, against a
 * stated regional range of 1,000-25,000. 1,000 is the low-central case and the
 * conservative choice for drawdown; TRANSMISSIVITY_HIGH is carried so the
 * sensitivity can be shown rather than hidden.
 */
export const AQUIFER_TRANSMISSIVITY_M2_PER_D = 1_000;
export const AQUIFER_TRANSMISSIVITY_HIGH_M2_PER_D = 2_500;

/**
 * Storativity, dimensionless. 0.0067 from the Bank Compartment, derived from
 * the 1968 inrush by two independent methods, with zonal values averaging about
 * 0.5%. Needed for the transient solution; a steady-state solution has no use
 * for it, which is part of why the old model could ignore time.
 */
export const AQUIFER_STORATIVITY = 0.0067;

/** Radius of influence, m. Only used by the steady-state reference solution. */
export const AQUIFER_RADIUS_OF_INFLUENCE_M = 10_000;

/* ------------------------------------------------------------------ *
 * Compartments — a DESIGN PROPOSAL, flagged as such
 * ------------------------------------------------------------------ */

/**
 * PROPOSAL, 24 October 2026, awaiting Janelle's decision. Set
 * CISTERN_IN_SEPARATE_COMPARTMENT = false to get the physically unmitigated
 * result, in which the cistern is lost in every scenario at any price.
 *
 * The Far West Rand aquifer is divided by dolerite dykes into compartments —
 * Venterspost, Bank, Oberholzer — and dewatering one did not drain its
 * neighbours. That is the documented structure that makes a threshold possible
 * here: the workings and the cistern sit in different compartments, and the
 * question is whether the mine breaches the barrier between them.
 *
 * It also moves the water question from "how much" to "where", which is what a
 * no-go zone is for, and which is the part of the model being rebuilt next.
 */
export const CISTERN_IN_SEPARATE_COMPARTMENT = true;

/**
 * Licence area above which the workings must cross the compartment barrier,
 * km2. DESIGN PARAMETER: this single number decides where the cistern is lost,
 * and at 2.0 the community can take a mine up to 2 km2 without touching it.
 */
export const COMPARTMENT_BREACH_AREA_KM2 = 2.0;

/**
 * Share of the computed drawdown transmitted across an intact barrier.
 * Compartment dykes leak; they do not seal. 0.08 is chosen so an intact barrier
 * protects the cistern across the whole unbreached range rather than only just.
 * No measured value was found for dyke leakage, so this is a calibration.
 */
export const INTACT_BARRIER_LEAKAGE_FRACTION = 0.08;

/* ------------------------------------------------------------------ *
 * Receptors
 * ------------------------------------------------------------------ */

/**
 * Distances from the centre of the workings to each receptor, m.
 * PLACEHOLDER: should be read from the map once siting is expressed in km
 * rather than map percentage.
 */
export const DISTANCE_TO_CISTERN_M = 2_000;
export const DISTANCE_TO_FARM_WELLS_M = 3_000;

/**
 * Available water column in the Old Cistern, m. Fed by the water table, not by
 * rainfall: drawdown beyond this empties it, and nothing refills it.
 */
export const CISTERN_AVAILABLE_COLUMN_M = 1.2;

/** Drawdown at which the shallow agricultural wells stop yielding, m. */
export const FARM_WELL_AVAILABLE_DRAWDOWN_M = 2.0;

/* ------------------------------------------------------------------ *
 * Water mitigation
 * ------------------------------------------------------------------ */

/**
 * Maximum achievable reduction in net inflow through grouting and reinjection.
 * Grout curtains in karst are reported to cut inflow by roughly 30-70%; conduit
 * flow makes full sealing unachievable. 0.6 is the optimistic end, deliberately,
 * so the model cannot be accused of making losses artificially unavoidable.
 */
export const WATER_MITIGATION_MAX_EFFECTIVENESS = 0.6;

/** Spend scale of the mitigation response, USD: 1 - exp(-spend / scale). */
export const WATER_MITIGATION_SPEND_SCALE_USD = 4_000_000;

/* ------------------------------------------------------------------ *
 * Reserve, mine life, voids
 * ------------------------------------------------------------------ */

/** Contained ore per km2 of licence area, tonnes. CALIBRATION. */
export const ORE_T_PER_KM2 = 15_000_000;

/** Bulk density of ore, t/m3. */
export const ORE_DENSITY_T_PER_M3 = 2.7;

/**
 * Taylor's Rule with the lithium correction from the priors research:
 * life_yr = 0.25 * tonnes^0.25. Used to flag size-and-rate pairs that are not
 * real mine plans rather than to set life, which follows from reserve/capacity.
 */
export const TAYLOR_COEFFICIENT = 0.25;
export const TAYLOR_EXPONENT = 0.25;

/** Tolerance on the Taylor check: a life this many times off is implausible. */
export const TAYLOR_PLAUSIBILITY_FACTOR = 2.0;

/* ------------------------------------------------------------------ *
 * Waste and tailings
 * ------------------------------------------------------------------ */

/**
 * Strip ratio for an UNDERGROUND mine: tonnes of waste rock raised per tonne of
 * ore. Observed: Wolfsberg 0.38:1, and the underground band in the priors
 * research is 0.1-0.4:1. 0.25 is central.
 *
 * For contrast, the open-pit band is 3.5-8:1 (James Bay 3.6, Greenbushes 4.93,
 * Barroso 5.2, Kathleen Valley 6.8, Pilgangoora 7.6, Keliber 5.0-9.7). The
 * decision that this mine is underground is what makes the waste stream small
 * and the water stream large.
 */
export const STRIP_RATIO_UNDERGROUND = 0.25;

/**
 * Mass yield inputs for spodumene concentration. y = feed x recovery /
 * concentrate, validated to within a percentage point across seven operations
 * in the priors research. At these values y = 15%, so tailings are 0.85 t per
 * tonne of ore - the larger waste stream by mass, and one the old model did not
 * represent at all.
 */
export const FEED_GRADE_LI2O = 0.012;
export const RECOVERY_FRACTION = 0.72;
export const CONCENTRATE_GRADE_LI2O = 0.0575;

/**
 * Share of tailings that cemented paste backfill can take underground. Binder
 * content and void geometry cap this well below unity; 0.55 is a working figure
 * and a CALIBRATION, not an observation.
 *
 * This is where the three ledgers meet. Backfill reduces the surface tailings
 * footprint AND protects the Old Town from subsidence AND destroys the canoe
 * route, because a backfilled gallery is not navigable. One parameter, three
 * consequences pulling in different directions.
 */
export const BACKFILL_TAILINGS_UPTAKE = 0.55;

/**
 * Footprint fitted from tonnage, USGS Open-File Report 03-143:
 * waste dump area (ha) = 0.59 x waste (Mt) + 16, at a 100 m lift;
 * tailings area (ha) = 1.57 x tailings (Mt) + 13, at 50 m.
 *
 * Deriving area FROM tonnage is the correction. The old model did the reverse,
 * setting waste from area.
 */
export const WASTE_DUMP_AREA_HA_PER_MT = 0.59;
export const WASTE_DUMP_AREA_INTERCEPT_HA = 16;
export const TAILINGS_AREA_HA_PER_MT = 1.57;
export const TAILINGS_AREA_INTERCEPT_HA = 13;

/* ------------------------------------------------------------------ *
 * Post-closure rebound
 * ------------------------------------------------------------------ */

/** Years of water-table recovery per metre of drawdown once pumping stops. */
export const REBOUND_YR_PER_M_DRAWDOWN = 4.0;

/** Share of total gallery length lying near the rebound horizon. */
export const GALLERY_FRACTION_AT_REBOUND_HORIZON = 0.12;

/** Metres of gallery driven per tonne of ore extracted. */
export const GALLERY_M_PER_T_ORE = 0.0008;

/** Minimum navigable length for the canoe benefit to be deliverable, m. */
export const CANOE_MIN_NAVIGABLE_LENGTH_M = 800;
