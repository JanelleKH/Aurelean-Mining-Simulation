/**
 * params.ts — every physical prior in the model, in one file, with provenance.
 *
 * Rule for this file: a number lives here only if it is either (a) an observable
 * quantity with a source, or (b) a calibration constant whose chosen value is
 * stated along with what it was calibrated against. No number appears in the
 * hydrology or ledger code itself.
 *
 * Units are named in the identifier. m3 = cubic metres, d = day, yr = year.
 */

/* ------------------------------------------------------------------ *
 * Scenario space (mirrors src/data/mitigationConstants.ts)
 * ------------------------------------------------------------------ */

/** Licence-area options offered to the community, km². */
export const MINE_SIZES_KM2 = [0.5, 1.0, 2.0, 4.0, 8.0] as const;

/** Throughput options offered to the developer, tonnes of ore milled per year. */
export const CAPACITIES_T_PER_YR = [500_000, 1_500_000, 3_000_000, 5_000_000] as const;

/* ------------------------------------------------------------------ *
 * Process water
 * ------------------------------------------------------------------ */

/**
 * Gross process-water demand per tonne of ore milled.
 * Hard-rock (spodumene) concentration by dense-media separation and flotation
 * is reported in the range 0.3-0.8 m3/t of ore. 0.5 is mid-range and is also
 * the figure the existing app already uses implicitly: its CAPACITIES table
 * lists water = 0.5 x capacity.
 */
export const PROCESS_WATER_M3_PER_T_ORE = 0.5;

/**
 * Share of process water recirculated within the plant. Modern concentrators
 * run 70-85% recycle; 0.75 is the central case. The remainder is the makeup
 * volume that must be withdrawn and is genuinely consumed (entrained in
 * tailings moisture, evaporated from ponds).
 */
export const PROCESS_WATER_RECYCLE_FRACTION = 0.75;

/* ------------------------------------------------------------------ *
 * Mine dewatering
 * ------------------------------------------------------------------ */

/**
 * Steady-state groundwater inflow to underground workings, per km2 of licence
 * area. CALIBRATION, not an observation: chosen so that the 8 km2 case yields
 * ~12,000 m3/d (139 L/s), which sits inside the range reported for large
 * carbonate- and karst-hosted underground operations (tens to a few hundred
 * L/s), and the 0.5 km2 case yields ~750 m3/d (8.7 L/s), a small operation.
 *
 * This is the single most important number in the water ledger and the one most
 * in need of a real site analogue. Flagged for the RA.
 */
export const DEWATERING_M3_PER_D_PER_KM2 = 1_500;

/**
 * Share of dewatering discharge returned to the same aquifer system rather than
 * sent to surface water. Without deliberate reinjection this is near zero:
 * dewatering discharge is conventionally routed to a watercourse, which is why
 * dewatering shows as a very large withdrawal with almost no consumption but a
 * very large drawdown. That asymmetry is the reason water needs a ledger rather
 * than a score.
 */
export const DEWATERING_BASE_REINJECTION_FRACTION = 0.0;

/* ------------------------------------------------------------------ *
 * Aquifer (karst) and receptors
 * ------------------------------------------------------------------ */

/**
 * Transmissivity of the aquifer beneath the city, m2/d. Karst systems carrying
 * conduit flow are highly transmissive; 500-2000 m2/d is a normal band for a
 * conduit-influenced carbonate aquifer. 1000 is the central case.
 *
 * Consequence of karst, which the briefings now state: drawdown propagates far
 * and fast along conduits, so a distant receptor is not safe by distance alone.
 */
export const AQUIFER_TRANSMISSIVITY_M2_PER_D = 1_000;

/** Radius of influence used in the Thiem solution, m. */
export const AQUIFER_RADIUS_OF_INFLUENCE_M = 10_000;

