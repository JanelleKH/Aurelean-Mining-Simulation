/**
 * airSources.ts — adapter from placed map symbols to air-model sources.
 *
 * The model layer must not import from components, and the components must not
 * duplicate the model's types, so the translation lives here. It is deliberately
 * explicit rather than a cast: IndustrialSymbolType and AirSourceKind happen to
 * carry the same four strings today, and if either list changes this file should
 * fail to compile rather than silently mis-site a facility.
 */

import type { PlacedIndustrialSymbol, IndustrialSymbolType } from '../components/map/mapSymbols';
import type { AirSource, AirSourceKind } from '../model/index';

const KIND: Record<IndustrialSymbolType, AirSourceKind> = {
  extraction: 'extraction',
  refining: 'refining',
  processing: 'processing',
  advanced_manufacturing: 'advanced_manufacturing',
};

export function toAirSources(placed: readonly PlacedIndustrialSymbol[]): AirSource[] {
  return placed.map(p => ({ kind: KIND[p.type], xPct: p.xPct, yPct: p.yPct }));
}

/** Same, from a CSV-parsed placement record whose type is an unvalidated string. */
export function toAirSourcesFromRecords(
  records: readonly { type: string; xPct: number; yPct: number }[],
): AirSource[] {
  return records.flatMap(r => {
    const kind = KIND[r.type as IndustrialSymbolType];
    return kind ? [{ kind, xPct: r.xPct, yPct: r.yPct }] : [];
  });
}
