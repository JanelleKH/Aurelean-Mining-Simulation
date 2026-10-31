/** Regional map represents a square region of this width/height in kilometers. */
export const MAP_EXTENT_KM = 10;

/** 1 km on the map equals this many percent of map width/height (10 km map → 10% per km). */
export const KM_TO_MAP_PCT = 100 / MAP_EXTENT_KM;

export const MAP_PCT_TO_KM = MAP_EXTENT_KM / 100;

/** Facility spread ≤ this distance (km) incurs 0% budget penalty. */
export const SPREAD_PENALTY_ZERO_AT_KM = 1;

/** Extraction sites must be within this distance (km) of the ore body region. */
export const EXTRACTION_MAX_KM_FROM_ORE_BODY = 1;

/**
 * Nothing but extraction may stand on the ore body.
 *
 * Beta item 26: "nothing else other than extraction should be on the ore
 * region". Only extraction had any location rule at all, so a team could put
 * the refinery, the concentrator and the advanced manufacturing plant on top
 * of the ore body - which is the one piece of ground the mine exists to
 * remove. Build there and you have to demolish it to reach the ore.
 */
export const ORE_BODY_IS_EXTRACTION_ONLY = true;

/**
 * No two facilities may sit closer than this (km).
 *
 * Beta items 24 and 29: there was no limit on how many sites could occupy one
 * spot and no buffer between them, and the facility spread penalty rewards
 * clustering without bound. The optimal play was therefore to stack the whole
 * industrial chain on a single pixel, which costs nothing, concentrates every
 * emission source at one point, and is not a siting decision at all. Real
 * plants need working room, haul roads and separation between hazards.
 *
 * Half a kilometre is deliberately modest: enough to stop a stack, not enough
 * to dictate a layout. The trade-off the exercise wants - cluster for cost,
 * spread for air quality at the Old Town - survives intact.
 */
export const MIN_FACILITY_SEPARATION_KM = 0.5;

export function mapPctDistanceToKm(pctDistance: number): number {
  return pctDistance * MAP_PCT_TO_KM;
}

export function kmToMapPct(km: number): number {
  return km * KM_TO_MAP_PCT;
}

export function formatMapDistanceKm(pctDistance: number, digits = 1): string {
  return `${mapPctDistanceToKm(pctDistance).toFixed(digits)} km`;
}
