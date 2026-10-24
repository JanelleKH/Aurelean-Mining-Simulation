/**
 * footprint.ts — facilities occupy ground.
 *
 * Work plan B8, decided 24 October 2026: facilities have a footprint.
 *
 * The defect this replaces: overlap with a no-go zone was tested on the
 * marker's single center point, so a plant drawn half inside the Old Town
 * passed the check. If a no-go zone is a veto over any infrastructure or
 * operations, then any part of the facility inside the zone is a breach, and
 * the test has to be area against area rather than point against area.
 *
 * Footprint sizes are in km and converted to map percent, so they stay correct
 * if the map scale changes. They are order-of-magnitude figures for an
 * industrial plant and its immediate yard, not surveyed dimensions.
 */

import { kmToMapPct } from '../data/mapScale.ts';

export type FacilityKind = 'extraction' | 'refining' | 'processing' | 'advanced_manufacturing';

/**
 * Plan dimensions of each facility and its yard, km. CALIBRATION, and stated as
 * such: a shaft head and headgear with its stockpile and workshops occupies a
 * few hundred metres; a concentrator with thickeners and a reagent plant is
 * larger; a chemical conversion plant larger again.
 */
export const FACILITY_SIZE_KM: Record<FacilityKind, { width: number; height: number }> = {
  extraction: { width: 0.4, height: 0.4 },
  refining: { width: 0.6, height: 0.5 },
  processing: { width: 0.7, height: 0.6 },
  advanced_manufacturing: { width: 0.8, height: 0.6 },
};

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The footprint of a facility placed at a map point, in map percent. */
export function facilityFootprint(kind: FacilityKind, xPct: number, yPct: number): Rect {
  const size = FACILITY_SIZE_KM[kind] ?? FACILITY_SIZE_KM.extraction;
  const w = kmToMapPct(size.width);
  const h = kmToMapPct(size.height);
  return { left: xPct - w / 2, top: yPct - h / 2, width: w, height: h };
}

/** True when two axis-aligned rectangles share any area. Touching edges do not count. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

/** Area of overlap between two rectangles, in map percent squared. */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Share of the facility's own footprint that lies inside the other rectangle, 0-1. */
export function overlapFractionOfFacility(facility: Rect, zone: Rect): number {
  const area = facility.width * facility.height;
  return area > 0 ? overlapArea(facility, zone) / area : 0;
}
