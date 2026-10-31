import type { AirTierId } from './mitigationConstants';
import type { IndustrialSymbolType, PlacedIndustrialSymbol } from '../components/map/mapSymbols';
import {
  pointToOreBodyDistanceKm,
} from '../components/map/noBuildZones';
import {
  EXTRACTION_MAX_KM_FROM_ORE_BODY,
  MIN_FACILITY_SEPARATION_KM,
  mapPctDistanceToKm,
} from './mapScale';

export interface IndustrialScenario {
  mineSizeKm2: number;
  capacityMton: number;
  facilityTier: AirTierId;
}

const TIER_ORDER: AirTierId[] = [
  'extraction',
  'refining',
  'processing',
  'advanced_manufacturing',
];

function tierIndex(tier: AirTierId): number {
  return TIER_ORDER.indexOf(tier);
}

/** Mine &lt; 4 km² → 1; 4 km² → 2; 8 km² → 3 (6 km² mapped to 4 km² tier). */
export function maxExtractionForMineSizeKm2(mineKm2: number): number {
  if (mineKm2 >= 8) return 3;
  if (mineKm2 >= 4) return 2;
  return 1;
}

/**
 * Refining sites by capacity: one, and a second only at the largest rate.
 *
 * Was 1 / 1 / 2 / 3 by capacity, with processing matched one-for-one, which
 * put ten pins on the map at the top scenario. Beta item 23: "too many
 * processing/refining sites". It was also poor industry practice - a refinery
 * is a large fixed plant and nobody builds three of them to serve one mine.
 * One train handles up to 3 Mt/yr of ore; a second is added at 5.
 *
 * Total emissions are unaffected: the air model divides each kind's emission
 * across however many sites of that kind exist, so fewer sites concentrate the
 * same mass rather than reducing it. Fewer pins changes the geography of the
 * plume, not its size.
 */
export function maxRefiningForCapacityMton(capacityMton: number): number {
  if (capacityMton >= 5_000_000) return 2;
  return 1;
}

export type FacilityLimits = Record<IndustrialSymbolType, number>;

/** Max placable count per facility type for the locked scenario. */
export function getFacilityLimits(scenario: IndustrialScenario): FacilityLimits {
  const ti = tierIndex(scenario.facilityTier);
  const refiningCap = maxRefiningForCapacityMton(scenario.capacityMton);
  return {
    extraction: maxExtractionForMineSizeKm2(scenario.mineSizeKm2),
    refining: refiningCap,
    // One concentrator, not one per refining train. A mine has a mill.
    processing: ti >= 2 ? 1 : 0,
    advanced_manufacturing: ti >= 3 ? 1 : 0,
  };
}

/** Minimum required on map before export (same as caps for active chain types). */
export function getRequiredFacilityCounts(scenario: IndustrialScenario): FacilityLimits {
  return getFacilityLimits(scenario);
}

export function countByType(
  placements: PlacedIndustrialSymbol[]
): Record<IndustrialSymbolType, number> {
  const counts: Record<IndustrialSymbolType, number> = {
    extraction: 0,
    refining: 0,
    processing: 0,
    advanced_manufacturing: 0,
  };
  for (const p of placements) {
    counts[p.type] += 1;
  }
  return counts;
}

export function mapDistancePct(a: PlacedIndustrialSymbol, b: PlacedIndustrialSymbol): number {
  const dx = a.xPct - b.xPct;
  const dy = a.yPct - b.yPct;
  return Math.sqrt(dx * dx + dy * dy);
}

const FACILITY_LABEL: Record<IndustrialSymbolType, string> = {
  extraction: 'Extraction',
  refining: 'Refining',
  processing: 'Processing',
  advanced_manufacturing: 'Advanced manufacturing',
};

/**
 * Where a facility may stand.
 *
 * Three rules, and until 31 October 2026 there was only the first:
 *
 *  1. Extraction must be within 1 km of the ore body. You cannot mine ore you
 *     are not standing on.
 *  2. Nothing BUT extraction may stand on the ore body (item 26). It was the
 *     one piece of ground with no rule against building on it, and it is the
 *     piece the mine exists to remove - put the refinery there and you have to
 *     demolish it to reach the ore.
 *  3. No two facilities within half a kilometre of each other (items 24, 29).
 *     The spread penalty rewards clustering without any floor, so the cheapest
 *     play was to stack the entire chain on one pixel: no cost, every emission
 *     source at a single point, and no siting decision taken at all.
 *
 * `others` is the set to measure separation against. On a move it must exclude
 * the pin being moved, or a facility collides with itself and cannot be nudged.
 */
