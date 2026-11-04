/**
 * LedgerPanel — the water, waste and air ledgers, in physical units, with no total.
 *
 * Added 24 October 2026. This is the first place the src/model layer appears in
 * the interface. It deliberately shows two separate ledgers side by side and
 * never sums them: a cubic metre of water and a tonne of tailings are not the
 * same kind of thing, and a single figure underneath them would hide the
 * trade-off the exercise exists to make visible.
 *
 * Collapsed by default since 31 October 2026. Beta testers split two ways on
 * this panel: the technical teams wanted every figure, and everyone else found
 * the wall of numbers the most overwhelming thing on the screen. So the detail
 * sits behind a switch, and what stays on show when the switch is off is the
 * part that cannot be optional — one verdict per ledger, and the worst case in
 * each, because a summary that reported the best case would be lying by
 * selection. A team can run the whole exercise without opening this panel and
 * still cannot miss that the Old Cistern is lost.
 */

import { useState } from 'react';
import {
  computeWasteLedger,
  computeWaterLedger,
  computeAirLedger,
  computePostClosure,
  CANOE_MIN_NAVIGABLE_LENGTH_M,
} from '../model/index';
import { toAirSources } from '../data/airSources';
import type { PlacedIndustrialSymbol } from './map/mapSymbols';

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

const AIR_STYLE: Record<string, string> = {
  within_guideline: 'text-green-700',
  within_limit: 'text-amber-700',
  exceeds_limit: 'text-red-700 font-bold',
};
const AIR_WORD: Record<string, string> = {
  within_guideline: 'healthy',
  within_limit: 'lawful, not healthy',
  exceeds_limit: 'unlawful',
};
const AIR_RANK: Record<string, number> = {
  within_guideline: 0,
  within_limit: 1,
  exceeds_limit: 2,
};
const worse = (a: string, b: string) => ((AIR_RANK[a] ?? 0) >= (AIR_RANK[b] ?? 0) ? a : b);

/** Tone of the collapsed-state verdict chips. Three states, plus not-yet-known. */
type Tone = 'good' | 'warn' | 'bad' | 'unknown';
const CHIP_DOT: Record<Tone, string> = {
  good: 'bg-green-400',
  warn: 'bg-amber-400',
  bad: 'bg-red-400',
  unknown: 'bg-gray-500',
};

export interface LedgerPanelProps {
  mineSizeKm2: number;
  capacityTPerYr: number;
  waterMitigationSpendUsd: number;
  /** Air depends on WHERE the facilities are, so the panel needs the placements. */
  placedIndustrial?: readonly PlacedIndustrialSymbol[];
  /** The one-off air allocation from the budget. Capital, not an annual cost. */
  airControlCapitalUsd?: number;
  /**
   * Benefits secured, for the haul-fleet electrification pair. Normally absent
   * on this screen, because benefits are chosen after mitigation — the panel
   * says so rather than silently reporting electrification as refused.
   */
  benefitIds?: readonly string[];
  /**
   * Open on first render. Defaults to shut. Set this where the audience is
   * known to want the figures without hunting for them.
   */
  defaultOpen?: boolean;
  /**
   * Share of tailings placed underground as paste backfill, 0-100.
   *
   * Required, along with its setter, rather than optional with a local
   * fallback. The slider used to hold this in the panel's own state, which
   * meant it moved the figures on screen and reached nothing else: not the
   * exported CSV, not the facilitator's read-out. Making the pair required is
   * what stops that happening again - a caller cannot draw the slider without
   * saying where the number goes.
   */
  backfillPct: number;
  onBackfillChange: (pct: number) => void;
}