/**
 * Distances from the centre of the workings to each receptor, m.
 * PLACEHOLDER: these should be read from the map once facility placement is
 * expressed in km rather than in map percentage. Until then they are fixed at
 * values consistent with the drawn map.
 */
export const DISTANCE_TO_CISTERN_M = 2_000;
export const DISTANCE_TO_FARM_WELLS_M = 3_000;

/**
 * Available water column in the Old Cistern, m. The cistern is fed by the water
 * table, not by rainfall. Drawdown greater than this empties it, and refilling
 * it is not something money can do.
 *
 * DESIGN PARAMETER. At 1.2 m the cistern survives up to 2 km2 unaided, survives
 * 4 km2 with moderate mitigation, and cannot be saved at 8 km2 at any price.
 * Raising it softens that threshold; lowering it brings the loss forward.
 */
export const CISTERN_AVAILABLE_COLUMN_M = 1.2;

/**
 * Drawdown at which the shallow agricultural wells stop yielding, m. Set so
 * that agriculture is harmed only at the largest mine and can be bought back
 * cheaply, in deliberate contrast to the cistern, which cannot be bought back
 * at all. The asymmetry between a replaceable and an irreplaceable harm is the
 * point of having both receptors.
 */
export const FARM_WELL_AVAILABLE_DRAWDOWN_M = 2.0;

/* ------------------------------------------------------------------ *
 * Water mitigation (grout curtains, reinjection, recycling)
 * ------------------------------------------------------------------ */

/**
 * Maximum achievable reduction in net dewatering rate through grouting and
 * reinjection. Grout curtains in karst are reported to cut inflow by roughly
 * 30-70%; conduit flow makes full sealing unachievable. 0.6 is the optimistic
 * end of the credible range, deliberately, so that the model cannot be accused
 * of making the cistern loss artificially unavoidable.
 */
export const WATER_MITIGATION_MAX_EFFECTIVENESS = 0.6;

/**
 * Spend scale of the mitigation response, USD. Effectiveness approaches its
 * maximum as 1 - exp(-spend / scale).
 *
 * Chosen so the full slider range buys most of the available effect without the
 * upper half being dead. This replaces the existing app behaviour where the
 * slider step equalled the decay constant, so each click removed two thirds of
 * what remained and the top half of the range bought almost nothing
 * (code review item 4.12).
 */
export const WATER_MITIGATION_SPEND_SCALE_USD = 4_000_000;

/* ------------------------------------------------------------------ *
 * Reserve, mine life, voids
 * ------------------------------------------------------------------ */

/**
 * Contained ore per km2 of licence area, tonnes. CALIBRATION: gives 7.5 Mt at
 * 0.5 km2 and 120 Mt at 8 km2, so mine lives land between roughly 15 and 25
 * years across the scenario space, which is the range the briefings imply.
 */
export const ORE_T_PER_KM2 = 15_000_000;

/** Bulk density of ore, t/m3, used to convert extracted tonnes to void volume. */
export const ORE_DENSITY_T_PER_M3 = 2.7;

/* ------------------------------------------------------------------ *
 * Post-closure rebound
 * ------------------------------------------------------------------ */

/**
 * Years of water-table recovery per metre of drawdown once pumping stops.
 * Karst recovers quickly relative to porous media. CALIBRATION: gives ~3 years
 * at 2 km2 and ~12 years at 8 km2, so the canoe benefit is a promise that
 * matures inside a graduate's career and well after the negotiation.
 */
export const REBOUND_YR_PER_M_DRAWDOWN = 4.0;

/** Share of total gallery length lying near the rebound horizon, hence floatable. */
export const GALLERY_FRACTION_AT_REBOUND_HORIZON = 0.12;

/** Metres of gallery driven per tonne of ore extracted. */
export const GALLERY_M_PER_T_ORE = 0.0008;

/** Minimum navigable length for the canoe benefit to be deliverable at all, m. */
export const CANOE_MIN_NAVIGABLE_LENGTH_M = 800;
