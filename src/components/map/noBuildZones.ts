import type { SelectableNoBuildId } from '../../data/noBuildAreas';
import { kmToMapPct, mapPctDistanceToKm, EXTRACTION_MAX_KM_FROM_ORE_BODY } from '../../data/mapScale';

/** Zone bounds as % of map image box (aligned to regional-map.png). */
export interface NoBuildZoneRect {
  id: SelectableNoBuildId;
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface MapRegionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Ore body region on regional-map.png — used for extraction siting, not a no-go zone. */
export const ORE_BODY_REGION: MapRegionRect = {
  top: 14,
  left: 34,
  width: 32,
  height: 17,
};

/** Aligned to regional-map.png (1254×1254, updated labels). */
export const NO_BUILD_ZONE_RECTS: NoBuildZoneRect[] = [
  /** Includes baked “Mountain Trails” label in the north green band. */
  { id: 'mountain', top: 0, left: 28, width: 44, height: 13 },
  { id: 'oldtown', top: 35, left: 30, width: 32, height: 27 },
  { id: 'aquifer', top: 50, left: 0, width: 58, height: 50 },
  /**
   * University Campus. The map draws it as a rotated rectangle; this is the
   * axis-aligned box around that outline, measured from the purple boundary in
   * regional-map.png (x 67.9-84.8%, y 51.4-67.7%). The box is slightly larger
   * than the drawn campus at its corners, which errs toward excluding a little
   * more than the campus rather than a little less.
   */
  { id: 'campus', top: 52, left: 68, width: 17, height: 15 },
  /** West agricultural fields flanking Mountain Trails. */
  { id: 'agriculture', top: 2, left: 2, width: 28, height: 36 },
  /** East agricultural fields flanking Mountain Trails. */
  { id: 'agriculture', top: 2, left: 70, width: 28, height: 36 },
];

export function isPointInZoneRect(
  xPct: number,
  yPct: number,
  zone: NoBuildZoneRect
): boolean {
  return (
    xPct >= zone.left &&
    xPct <= zone.left + zone.width &&
    yPct >= zone.top &&
    yPct <= zone.top + zone.height
  );
}

export function isPointInNoBuildZone(
  xPct: number,
  yPct: number,
  selectedIds: SelectableNoBuildId[]
): boolean {
  if (selectedIds.length === 0) return false;
  return NO_BUILD_ZONE_RECTS.some(
    zone => selectedIds.includes(zone.id) && isPointInZoneRect(xPct, yPct, zone)
  );
}

export function getNoBuildZonesAtPoint(
  xPct: number,
  yPct: number,
  selectedIds: SelectableNoBuildId[]
): SelectableNoBuildId[] {
  return NO_BUILD_ZONE_RECTS.filter(
    zone => selectedIds.includes(zone.id) && isPointInZoneRect(xPct, yPct, zone)
  ).map(z => z.id);
}

function clampPct(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Euclidean distance from a map point to the nearest edge of a region (0 if inside). */
export function pointToRegionDistancePct(
  xPct: number,
  yPct: number,
  region: MapRegionRect
): number {
  const nearestX = clampPct(xPct, region.left, region.left + region.width);
  const nearestY = clampPct(yPct, region.top, region.top + region.height);
  const dx = xPct - nearestX;
  const dy = yPct - nearestY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function pointToOreBodyDistanceKm(xPct: number, yPct: number): number {
  return mapPctDistanceToKm(pointToRegionDistancePct(xPct, yPct, ORE_BODY_REGION));
}

export function isWithinKmOfOreBody(xPct: number, yPct: number, maxKm: number): boolean {
  return pointToOreBodyDistanceKm(xPct, yPct) <= maxKm + 1e-9;
}

/** Visual buffer around ore body for extraction siting guide (percent of map). */
export function oreBodyExtractionBufferRect(): MapRegionRect {
  const pad = kmToMapPct(EXTRACTION_MAX_KM_FROM_ORE_BODY);
  const left = Math.max(0, ORE_BODY_REGION.left - pad);
  const top = Math.max(0, ORE_BODY_REGION.top - pad);
  return {
    top,
    left,
    width: Math.min(100 - left, ORE_BODY_REGION.width + pad * 2),
    height: Math.min(100 - top, ORE_BODY_REGION.height + pad * 2),
  };
}