export function validateIndustrialPlacementLocation(
  type: IndustrialSymbolType,
  xPct: number,
  yPct: number,
  others: readonly PlacedIndustrialSymbol[] = []
): { ok: boolean; message?: string } {
  const distKm = pointToOreBodyDistanceKm(xPct, yPct);

  if (type === 'extraction') {
    if (distKm > EXTRACTION_MAX_KM_FROM_ORE_BODY) {
      return {
        ok: false,
        message: `Extraction must be within ${EXTRACTION_MAX_KM_FROM_ORE_BODY} km of the ore body (this site is ${distKm.toFixed(1)} km away).`,
      };
    }
  } else if (distKm <= 0) {
    return {
      ok: false,
      message: `${FACILITY_LABEL[type]} cannot stand on the ore body — that ground is going to be excavated. Only extraction belongs there.`,
    };
  }

  for (const other of others) {
    const gapKm = mapPctDistanceToKm(
      Math.hypot(xPct - other.xPct, yPct - other.yPct)
    );
    if (gapKm < MIN_FACILITY_SEPARATION_KM) {
      return {
        ok: false,
        message: `Facilities must be at least ${MIN_FACILITY_SEPARATION_KM} km apart. This site is ${gapKm.toFixed(2)} km from the ${FACILITY_LABEL[other.type].toLowerCase()} site.`,
      };
    }
  }

  return { ok: true };
}

export function canPlaceIndustrialType(
  type: IndustrialSymbolType,
  placements: PlacedIndustrialSymbol[],
  scenario: IndustrialScenario,
  xPct?: number,
  yPct?: number
): { ok: boolean; message?: string } {
  const limits = getFacilityLimits(scenario);
  const max = limits[type];
  if (max <= 0) {
    return {
      ok: false,
      message: `${type.replace(/_/g, ' ')} is not part of your locked facility tier (${scenario.facilityTier}).`,
    };
  }
  const current = placements.filter(p => p.type === type).length;
  if (current >= max) {
    const label = type.replace(/_/g, ' ');
    return {
      ok: false,
      message: `Maximum ${max} ${label} site(s) for this mine size, capacity, and facility tier.`,
    };
  }
  if (xPct !== undefined && yPct !== undefined) {
    const locationCheck = validateIndustrialPlacementLocation(type, xPct, yPct, placements);
    if (!locationCheck.ok) return locationCheck;
  }
  return { ok: true };
}

export function validateIndustrialPlacements(
  placements: PlacedIndustrialSymbol[],
  scenario: IndustrialScenario
): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  const required = getRequiredFacilityCounts(scenario);
  const counts = countByType(placements);
  const ti = tierIndex(scenario.facilityTier);

  const checkType = (type: IndustrialSymbolType, label: string) => {
    const need = required[type];
    if (need <= 0) return;
    if (counts[type] < need) {
      messages.push(`Need ${need} ${label} site(s) on map (have ${counts[type]}).`);
    } else if (counts[type] > need) {
      messages.push(`Too many ${label} sites: ${counts[type]} placed, max ${need}.`);
    }
  };

  checkType('extraction', 'extraction');
  checkType('refining', 'refining');

  // Re-check every placement against the location rules, not just extraction.
  // A pin can become invalid after it was dropped - the ore body does not
  // move, but a later pin can be dropped too close to an earlier one through a
  // path that skipped the drop check.
  placements.forEach((site, i) => {
    const others = placements.filter((_, j) => j !== i);
    const locationCheck = validateIndustrialPlacementLocation(
      site.type,
      site.xPct,
      site.yPct,
      others
    );
    if (!locationCheck.ok && !messages.includes(locationCheck.message!)) {
      messages.push(locationCheck.message!);
    }
  });

  if (ti >= 2) checkType('processing', 'processing');
  if (ti >= 3) checkType('advanced_manufacturing', 'advanced manufacturing');

  return { ok: messages.length === 0, messages };
}

export function formatFacilityPlacementSummary(
  placements: PlacedIndustrialSymbol[],
  scenario: IndustrialScenario
): string {
  const limits = getFacilityLimits(scenario);
  const counts = countByType(placements);
  const parts = (['extraction', 'refining', 'processing', 'advanced_manufacturing'] as const)
    .filter(t => limits[t] > 0)
    .map(t => `${t.replace(/_/g, ' ')} ${counts[t]}/${limits[t]}`);
  return parts.join(' · ');
}
