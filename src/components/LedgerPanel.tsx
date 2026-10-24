/**
 * LedgerPanel — the water and waste ledgers, in physical units, with no total.
 *
 * Added 24 October 2026. This is the first place the src/model layer appears in
 * the interface. It deliberately shows two separate ledgers side by side and
 * never sums them: a cubic metre of water and a tonne of tailings are not the
 * same kind of thing, and a single figure underneath them would hide the
 * trade-off the exercise exists to make visible.
 */

import { useState } from 'react';
import { computeWasteLedger, computeWaterLedger } from '../model/index';

const fmt = (n: number, digits = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n);
const usd = (n: number | null) =>
  n === null ? 'no amount' : '$' + (n / 1_000_000).toFixed(1) + 'M';

const VERDICT_STYLE: Record<string, string> = {
  safe: 'text-green-700',
  at_risk: 'text-amber-700',
  lost: 'text-red-700 font-bold',
};
const VERDICT_WORD: Record<string, string> = {
  safe: 'holds',
  at_risk: 'at risk',
  lost: 'lost',
};

export interface LedgerPanelProps {
  mineSizeKm2: number;
  capacityTPerYr: number;
  waterMitigationSpendUsd: number;
}

export function LedgerPanel({
  mineSizeKm2,
  capacityTPerYr,
  waterMitigationSpendUsd,
}: LedgerPanelProps) {
  const [backfillPct, setBackfillPct] = useState(0);

  const water = computeWaterLedger({
    mineSizeKm2,
    capacityTPerYr,
    waterMitigationSpendUsd,
  });
  const waste = computeWasteLedger({
    mineSizeKm2,
    capacityTPerYr,
    backfillFraction: backfillPct / 100,
  });

  const cistern = water.receptors[0];
  const wells = water.receptors[1];

  return (
    <div className="mt-6 border-2 border-gray-900 rounded-lg overflow-hidden">
      <div className="bg-gray-900 text-white px-4 py-2">
        <h3 className="font-bold text-base">Impact ledgers</h3>
        <p className="text-xs text-gray-300 mt-0.5">
          Reported in physical units and never added together. There is no overall score here on
          purpose.
        </p>
      </div>

      {!water.timing.plausibleMinePlan && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 text-sm text-amber-900">
          <strong>Not a fundable plan.</strong> This size and rate give a {fmt(water.timing.mineLifeYr)}
          -year mine life, where a reserve of {fmt(waste.tonnage.oreMinedT / 1e6, 0)} Mt would normally
          be mined over about {fmt(water.timing.taylorLifeYr)} years.
        </div>
      )}

      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-300">
        {/* ------------------------------ WATER ------------------------------ */}
        <div className="p-4">
          <h4 className="font-bold text-sm uppercase tracking-wide text-gray-700 mb-2">
            Water — cubic metres and metres of drawdown
          </h4>
          <dl className="text-sm space-y-1">
            <Row label="Pumped out of the aquifer">
              {fmt(water.mitigation.netDewateringM3PerDay)} m³/day
            </Row>
            <Row label="Against natural recharge">
              <span className={water.balance.spendingStorage ? 'text-red-700 font-semibold' : ''}>
                {water.balance.multipleOfRecharge.toFixed(1)}×
              </span>
            </Row>
            <Row label="Process water consumed">
              {fmt(water.volumes.consumed / 1000)}k m³/yr
            </Row>
            <Row label="Mine life">{fmt(water.timing.mineLifeYr, 1)} years</Row>
          </dl>

          {water.balance.spendingStorage && (
            <p className="mt-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded p-2">
              The mine takes more than the aquifer receives, so the shortfall comes out of stored
              water and the water table keeps falling for as long as pumping continues.{' '}
              {fmt(water.balance.storageDepletedM3 / 1e6, 1)} million m³ of storage over the life of
              the mine.
            </p>
          )}

          <div className="mt-3 pt-3 border-t border-gray-200">
            <h5 className="font-semibold text-xs uppercase text-gray-600 mb-1">What depends on it</h5>
            <dl className="text-sm space-y-1">
              <Row label="Old Cistern">
                <span className={VERDICT_STYLE[cistern.verdict]}>
                  {VERDICT_WORD[cistern.verdict]}
                </span>{' '}
                <span className="text-gray-500 text-xs">
                  ({cistern.drawdownM.toFixed(2)} m of {cistern.toleranceM.toFixed(2)} m
                  {cistern.shieldedByBarrier ? ', barrier intact' : ', barrier breached'})
                </span>
              </Row>
              {cistern.verdict === 'lost' && (
                <Row label="Would saving it be possible?">
                  <span className={cistern.spendToSaveUsd === null ? 'text-red-700 font-bold' : ''}>
                    {cistern.spendToSaveUsd === null
                      ? 'No. No amount of mitigation reaches it.'
                      : `${usd(cistern.spendToSaveUsd)} on reinjection and grouting`}
                  </span>
                </Row>
              )}
              <Row label="Agricultural wells">
                <span className={VERDICT_STYLE[wells.verdict]}>{VERDICT_WORD[wells.verdict]}</span>{' '}
                <span className="text-gray-500 text-xs">
                  ({wells.drawdownM.toFixed(2)} m of {wells.toleranceM.toFixed(2)} m)
                </span>
              </Row>
            </dl>
          </div>
        </div>

        {/* ------------------------------ WASTE ------------------------------ */}
        <div className="p-4">
          <h4 className="font-bold text-sm uppercase tracking-wide text-gray-700 mb-2">
            Waste and land — tonnes and hectares
          </h4>
          <dl className="text-sm space-y-1">
            <Row label="Ore mined, life of mine">
              {fmt(waste.tonnage.oreMinedT / 1e6, 1)} Mt
            </Row>
            <Row label="Waste rock raised">{fmt(waste.tonnage.wasteRockT / 1e6, 1)} Mt</Row>
            <Row label="Tailings produced">{fmt(waste.tonnage.tailingsT / 1e6, 1)} Mt</Row>
            <Row label="Concentrate shipped">
              {fmt(waste.massYield.concentrateT / 1e6, 2)} Mt
              <span className="text-gray-500 text-xs">
                {' '}
                ({(waste.massYield.yieldFraction * 100).toFixed(0)}% of ore)
              </span>
            </Row>
          </dl>

          <div className="mt-3">
            <label className="block text-xs font-semibold uppercase text-gray-600 mb-1">
              Tailings placed underground as paste backfill: {backfillPct}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={backfillPct}
              onChange={e => setBackfillPct(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-gray-600 mt-1">
              Backfill shrinks the surface impoundment and supports the ground under the Old Town —
              and a backfilled gallery cannot be paddled, so it also removes the underground canoe.
              One decision, three consequences.
            </p>
          </div>

          <dl className="text-sm space-y-1 mt-3 pt-3 border-t border-gray-200">
            <Row label="Tailings to surface">
              {fmt(waste.tonnage.tailingsToSurfaceT / 1e6, 1)} Mt
            </Row>
            <Row label="Waste dump footprint">{fmt(waste.footprint.wasteDumpHa)} ha</Row>
            <Row label="Tailings impoundment">{fmt(waste.footprint.tailingsImpoundmentHa)} ha</Row>
            <Row label="Total disturbed ground">
              <span className={waste.footprint.exceedsLicenceArea ? 'text-red-700 font-bold' : ''}>
                {fmt(waste.footprint.totalDisturbedHa)} ha
              </span>{' '}
              <span className="text-gray-500 text-xs">
                (licence allows {fmt(waste.footprint.licenceAreaHa)} ha)
              </span>
            </Row>
          </dl>

          {waste.footprint.exceedsLicenceArea && (
            <p className="mt-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded p-2">
              The dumps and impoundment need more ground than the community's licence area. Either
              the licence has to grow, more tailings go underground, or the plan does not fit.
            </p>
          )}
        </div>
      </div>

      <div className="bg-gray-50 border-t border-gray-300 px-4 py-2 text-xs text-gray-600">
        Waste follows the tonnage mined, not the licence area, and the footprint is derived from the
        tonnage. Air is not yet rebuilt and is still reported as an index elsewhere in the app.
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-gray-900 text-right">{children}</dd>
    </div>
  );
}
