import React from 'react';
import clsx from 'clsx';
import { KM_TO_MAP_PCT, EXTRACTION_MAX_KM_FROM_ORE_BODY, kmToMapPct } from '../../data/mapScale';
import { ORE_BODY_REGION } from './noBuildZones';

export interface MapScaleBarProps {
  className?: string;
}

/**
 * 1 km scale bar. Must be a direct child of the map image overlay (explicit width)
 * so percentage width resolves against the map image, not a shrink-wrapped wrapper.
 *
 * Made legible 31 October 2026. Beta item 3 asked to "make sure there is a
 * kilometer legend on the map" — and there already was one. It was an 8px
 * label in a translucent white chip, sitting on a dark aerial photograph, in
 * the corner. Present and invisible are the same thing to a room working at
 * speed, so the question was never whether it existed but whether anyone could
 * find it. It is now a solid white plaque with a full border, readable type,
 * and the distance named twice — once as the bar and once in words.
 */
export const MapScaleBar: React.FC<MapScaleBarProps> = ({ className }) => (
  // The OUTER element carries the percentage width, because that is what makes
  // the bar one kilometre long rather than merely labelled as one. It must stay
  // a percentage of the map image: a fixed pixel width would look identical and
  // be wrong at every size but one.
  <div
    className={clsx('absolute bottom-2 left-2 z-20 pointer-events-none', className)}
    style={{ width: `${KM_TO_MAP_PCT}%` }}
    aria-label="Map scale: 1 kilometer"
  >
    <div className="rounded border-2 border-gray-900 bg-white px-1 py-1 shadow-lg">
      <div className="h-2 w-full border-b-[3px] border-l-[3px] border-r-[3px] border-gray-900 box-border" />
      <span className="mt-1 block text-center text-[11px] font-extrabold leading-none text-gray-900">
        1 km
      </span>
    </div>
  </div>
);

/** SVG path for a stadium (rounded rect): ore rect expanded by radius with circular corners. */
export function oreBodyStadiumPath(padPct: number): string {
  const { left, top, width, height } = ORE_BODY_REGION;
  const r = padPct;
  const x0 = left - r;
  const y0 = top - r;
  const x1 = left + width + r;
  const y1 = top + height + r;
  // Inner corners of the original rect (where arcs center)
  const ix0 = left;
  const iy0 = top;
  const ix1 = left + width;
  const iy1 = top + height;

  // Outer stadium: straight edges offset by r, arcs at corners
  return [
    `M ${ix0} ${y0}`,
    `L ${ix1} ${y0}`,
    `A ${r} ${r} 0 0 1 ${x1} ${iy0}`,
    `L ${x1} ${iy1}`,
    `A ${r} ${r} 0 0 1 ${ix1} ${y1}`,
    `L ${ix0} ${y1}`,
    `A ${r} ${r} 0 0 1 ${x0} ${iy1}`,
    `L ${x0} ${iy0}`,
    `A ${r} ${r} 0 0 1 ${ix0} ${y0}`,
    'Z',
  ].join(' ');
}

export interface ExtractionZoneGuideProps {
  visible?: boolean;
  className?: string;
}

/**
 * 1 km Euclidean buffer around the ore body rectangle (stadium / rounded-rect),
 * matching `pointToRegionDistancePct` placement rules.
 */
export const ExtractionZoneGuide: React.FC<ExtractionZoneGuideProps> = ({
  visible = true,
  className,
}) => {
  if (!visible) return null;

  const pad = kmToMapPct(EXTRACTION_MAX_KM_FROM_ORE_BODY);
  const stadium = oreBodyStadiumPath(pad);
  const { left, top, width, height } = ORE_BODY_REGION;

  return (
    <svg
      className={clsx('absolute inset-0 w-full h-full pointer-events-none z-[5]', className)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <title>Extraction sites must be placed within 1 km of the ore body</title>
      <path
        d={stadium}
        fill="rgba(245, 158, 11, 0.12)"
        stroke="rgba(217, 119, 6, 0.75)"
        strokeWidth={0.35}
        strokeDasharray="1.2 0.8"
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        fill="rgba(120, 113, 108, 0.08)"
        stroke="rgba(87, 83, 78, 0.45)"
        strokeWidth={0.25}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};
