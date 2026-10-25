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

/* ================================================================== *
 * AIR
 *
 * Added 24 October 2026. Air was the last dimension still represented
 * only by AIR_TIERS in src/data/mitigationConstants.ts, where a tier
 * carried a bare "aqiWorst" number (0 / 100 / 150 / 200) with no
 * source, no receptor and no distance. Participants could not check it
 * and it could not be argued with.
 *
 * The structure below differs from water in one way that matters. The
 * cistern is a threshold money cannot cross. Dust and stack emissions
 * are the opposite: control technology is genuinely effective, so air
 * is the dimension money CAN buy down — but only by spending every year
 * it operates. Water fails as an irreversible loss; air fails as a
 * recurring obligation that stops the moment the budget does.
 * ================================================================== */

/* ---- Fugitive dust: haul roads -------------------------------------
 * Haul-road dust is the largest fugitive source at most surface
 * operations, commonly over half of site PM10.
 *
 * US EPA AP-42 13.2.2 (unpaved industrial roads):
 *   E = k (s/12)^a (W/3)^b
 * For PM10: k = 1.5 lb/VMT, a = 0.9, b = 0.45. At silt s = 8.3% and
 * mean vehicle weight W = 32 t, this gives ~1.5 lb/VMT ~ 0.42 kg/VKT
 * uncontrolled. */
export const HAUL_ROAD_PM10_KG_PER_VKT = 0.42;

/** AP-42 gives PM2.5 for road dust as about a tenth of PM10. */
export const PM25_FRACTION_OF_ROAD_PM10 = 0.10;

/**
 * Vehicle-kilometres travelled per tonne of material moved.
 * CALIBRATION: ~4 km of loaded-plus-empty haulage per 1000 t, which is
 * a short surface haul from portal to plant and dump, consistent with
 * an underground operation whose surface movements are modest.
 */
export const HAUL_VKT_PER_T_MOVED = 0.004;

/* ---- Fugitive dust: handling and wind erosion ---------------------- */

/**
 * Crushing, conveying, transfer and stockpiling, g PM10 per tonne
 * handled, uncontrolled. AP-42 13.2.4 aggregate handling and 11.19.2
 * crushed stone processing sum to roughly this for a primary and
 * secondary circuit with open transfer points.
 */
export const HANDLING_PM10_G_PER_T = 12;

/** Handling dust is coarser than combustion but finer than road dust. */
export const PM25_FRACTION_OF_HANDLING_PM10 = 0.15;

/**
 * Wind erosion from exposed waste dump and tailings surfaces,
 * kg PM10 per hectare per year. Active unvegetated tailings beaches are
 * the worst dust source on many sites. Ties the air ledger to the waste
 * ledger's footprint: more land disturbed is more dust, every year.
 */
export const WIND_EROSION_PM10_KG_PER_HA_YR = 400;

/* ---- Diesel ---------------------------------------------------------
 * Diesel particulate is almost entirely PM2.5 and is the fraction most
 * clearly tied to health effects. It is also the fraction that
 * electrifying the haul fleet removes outright, which is how the
 * workforce-training and energy-storage benefits reach this ledger.
 */
export const DIESEL_PM25_G_PER_T_MOVED = 1.2;

/* ---- Process emissions, per facility kind ---------------------------
 * Stack emissions in g/s at the nominal throughput below, PER FACILITY
 * KIND rather than cumulatively by tier, because each facility is now a
 * separate source at its own place on the map and disperses from there.
 *
 * Refining roasts and acid-leaches: SO2 and acid mist, the largest stack
 * source. Processing mixes and coats cathode and anode material: fine
 * particulate and solvent. Advanced manufacturing runs dry rooms and
 * cell assembly, which is solvent-dominated with little particulate.
 *
 * A full chain sums to 2.9 g/s PM2.5 and 7.2 g/s SO2, which is where the
 * earlier cumulative-by-tier figures landed.
 *
 * CALIBRATION against the tier structure already in the application
 * rather than against a measured plant. Still the weakest set of numbers
 * in this file.
 */
export const NOMINAL_THROUGHPUT_T_PER_YR = 3_000_000;

/**
 * Release height by facility kind, m.
 *
 * Added after the first run of the siting model, which released everything at
 * ground level and therefore blamed the refinery chimney for a problem that
 * belongs to the haul road. Plume rise is the entire reason tall stacks exist:
 * a 45 m release barely reaches the ground within a few hundred metres, while
 * dust raised by a truck is already there.
 *
 * Getting this wrong does not just change a number, it changes which source
 * binds — and a model that points the community at the wrong source would
 * send them to negotiate for the wrong thing.
 *
 * Fugitive sources (haulage, handling, wind erosion) are at grade by
 * definition. Process stacks on a plant of this size run 40-60 m.
 */
export const RELEASE_HEIGHT_M: Record<string, number> = {
  extraction: 0,
  refining: 45,
  processing: 45,
  advanced_manufacturing: 30,
};

export const FACILITY_PM25_G_PER_S: Record<string, number> = {
  extraction: 0,
  refining: 1.8,
  processing: 0.8,
  advanced_manufacturing: 0.3,
};
export const FACILITY_SO2_G_PER_S: Record<string, number> = {
  extraction: 0,
  refining: 6.0,
  processing: 1.2,
  advanced_manufacturing: 0.0,
};

/* ---- Control effectiveness ------------------------------------------
 * The contrast with water. Watering unpaved roads gives 50-75% control
 * and chemical stabilisers up to 90% (AP-42 13.2.2); enclosure and
 * baghouses on transfer points reach 95-99%; scrubbers on roasting
 * gases 90-95%. So the ceiling here is high, and the reason air is
 * still a problem is not that control fails but that it must be paid
 * for continuously.
 */