export function LedgerPanel({
  mineSizeKm2,
  capacityTPerYr,
  waterMitigationSpendUsd,
  placedIndustrial,
  airControlCapitalUsd = 0,
  benefitIds,
  defaultOpen = false,
  backfillPct,
  onBackfillChange,
}: LedgerPanelProps) {
  const [showDetail, setShowDetail] = useState(defaultOpen);

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

  // Computed here only so the backfill slider can report the gallery it leaves
  // navigable. The canoe's own liability panel is elsewhere; this is the figure
  // the person moving the slider needs in front of them while they move it.
  const postClosure = computePostClosure({
    mineSizeKm2,
    capacityTPerYr,
    storageDepletedM3: water.balance.storageDepletedM3,
    backfillFraction: backfillPct / 100,
  });

  // The same scenario with nothing underground, kept only as the baseline the
  // subsidence figure is read against. A level on its own ("25% of the largest
  // void the model can produce") does not tell a team what their own decision
  // bought; the pair does.
  const unfilledSubsidenceIndex = computePostClosure({
    mineSizeKm2,
    capacityTPerYr,
    storageDepletedM3: water.balance.storageDepletedM3,
    backfillFraction: 0,
  }).subsidenceIndex;

  const cistern = water.receptors[0];
  const wells = water.receptors[1];

  const airSources = toAirSources(placedIndustrial ?? []);
  const air = airSources.length
    ? computeAirLedger({
        sources: airSources,
        capacityTPerYr,
        airControlCapitalUsd,
        disturbedHa: waste.footprint.totalDisturbedHa,
        benefitIds,
        mineLifeYr: water.timing.mineLifeYr,
      })
    : null;

  // ---- the collapsed-state summary: one verdict per ledger, worst case ----
  const waterWorst =
    cistern.verdict === 'lost' || wells.verdict === 'lost'
      ? 'lost'
      : cistern.verdict === 'at_risk' || wells.verdict === 'at_risk'
        ? 'at_risk'
        : 'safe';
  const lostNames = [
    cistern.verdict === 'lost' ? 'Old Cistern' : null,
    wells.verdict === 'lost' ? 'wells' : null,
  ].filter((n): n is string => n !== null);
  const waterWord = lostNames.length
    ? `${lostNames.join(' and ')} lost`
    : VERDICT_WORD[waterWorst];
  const waterTone: Tone =
    waterWorst === 'lost' ? 'bad' : waterWorst === 'at_risk' ? 'warn' : 'good';

  const landOver = waste.footprint.exceedsLicenceArea;

  let airWorst: string | null = null;
  if (air) {
    airWorst = 'within_guideline';
    for (const r of air.receptors) {
      airWorst = worse(worse(airWorst, r.pm10Verdict), r.pm25Verdict);
    }
  }
  const airTone: Tone =
    airWorst === null
      ? 'unknown'
      : airWorst === 'exceeds_limit'
        ? 'bad'
        : airWorst === 'within_limit'
          ? 'warn'
          : 'good';

  return (
    <div className="mt-6 border-2 border-gray-900 rounded-lg overflow-hidden">
      <div className="bg-gray-900 text-white px-4 py-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-bold text-base">Impact ledgers</h3>
            <p className="text-xs text-gray-300 mt-0.5">
              Reported in physical units and never added together. There is no overall score here on
              purpose.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDetail(v => !v)}
            aria-expanded={showDetail}
            className="shrink-0 flex items-center gap-2 rounded px-1 py-0.5 text-xs font-semibold text-gray-200 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span>{showDetail ? 'Hide the figures' : 'Show the figures'}</span>
            <span
              aria-hidden="true"
              className={
                'relative inline-block h-4 w-8 rounded-full transition-colors ' +
                (showDetail ? 'bg-green-500' : 'bg-gray-600')
              }
            >
              <span
                className={
                  'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ' +
                  (showDetail ? 'left-4' : 'left-0.5')
                }
              />
            </span>
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <Chip label="Water" word={waterWord} tone={waterTone} />
          <Chip
            label="Land"
            word={landOver ? 'over licence area' : 'within licence area'}
            tone={landOver ? 'bad' : 'good'}
          />
          <Chip
            label="Air"
            word={airWorst === null ? 'facilities not sited' : AIR_WORD[airWorst]}
            tone={airTone}
          />
        </div>

        {!showDetail && (
          <p className="mt-2 text-[11px] text-gray-400">
            Three verdicts, no score. Turn the switch on for the quantities, the thresholds and what
            it would cost to avert each one.
          </p>
        )}
      </div>

      {!water.timing.plausibleMinePlan && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 text-sm text-amber-900">
          <strong>Not a fundable plan.</strong> This size and rate give a {fmt(water.timing.mineLifeYr)}
          -year mine life, where a reserve of {fmt(waste.tonnage.oreMinedT / 1e6, 0)} Mt would normally
          be mined over about {fmt(water.timing.taylorLifeYr)} years.
        </div>
      )}

      {showDetail && (
        <>
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

              <p className="mt-2 text-xs text-gray-600">
                Production rate cuts both ways here. Mining slowly keeps the pumps running for
                longer, and a cone of depression widens with time. Mining quickly means
                pre-draining ahead of a face that is advancing faster, so the pumps run harder.
                Neither is a way out of the water problem — there is no rate at which it goes
                away.
              </p>

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
                  onChange={e => onBackfillChange(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  <span className="font-semibold">What it does:</span> the share you set is taken out
                  of the tailings that reach the surface, so the three figures below move with it —
                  less tailings stored, a smaller impoundment, less disturbed ground. Only about half
                  of the tailings will physically fit underground, so the impoundment shrinks but
                  never to nothing.
                </p>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  <span className="font-semibold">What it protects:</span> the ground under the Old
                  Town. The workings leave a void, and what you do not fill stays open beneath a
                  historic quarter and the twelfth-century cistern under it — neither of which can
                  be rebuilt, and neither of which any line in this budget reaches. Void left open
                  at this setting:{' '}
                  <span className="font-semibold">
                    {(postClosure.subsidenceIndex * 100).toFixed(0)}%
                  </span>{' '}
                  of the largest this model can produce, against{' '}
                  <span className="font-semibold">
                    {(unfilledSubsidenceIndex * 100).toFixed(0)}%
                  </span>{' '}
                  if you fill nothing. There is no threshold on this one — no figure below which it
                  is fine — so it carries no verdict, only the number.
                </p>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  <span className="font-semibold">What it costs:</span> the galleries. The same
                  paste that holds the ground up fills the route, and a filled gallery cannot be
                  paddled. A canoe route needs {CANOE_MIN_NAVIGABLE_LENGTH_M} m left open, and at
                  this setting{' '}
                  <span
                    className={
                      postClosure.navigableLengthM < CANOE_MIN_NAVIGABLE_LENGTH_M
                        ? 'font-bold text-red-700'
                        : 'font-semibold'
                    }
                  >
                    {fmt(postClosure.navigableLengthM)} m
                  </span>{' '}
                  is navigable. One decision, pulling three ways at once.
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

          {/* ------------------------------- AIR ------------------------------- */}
          <div className="border-t-2 border-gray-900 p-4">
            <h4 className="font-bold text-sm uppercase tracking-wide text-gray-700 mb-2">
              Air — micrograms per cubic metre, where people are
            </h4>

            {!air ? (
              <p className="text-sm text-gray-600">
                Place your facilities on the map to see this. Air depends on where the operation sits,
                not only on what is spent on it: ground-level concentration falls with roughly the
                square of distance, so a few hundred metres matters more than the mitigation slider.
              </p>
            ) : (
              <>
                {!air.permitting.compliant && (
                  <p className="mb-3 text-sm text-red-900 bg-red-50 border-2 border-red-400 rounded p-2">
                    <strong>Cannot be permitted as sited.</strong> {air.permitting.reason} EU limit
                    values are binding law, so no benefits package buys past this. Move the facilities,
                    spend on control, or reduce the supply chain.
                  </p>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  {air.receptors.map(r => (
                    <dl key={r.id} className="text-sm space-y-1">
                      <div className="font-semibold text-xs uppercase text-gray-600">
                        {r.label}
                        <span className="font-normal text-gray-500">
                          {' '}
                          — nearest operation {fmt(r.nearestSourceM)} m
                          {r.withinPlumeFloor && (
                            <span className="text-amber-700">
                              {' '}
                              (closer than the model can represent; computed at{' '}
                              {fmt(r.modelledRangeM)} m)
                            </span>
                          )}
                        </span>
                      </div>
                      <Row label="Coarse particulate (PM10)">
                        <span className={AIR_STYLE[r.pm10Verdict]}>
                          {r.pm10AnnualUgM3.toFixed(1)}
                        </span>{' '}
                        <span className="text-gray-500 text-xs">(limit 40, guideline 15)</span>
                      </Row>
                      <Row label="Fine particulate (PM2.5)">
                        <span className={AIR_STYLE[r.pm25Verdict]}>
                          {r.pm25AnnualUgM3.toFixed(1)}
                        </span>{' '}
                        <span className="text-gray-500 text-xs">(limit 25, guideline 5)</span>
                      </Row>
                      <Row label="Status">
                        <span className={AIR_STYLE[worse(r.pm10Verdict, r.pm25Verdict)]}>
                          {AIR_WORD[worse(r.pm10Verdict, r.pm25Verdict)]}
                        </span>
                      </Row>
                      {r.pm25Verdict !== 'within_guideline' && (
                        <Row label="To reach the health guideline">
                          {r.capitalToMeetGuidelineUsd === null
                            ? 'Not reachable within the control budget from here — only by moving.'
                            : `${usd(r.capitalToMeetGuidelineUsd)} of control equipment`}
                        </Row>
                      )}
                      {r.limitNeedsRelocation && (
                        <Row label="To reach the legal limit">
                          <span className="text-red-700 font-semibold">
                            Not possible from here at any affordable spend. The facilities have to move.
                          </span>
                        </Row>
                      )}
                    </dl>
                  ))}
                </div>

                <p className="mt-3 text-xs text-gray-600">
                  Two thresholds, not one. The EU limit value is binding law. The World Health
                  Organization guideline is about five times stricter and has no legal force, so a mine
                  can sit lawfully between them for its whole life. Lawful and healthy are different
                  questions and the ledger refuses to merge them.
                </p>

                <dl className="text-sm space-y-1 mt-3 pt-3 border-t border-gray-200">
                  <Row label="Control equipment (from your budget)">
                    {usd(air.obligation.capitalUsd)}
                  </Row>
                  <Row label="Running it, per year">
                    {usd(air.obligation.annualOmUsd)}{' '}
                    <span className="text-gray-500 text-xs">(not charged to the budget)</span>
                  </Row>
                  <Row label="Over the life of the mine">
                    {usd(air.obligation.lifetimeUsd)}{' '}
                    <span className="text-gray-500 text-xs">
                      ({fmt(air.obligation.mineLifeYr, 0)} years, present value{' '}
                      {usd(air.obligation.presentValueUsd)})
                    </span>
                  </Row>
                  <Row label="Haul fleet">
                    {benefitIds === undefined
                      ? 'Depends on benefits chosen later'
                      : air.inputs.electrified
                        ? 'Electrified — diesel particulate removed'
                        : 'Diesel'}
                  </Row>
                </dl>
                <p className="mt-2 text-xs text-gray-600">
                  The budget buys the equipment; running it recurs every year, and the dust returns the
                  year that stops. Only the first figure is charged against your budget today — the
                  annual cost is shown so the commitment is visible, not hidden. Workforce training and the energy storage research programme,
                  together and only together, electrify the haul fleet — which removes diesel exhaust and
                  does nothing for the dust raised by the wheels.
                </p>
              </>
            )}
          </div>

          <div className="bg-gray-50 border-t border-gray-300 px-4 py-2 text-xs text-gray-600">
            Waste follows the tonnage mined, not the licence area, and the footprint is derived from the
            tonnage. Air is reported above, in micrograms per cubic metre at the places people actually are, and it responds to where the facilities sit rather than only to what is spent.
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ label, word, tone }: { label: string; word: string; tone: Tone }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-[11px]">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${CHIP_DOT[tone]}`} />
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold text-white">{word}</span>
    </span>
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
