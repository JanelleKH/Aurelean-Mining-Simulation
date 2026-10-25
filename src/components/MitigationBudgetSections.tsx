import React from 'react';
import {
  Droplets,
  Trash2,
  Wind,
  DollarSign,
  Download,
  Settings,
  Users,
  CheckCircle,
  Lock,
  Unlock,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { computeWaterLedger, computePostClosure } from '../model/index';
import { COMMUNITY_BENEFITS } from '../data/communityBenefits';
import { LedgerPanel } from './LedgerPanel';
import {
  MINE_SIZES,
  CAPACITIES,
  AIR_TIERS,
  MITIGATION_STEP_USD,
  formatNumber,
  formatCurrency,
  type AirTierId,
} from '../data/mitigationConstants';
import {
  WORKFLOW_PHASE_LABELS,
  type useMitigationBudgetV2,
} from '../hooks/useMitigationBudgetV2';

export type MitigationBudgetApi = ReturnType<typeof useMitigationBudgetV2>;

const dropdownClass = (locked: boolean) =>
  clsx(
    'p-2 border rounded text-sm',
    locked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-gray-50'
  );

export const ScenarioHeader: React.FC<{ b: MitigationBudgetApi }> = ({ b }) => (
  <div className="border-b pb-2 flex items-center justify-between gap-2">
    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
      <Settings className="text-gray-600" size={20} /> Configuration
    </h2>
    <span
      className={clsx(
        'text-[10px] font-bold px-2 py-0.5 rounded-full',
        b.phase === 'scenario'
          ? 'bg-blue-100 text-blue-800'
          : b.phase === 'benefits'
            ? 'bg-green-100 text-green-900'
            : 'bg-amber-100 text-amber-900'
      )}
    >
      {WORKFLOW_PHASE_LABELS[b.phase]}
    </span>
  </div>
);

export const ScenarioDropdowns: React.FC<{ b: MitigationBudgetApi }> = ({ b }) => (
  <div className="grid grid-cols-3 gap-4">
    <div className="flex flex-col gap-1">
      <label className="font-bold text-xs text-gray-700">Mine Size</label>
      <select
        value={b.selectedSize.value}
        disabled={b.scenarioLocked}
        onChange={e => b.handleSizeChange(Number(e.target.value))}
        className={dropdownClass(b.scenarioLocked)}
      >
        {MINE_SIZES.map(s => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
    <div className="flex flex-col gap-1">
      <label className="font-bold text-xs text-gray-700">Capacity</label>
      <select
        value={b.selectedCapacity.value}
        disabled={b.scenarioLocked}
        onChange={e => b.handleCapacityChange(Number(e.target.value))}
        className={dropdownClass(b.scenarioLocked)}
      >
        {CAPACITIES.map(c => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
    <div className="flex flex-col gap-1">
      <label className="font-bold text-xs text-gray-700">Facility</label>
      <select
        value={b.selectedFacilityId}
        disabled={b.scenarioLocked}
        onChange={e => b.handleFacilityChange(e.target.value as AirTierId)}
        className={dropdownClass(b.scenarioLocked)}
      >
        {AIR_TIERS.map(t => (
          <option key={t.id} value={t.id}>
            {t.label} (+{Math.round(t.budgetAdd / 1_000_000)}M)
          </option>
        ))}
      </select>
    </div>
  </div>
);

export const ScenarioLockControls: React.FC<{ b: MitigationBudgetApi }> = ({ b }) => (
  <>
    {b.phase === 'scenario' ? (
      <p className="text-[10px] text-gray-600 leading-snug">
        Adjust mine (raises waste floor), capacity (raises water floor), and facility (adds budget). Lock
        when ready to site facilities on the map.
      </p>
    ) : b.phase === 'siting' ? (
      <p className="text-[10px] text-gray-600 leading-snug">
        Place all required industrial facilities on the map, then continue to mitigation.
        {b.sitingSummary ? (
          <>
            {' '}
            Required: <span className="font-semibold text-gray-800">{b.sitingSummary}</span>
          </>
        ) : null}
      </p>
    ) : b.phase === 'mitigation' ? (
      <p className="text-[10px] text-gray-600 leading-snug">
        Raise water, waste, or air quality above locked minimums from unassigned budget, then continue to
        community benefits.
      </p>
    ) : (
      <p className="text-[10px] text-gray-600 leading-snug">
        Select community benefits from remaining unassigned budget, then export or submit.
      </p>
    )}

    <div className="flex flex-wrap gap-2">
      {!b.scenarioLocked ? (
        <button
          type="button"
          onClick={b.lockScenario}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-bold hover:bg-black"
        >
          <Lock size={16} /> Lock scenario
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={b.unlockScenario}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-bold text-gray-800 hover:bg-gray-50"
          >
            <Unlock size={16} /> Unlock scenario
          </button>
          {b.phase === 'siting' && (
            <>
              <button
                type="button"
                onClick={b.unlockScenario}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-bold text-gray-800 hover:bg-gray-50"
                title="Back to Step 1 (unlock and clear placements/benefits)"
              >
                Back to scenario
              </button>
              <button
                type="button"
                onClick={b.continueFromSiting}
                disabled={!b.canContinueFromSiting}
                title={
                  b.canContinueFromSiting
                    ? 'Continue to mitigation'
                    : b.sitingValidation.messages.join(' ') || 'Place all required facilities first'
                }
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold',
                  b.canContinueFromSiting
                    ? 'bg-gray-900 text-white hover:bg-black'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                )}
              >
                Continue to mitigation <ChevronRight size={16} />
              </button>
            </>
          )}
          {b.phase === 'mitigation' && (
            <>
              <button
                type="button"
                onClick={b.backFromMitigation}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-bold text-gray-800 hover:bg-gray-50"
              >
                Back to siting
              </button>
              <button
                type="button"
                onClick={b.continueFromMitigation}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-bold hover:bg-black"
              >
                Continue to benefits <ChevronRight size={16} />
              </button>
            </>
          )}
          {b.phase === 'benefits' && (
            <button
              type="button"
              onClick={b.backFromBenefits}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-bold text-gray-800 hover:bg-gray-50"
            >
              Back to mitigation
            </button>
          )}
        </>
      )}
    </div>
    {b.phase === 'siting' && !b.canContinueFromSiting && b.sitingValidation.messages.length > 0 && (
      <p className="text-[10px] text-amber-800 font-medium leading-snug">
        {b.sitingValidation.messages.join(' · ')}
      </p>
    )}
  </>
);

export const BudgetSummaryCard: React.FC<{ b: MitigationBudgetApi }> = ({ b }) => (
  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col items-center justify-center text-center shrink-0">
    <div className="text-xs font-bold text-blue-800 uppercase tracking-wide">Potential Investment</div>
    <div className="text-2xl font-extrabold text-blue-900 flex items-center gap-1">
      <DollarSign size={20} />
      {formatNumber(b.totalBudget)}
    </div>
    <div className="text-[10px] text-blue-800/80 leading-relaxed">
      Required floors (mine + capacity steps){' '}
      {formatCurrency(b.baseScenarioBudget + b.BASELINE_WATER_WASTE_MITIGATION_USD)}
      {' · '}
      Discretionary pool {formatCurrency(b.discretionaryPoolUsd)}
      {b.allocAir > 0 && <span> · Air quality {formatCurrency(b.allocAir)}</span>}
    </div>
    {b.scenarioLocked && (
      <div className="text-[10px] text-gray-700 mt-1">
        Locked floors: water {formatCurrency(b.lockedWaterFloor)}, waste{' '}
        {formatCurrency(b.lockedWasteFloor)}, air {formatCurrency(b.lockedAirFloor)} (
        {b.selectedFacility.label})
      </div>
    )}
    <div
      className={clsx(
        'text-2xl font-extrabold mt-1.5',
        b.budgetOverrun
          ? 'text-red-800'
          : b.unassignedBudget > 0
            ? 'text-green-700'
            : 'text-gray-500'
      )}
    >
      {b.scenarioLocked ? 'Unassigned' : 'Available after lock'}: {formatCurrency(b.unassignedBudget)}
    </div>
    {b.scenarioLocked && b.sitingPenaltyUsd > 0 && (
      <>
        <div className="text-[11px] text-amber-800 font-semibold mt-1.5">
          Facility spread cost: −{formatCurrency(b.sitingPenaltyUsd)} ({b.spreadPenaltyPct.toFixed(1)}%)
        </div>
        <p className="text-[10px] text-gray-500 mt-1 leading-snug max-w-md">
          Spreading facilities farther apart increases logistics cost and reduces unassigned budget.
        </p>
      </>
    )}
    {b.budgetOverrun && b.scenarioLocked && (
      <p className="text-[11px] text-red-700 font-semibold mt-2 leading-snug max-w-md">
        Total allocation exceeds this mitigation budget (including facility spread cost). Reduce water,
        waste, or air spend, unselect community benefits, or cluster facilities closer on the map.
      </p>
    )}
  </div>
);

export const MitigationSlidersSection: React.FC<{ b: MitigationBudgetApi }> = ({ b }) => {
  const active = b.phase === 'mitigation';
  return (
    <div
      className={clsx(
        'flex flex-col gap-6 border-t pt-4',
        !active && 'opacity-50 pointer-events-none'
      )}
    >
      {!active && (
        <p className="text-[10px] text-gray-500 font-medium -mb-2">
          {b.phase === 'scenario' || b.phase === 'siting'
            ? 'Mitigation sliders unlock after facilities are sited.'
            : 'Mitigation step complete — unlock scenario to change allocations.'}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs font-bold">
          <span className="text-blue-600 flex items-center gap-1">
            <Droplets size={12} /> Water Mitigation
          </span>
          <span className="font-mono">{formatCurrency(b.allocWater)}</span>
        </div>
        <input
          type="range"
          min={b.MITIGATION_SPEND_MIN_USD}
          max={b.WATER_SPEND_MAX_USD}
          step={MITIGATION_STEP_USD}
          value={b.allocWater}
          disabled={!active}
          onChange={e => b.applyWaterTarget(Number(e.target.value))}
          className={clsx(
            'w-full h-2 bg-gray-200 rounded-lg appearance-none accent-blue-600',
            active ? 'cursor-pointer' : 'cursor-not-allowed'
          )}
        />
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>
            {active
              ? `Min locked ${formatCurrency(b.lockedWaterFloor)} — drag up only`
              : 'Available in Step 3'}
          </span>
          <span className="font-bold text-blue-600">
            Result: {formatNumber(b.targetWaterM3)} m³ ({b.waterReduction.toFixed(0)}% ↓)
          </span>
        </div>
        {b.waterClamped && (
          <div className="text-[10px] font-bold text-red-600">
            Not enough unassigned budget for that level.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs font-bold">
          <span className="text-orange-600 flex items-center gap-1">
            <Trash2 size={12} /> Waste Mgmt
          </span>
          <span className="font-mono">{formatCurrency(b.allocWaste)}</span>
        </div>
        <input
          type="range"
          min={b.MITIGATION_SPEND_MIN_USD}
          max={b.WASTE_SPEND_MAX_USD}
          step={MITIGATION_STEP_USD}
          value={b.allocWaste}
          disabled={!active}
          onChange={e => b.applyWasteTarget(Number(e.target.value))}
          className={clsx(
            'w-full h-2 bg-gray-200 rounded-lg appearance-none accent-orange-600',
            active ? 'cursor-pointer' : 'cursor-not-allowed'
          )}
        />
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>
            {active
              ? `Min locked ${formatCurrency(b.lockedWasteFloor)} — drag up only`
              : 'Available in Step 3'}
          </span>
          <span className="font-bold text-orange-600">
            Result: {formatNumber(b.targetWasteTon)} tons ({b.wasteReduction.toFixed(0)}% ↓)
          </span>
        </div>
        {b.wasteClamped && (
          <div className="text-[10px] font-bold text-red-600">
            Not enough unassigned budget for that level.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs font-bold">
          <span className="text-gray-700 flex items-center gap-1">
            <Wind size={12} /> Air Quality
          </span>
          <span className="font-mono">{formatCurrency(b.allocAir)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={b.AIR_SPEND_MAX_USD}
          step={MITIGATION_STEP_USD}
          value={b.allocAir}
          disabled={!active}
          onChange={e => b.applyAirTarget(Number(e.target.value))}
          className={clsx(
            'w-full h-2 bg-gray-200 rounded-lg appearance-none accent-gray-700',
            active ? 'cursor-pointer' : 'cursor-not-allowed'
          )}
        />
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>
            {active
              ? `Min locked ${formatCurrency(b.lockedAirFloor)} — drag up only · ${b.selectedFacility.label}`
              : 'Available in Step 3'}
          </span>
          {/*
            The AQI band that used to sit here came from a per-tier constant with
            no source, no receptor and no distance behind it, and it contradicted
            the air ledger below once that was wired in. Two air numbers on one
            screen means students believe the wrong one, so this now points at the
            ledger rather than competing with it.
          */}
          <span className="font-bold text-gray-700">
            Air at the Old Town: see the ledger below
          </span>
        </div>
        {b.airAssurance > 0 && (
          <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 mt-1 leading-snug">
            Plus {formatCurrency(b.airAssurance)} operating assurance, charged to this budget.
            Control equipment has to be run — water, power, reagent, labour, about 15% of its
            capital a year — and the regulator requires three years of that secured before you
            operate. So air costs {formatCurrency(b.airAssurance + b.allocAir)} in all, and the
            assurance is the part that comes out of community benefits.
          </div>
        )}
        {b.airClamped && (
          <div className="text-[10px] font-bold text-red-600">
            Not enough unassigned budget for that level.
          </div>
        )}
      </div>

      <LedgerPanel
        mineSizeKm2={b.selectedSize.value}
        capacityTPerYr={b.selectedCapacity.value}
        waterMitigationSpendUsd={b.allocWater}
        placedIndustrial={b.placedIndustrial}
        airControlCapitalUsd={b.allocAir}
      />
    </div>
  );
};

export const CommunityBenefitsSection: React.FC<{
  b: MitigationBudgetApi;
  selectedBenefits: string[];
}> = ({ b, selectedBenefits }) => {
  const active = b.phase === 'benefits';
  return (
    <div
      className={clsx(
        'flex flex-col gap-1 border-t pt-4',
        !active && 'opacity-50 pointer-events-none'
      )}
    >
      <div className="flex justify-between text-xs font-bold">
        <span className="text-green-600 flex items-center gap-1">
          <Users size={12} /> Community Benefits
          {!active && (
            <span className="font-normal text-gray-500">(available in Step 4)</span>
          )}
        </span>
        <span>{formatCurrency(b.communitySpend)}</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-lg overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all"
          style={{
            width: `${Math.min(100, b.totalBudget > 0 ? (b.communitySpend / b.totalBudget) * 100 : 0)}%`,
          }}
        />
      </div>
      <div className="grid grid-cols-1 gap-1 mt-2">
        {COMMUNITY_BENEFITS.map(benefit => {
          const isSelected = selectedBenefits.includes(benefit.id);
          const canAfford = active && b.unassignedBudget >= benefit.cost;
          return (
            <div
              key={benefit.id}
              onClick={() => b.handleToggleBenefit(benefit.id)}
              className={clsx(
                'flex justify-between items-center p-1.5 rounded text-[10px] border transition-colors select-none',
                !active && 'opacity-50 cursor-not-allowed',
                active &&
                  (isSelected
                    ? 'bg-green-100 border-green-300 text-green-900 cursor-pointer'
                    : canAfford
                      ? 'bg-white border-gray-200 hover:bg-gray-50 cursor-pointer'
                      : 'bg-gray-100 border-gray-200 text-gray-400 opacity-60 cursor-not-allowed')
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={clsx(
                    'w-3 h-3 rounded border flex items-center justify-center',
                    isSelected ? 'bg-green-600 border-green-600' : 'border-gray-400'
                  )}
                >
                  {isSelected && <CheckCircle size={8} className="text-white" />}
                </div>
                <span className="font-medium">{benefit.label}</span>
              </div>
              <span className="font-mono">{formatCurrency(benefit.cost)}</span>
            </div>
          );
        })}
      </div>
      {selectedBenefits.includes('canoe') && <CanoeLiability b={b} />}
    </div>
  );
};

/**
 * The canoe's headline price is $0.9M and its real cost is not.
 *
 * Every other benefit is bought once. This one is an obligation that begins
 * when the mine ends: the galleries must stay open, the water must be treated
 * after rebound, and access must be maintained for as long as anyone is
 * floated through it. None of that is charged to the budget — which is not a
 * modelling convenience but a faithful account of how post-closure liabilities
 * actually work, and why they so often end up with the public.
 *
 * Shown rather than charged, so the team can see what they have taken on.
 */
const CanoeLiability: React.FC<{ b: MitigationBudgetApi }> = ({ b }) => {
  const water = computeWaterLedger({
    mineSizeKm2: b.selectedSize.value,
    capacityTPerYr: b.selectedCapacity.value,
    waterMitigationSpendUsd: b.allocWater,
  });
  const pc = computePostClosure({
    mineSizeKm2: b.selectedSize.value,
    capacityTPerYr: b.selectedCapacity.value,
    // The deficit decides whether the aquifer can spare the water to hold the
    // galleries flooded. Without it the gate never fires.
    storageDepletedM3: water.balance.storageDepletedM3,
    backfillFraction: 0,
  });
  const ratio = pc.canoeCost.recurringPvUsd / Math.max(1, 900_000);
  return (
    <div className="mt-2 text-[10px] text-amber-900 bg-amber-50 border border-amber-300 rounded p-2 leading-snug">
      {pc.canoeVerdict === 'not_enough_water' ? (
        <>
          <span className="font-bold text-red-800">
            At this mine size the canoe cannot be delivered.
          </span>{' '}
          The galleries would flood within{' '}
          {pc.yearsToNavigableAfterClosure < 1
            ? 'months'
            : `${pc.yearsToNavigableAfterClosure.toFixed(0)} years`}{' '}
          of closure — they are the lowest point in the system, so the water returns there first.
          But holding them takes{' '}
          {(pc.water.reservationM3PerYr / 1000).toFixed(0)}k m³ a year of throughflow, and the
          aquifer has none to spare: it owes{' '}
          {(pc.water.recoveryCallM3PerYr / 1e6).toFixed(1)}M m³ a year against the{' '}
          {(pc.water.rechargeM3PerYr / 1e6).toFixed(1)}M m³ it receives, just to make good what this
          mine took. Reserve water for the canoe and it comes out of the recovery. A smaller mine
          leaves enough; this one does not. Created by the harm and destroyed by too much of it.
        </>
      ) : (
        <>
      <span className="font-bold">
        The canoe costs {formatCurrency(900_000)} to build and{' '}
        {formatCurrency(pc.canoeCost.annualRecurringUsd)} a year to keep.
      </span>{' '}
      Over fifty years that is {formatCurrency(pc.canoeCost.recurringPvUsd)} in present value —{' '}
      {ratio.toFixed(0)} times what you are paying for it, and none of it is charged to this
      budget. The galleries cannot open until the mine closes and the water table rebounds, about{' '}
      {pc.yearsToNavigableAfterClosure.toFixed(0)} years after that. Keeping them open also means
      not backfilling them, and it is the backfill that protects the Old Town and the cistern from
      subsidence. The galleries flood within{' '}
      {pc.yearsToNavigableAfterClosure < 1
        ? 'months'
        : `${pc.yearsToNavigableAfterClosure.toFixed(0)} years`}{' '}
      of closure, but the cistern sits far higher in the water table and needs{' '}
      {pc.water.regionalRecoveryYr.toFixed(0)} years of recharge to come back — so this community
      can have its canoe and still have lost its cistern. Whoever is here in{' '}
      {pc.mineLifeYr.toFixed(0)} years inherits all of it.
        </>
      )}
    </div>
  );
};

export const ExportResultsButton: React.FC<{
  b: MitigationBudgetApi;
  className?: string;
}> = ({ b, className }) => (
  <button
    type="button"
    onClick={() => b.handleDownloadCSV()}
    disabled={b.phase !== 'benefits'}
    className={clsx(
      'mt-auto bg-gray-800 text-white px-4 py-3 rounded-lg font-bold shadow flex items-center justify-center gap-2 text-sm',
      b.phase === 'benefits' ? 'hover:bg-black' : 'opacity-50 cursor-not-allowed',
      className
    )}
  >
    <Download size={16} /> Submit Results
  </button>
);
