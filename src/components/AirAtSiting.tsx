/**
 * What this siting does to the air, shown while the siting is being done.
 *
 * Added 31 October 2026. Beta items 24 and 26 were reported as "no incentive
 * to move further away" and "too many sites in one area", and the obvious
 * reading is that the model needs another penalty. It does not. The
 * counter-force already exists and it is physically real: concentration at a
 * receptor falls with roughly the square of distance, and the ore body sits
 * directly north of the Old Town, so the budget's spread penalty pulls the
 * whole chain toward the worst place for air.
 *
 * The problem was never the economics, it was the timing. The cost of
 * spreading is immediate, in dollars, on the siting screen. The cost of
 * clustering was deferred to Step 3, in micrograms, behind a switch. One side
 * of the trade-off was shouting and the other was whispering, so of course
 * teams clustered.
 *
 * So the consequence is shown at the moment of the decision, and nothing is
 * invented to counteract an incentive we created ourselves. Inventing a cost
 * to cancel a cost is how a model stops being explicable.
 *
 * It reports the UNCONTROLLED case, because at siting nothing has been spent
 * yet, and says so: this is what the geography gives you before money.
 */

import { computeAirLedger, computeWasteLedger, computeWaterLedger } from '../model/index';
import { toAirSources } from '../data/airSources';
import type { PlacedIndustrialSymbol } from './map/mapSymbols';

const AIR_TONE: Record<string, { chip: string; word: string }> = {
  within_guideline: { chip: 'bg-green-100 text-green-900 border-green-300', word: 'healthy' },
  within_limit: { chip: 'bg-amber-100 text-amber-900 border-amber-300', word: 'lawful, not healthy' },
  exceeds_limit: { chip: 'bg-red-100 text-red-900 border-red-400', word: 'unlawful' },
};
const RANK: Record<string, number> = { within_guideline: 0, within_limit: 1, exceeds_limit: 2 };
const worse = (a: string, b: string) => ((RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b);

export interface AirAtSitingProps {
  mineSizeKm2: number;
  capacityTPerYr: number;
  placedIndustrial: readonly PlacedIndustrialSymbol[];
}

export function AirAtSiting({ mineSizeKm2, capacityTPerYr, placedIndustrial }: AirAtSitingProps) {
  const sources = toAirSources(placedIndustrial);

  if (sources.length === 0) {
    return (
      <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-[11px] leading-snug text-gray-600">
        <span className="font-bold text-gray-800">Air at the Old Town.</span> Place a facility and
        this fills in. Where the operation sits decides this more than anything you spend on it
        later: concentration falls with roughly the square of distance, so a few hundred metres is
        worth more than the whole air budget.
      </div>
    );
  }

  const waste = computeWasteLedger({ mineSizeKm2, capacityTPerYr });
  const water = computeWaterLedger({
    mineSizeKm2,
    capacityTPerYr,
    waterMitigationSpendUsd: 0,
  });
  const air = computeAirLedger({
    sources,
    capacityTPerYr,
    // Nothing has been spent at this point in the sequence, and that is the
    // honest thing to show: the geography before the money.
    airControlCapitalUsd: 0,
    disturbedHa: waste.footprint.totalDisturbedHa,
    mineLifeYr: water.timing.mineLifeYr,
  });

  return (
    <div
      className={
        'rounded-lg border-2 px-3 py-2 ' +
        (air.permitting.compliant ? 'border-gray-300 bg-gray-50' : 'border-red-400 bg-red-50')
      }
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-xs font-bold text-gray-800">
          Air from this siting, before any spending
        </span>
        <span className="text-[10px] text-gray-500">µg/m³, annual mean</span>
      </div>

      {!air.permitting.compliant && (
        <p className="mt-1 text-[11px] font-semibold leading-snug text-red-900">
          As sited, this cannot be permitted. EU limit values are binding law, so no benefits
          package and no amount of control equipment buys past it from here — the facilities move,
          or the plan does not happen.
        </p>
      )}

      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        {air.receptors.map(r => {
          const verdict = worse(r.pm10Verdict, r.pm25Verdict);
          const tone = AIR_TONE[verdict];
          return (
            <div key={r.id} className="rounded border border-gray-200 bg-white px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-gray-800">{r.label}</span>
                <span
                  className={'rounded-full border px-1.5 py-0.5 text-[9px] font-bold ' + tone.chip}
                >
                  {tone.word}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-gray-700">
                PM10 <strong>{r.pm10AnnualUgM3.toFixed(1)}</strong>
                <span className="text-gray-400"> /40</span>
                {'  ·  '}
                PM2.5 <strong>{r.pm25AnnualUgM3.toFixed(1)}</strong>
                <span className="text-gray-400"> /25</span>
              </div>
              <div className="text-[10px] text-gray-500">
                nearest facility {Math.round(r.nearestSourceM)} m
                {r.withinPlumeFloor && ' (closer than the model can resolve)'}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-[10px] leading-snug text-gray-600">
        Two thresholds. The EU limit values of 40 and 25 are binding law. The WHO guidelines of 15
        and 5 are about five times stricter and have no legal force, so an operation can sit
        lawfully between them for its whole life — which is the gap the community has to argue in.
        Moving a facility costs budget through the spread penalty and buys more clean air than the
        air slider will.
      </p>
    </div>
  );
}
