/**
 * The air reading, on the map, at the place it is a reading of.
 *
 * Added 31 October 2026 alongside the panel below the map. Both exist for the
 * same reason - the cost of clustering was two steps away while the cost of
 * spreading was immediate - but they do different jobs. The panel gives the
 * figures and the thresholds. These badges put the consequence at the point of
 * impact, so a team dragging a refinery toward the Old Town watches the number
 * over the Old Town change as they do it. A figure in a panel is something you
 * read afterwards; a figure on the thing it describes is something you steer by.
 *
 * Positioned from AIR_RECEPTORS, which is the same rectangle the air model
 * measures distance to, so the badge sits over the ground it reports on and
 * cannot drift away from it.
 */

import clsx from 'clsx';
import { AIR_RECEPTORS } from '../../model/params';

const TONE: Record<string, string> = {
  within_guideline: 'bg-green-600/95 border-green-800',
  within_limit: 'bg-amber-500/95 border-amber-700',
  exceeds_limit: 'bg-red-600/95 border-red-800',
};
const RANK: Record<string, number> = { within_guideline: 0, within_limit: 1, exceeds_limit: 2 };
const worse = (a: string, b: string) => ((RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b);

export interface ReceptorReading {
  id: string;
  label: string;
  pm10AnnualUgM3: number;
  pm25AnnualUgM3: number;
  pm10Verdict: string;
  pm25Verdict: string;
}

export interface AirReceptorBadgesProps {
  readings: readonly ReceptorReading[];
}

export function AirReceptorBadges({ readings }: AirReceptorBadgesProps) {
  if (readings.length === 0) return null;

  return (
    <>
      {readings.map(r => {
        const rect = AIR_RECEPTORS.find(x => x.id === r.id);
        if (!rect) return null;
        const verdict = worse(r.pm10Verdict, r.pm25Verdict);
        return (
          <div
            key={r.id}
            className="absolute z-20 pointer-events-none -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${rect.left + rect.width / 2}%`,
              top: `${rect.top + rect.height / 2}%`,
            }}
          >
            <div
              className={clsx(
                'rounded-md border-2 px-1.5 py-1 text-center text-white shadow-lg',
                TONE[verdict] ?? 'bg-gray-600/95 border-gray-800'
              )}
            >
              <div className="text-[9px] font-bold uppercase leading-none tracking-wide opacity-90">
                {r.label}
              </div>
              <div className="mt-0.5 text-[11px] font-extrabold leading-none">
                PM2.5 {r.pm25AnnualUgM3.toFixed(1)}
              </div>
              <div className="text-[9px] font-semibold leading-none opacity-90">
                PM10 {r.pm10AnnualUgM3.toFixed(1)}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