export const DUST_CONTROL_MAX_EFFECTIVENESS = 0.85;
export const STACK_CONTROL_MAX_EFFECTIVENESS = 0.95;

/**
 * Capital scale, USD. Effectiveness approaches its maximum as
 * 1 - exp(-capital / scale).
 *
 * CORRECTED 24 October 2026. This was read as an annual figure and the
 * application's air allocation was fed into it directly — but that allocation
 * is a one-off budget line capped at $6M, drawn from a total budget of roughly
 * $20-35M. Treating it as a yearly cost made the panel report a lifetime
 * obligation of $120M against a $25M budget, and quote compliance costs of
 * $16M a year to a developer whose cap is $6M once. Two numbers on one screen
 * that could not both be true.
 *
 * The correct reading is capital. Water trucks, sprays, enclosures, baghouses
 * and scrubbers are equipment you buy; what recurs is operating them. So the
 * budget line buys the kit, and the annual cost is derived from it below.
 *
 * At the $6M cap this reaches 0.91 of the available curve, so the existing
 * slider range is already well matched and needs no rescaling.
 */
export const AIR_CONTROL_SPEND_SCALE_USD = 2_500_000;

/** Ceiling on air-control capital in the application (AIR_SPEND_MAX_USD). */
export const AIR_CONTROL_CAPITAL_MAX_USD = 6_000_000;

/**
 * Annual operating and maintenance cost of air-control equipment, as a share
 * of its capital cost. Dust suppression and gas cleaning are conventionally
 * 10-20% of capital a year: water, power, reagent, filter media, labour.
 *
 * This is what keeps the "rented, not bought" point alive without pretending
 * the budget charges it. At the $6M cap it is about $0.9M a year, so roughly
 * $24M over a twenty-year life — a figure commensurable with the budget and
 * with a $5M community benefit, which $120M was not.
 */
export const AIR_OM_FRACTION_OF_CAPITAL = 0.15;

/* ---- Meteorology and dispersion ------------------------------------ */

/** Mean wind speed used in the Gaussian plume, m/s. */
export const WIND_SPEED_M_PER_S = 3.0;

/**
 * Fraction of the year the wind blows from the workings toward a given
 * receptor. A 30-degree sector with a mild prevailing direction. This
 * is what converts a centreline worst case into an annual mean, and it
 * is the number most worth replacing with a real wind rose in the twin.
 */
export const RECEPTOR_SECTOR_FREQUENCY = 0.15;

/* ---- Air receptors: geometry, not a placeholder ---------------------
 * REVISED 24 October 2026. These were fixed distances of 2 km and 3.5 km,
 * which I had flagged as placeholders and which turned out to be the
 * reason the air dimension never bound. The map is 10 km across, so one
 * map-percent is 100 m, and the ore body's southern edge sits 4 percent
 * from the Old Town's northern edge: 400 m, not 2 km. Ground-level
 * concentration under a Gaussian plume goes as roughly 1/x^2, so the
 * error was a factor of about fifteen in the answer.
 *
 * Distance is now measured from each placed facility to the nearest edge
 * of the receptor, which is the right convention for a limit value: EU
 * compliance is assessed where people are actually exposed, not at the
 * centroid of a district. It also makes siting an air decision, since
 * the developer already chooses where these facilities go.
 *
 * MIRRORS src/data/mapScale.ts and src/components/map/noBuildZones.ts.
 * The duplication is deliberate — the model layer must not import from
 * components — but the two should be unified when siting is expressed in
 * kilometres throughout.
 */
export const MAP_EXTENT_KM = 10;
export const MAP_PCT_TO_M = (MAP_EXTENT_KM * 1000) / 100;

export type ReceptorRectPct = {
  id: string;
  label: string;
  top: number;
  left: number;
  width: number;
  height: number;
};

/** Inhabited and occupied places where exposure is assessed. */
export const AIR_RECEPTORS: ReceptorRectPct[] = [
  { id: 'old_town', label: 'Old Town', top: 35, left: 30, width: 32, height: 27 },
  { id: 'campus', label: 'University Campus', top: 52, left: 68, width: 17, height: 15 },
];

/* ---- Thresholds -----------------------------------------------------
 * Two of them, deliberately. The legal limit is what the developer must
 * meet. The health guideline is what actually protects people. The gap
 * between them is wide for PM2.5 — 25 against 5 — and a mine can sit
 * lawfully inside it for forty years. Showing both is the point: a
 * single "compliant" verdict would hide exactly the distributional
 * question the framework exists to ask.
 *
 * EU limit values: Directive 2008/50/EC, Annex XI.
 * Health guidelines: WHO global air quality guidelines, 2021.
 */
export const EU_LIMIT_PM10_ANNUAL_UG_M3 = 40;
export const EU_LIMIT_PM25_ANNUAL_UG_M3 = 25;
export const WHO_GUIDELINE_PM10_ANNUAL_UG_M3 = 15;
export const WHO_GUIDELINE_PM25_ANNUAL_UG_M3 = 5;

/**
 * Benefits that reach the air ledger. Electrifying the haul fleet
 * removes diesel particulate outright but does nothing for road dust,
 * which is raised by the wheels of any vehicle, electric or not.
 *
 * It requires BOTH the workforce-training benefit and the energy-storage
 * research benefit: the first supplies people who can maintain the
 * fleet, the second the charging and storage it runs on. One without
 * the other does not deliver it.
 */
export const ELECTRIFICATION_REQUIRES = ['workforce', 'research'] as const;
export const ELECTRIFICATION_DIESEL_REMOVED_FRACTION = 0.9;
