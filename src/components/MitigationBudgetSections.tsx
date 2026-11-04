import React from 'react';
import {
  Droplets,
  Trash2,
  Wind,
  Info,
  DollarSign,
  Download,
  Settings,
  Users,
  CheckCircle,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import {
  computeWaterLedger,
  computePostClosure,
  CANOE_MIN_NAVIGABLE_LENGTH_M,
} from '../model/index';
import { benefitCostUsd, COMMUNITY_BENEFITS } from '../data/communityBenefits';
import { benefitsUnlockedForAreaKm2 } from '../data/communityVote';
import { LedgerPanel } from './LedgerPanel';
import {
  MINE_SIZES,
  CAPACITIES,
  AIR_TIERS,
  MITIGATION_SLIDER_STEP_USD,
  MITIGATION_STEP_USD,
  formatNumber,
  formatCurrency,
  type AirTierId,
} from '../data/mitigationConstants';
import {
  WORKFLOW_PHASE_LABELS,
  type useMitigationBudgetV2,
  type WorkflowPhase,
} from '../hooks/useMitigationBudgetV2';

export type MitigationBudgetApi = ReturnType<typeof useMitigationBudgetV2>;

const dropdownClass = (locked: boolean) =>
  clsx(
    'p-2 border rounded text-sm',
    locked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-gray-50'
  );

/**
 * The four steps, named, with the current one marked and the next action
 * spelled out. Added 31 October 2026 for beta item 16.
 *
 * The screen previously opened with a single line of prose listing the steps
 * with arrows between them, which told a team the order but not where they
 * were in it. A second tester asked for "a clearer list of steps and what is
 * coming" (item 42) and a third said the technical team's goal was "way too
 * complicated" (item 22). Same complaint from three directions: the sequence
 * was legible only to someone who already knew it.
 */
const STEPS: { phase: WorkflowPhase; n: number; title: string; todo: string }[] = [
  {
    phase: 'scenario',
    n: 1,
    title: 'Scenario',
    todo: 'Choose mine size, production rate and facility type, then lock. Locking sets the budget and the minimum you must spend on water and waste.',
  },
  {
    phase: 'siting',
    n: 2,
    title: 'Siting',
    todo: 'Place every required facility on the map. Where they sit decides air quality at the Old Town and whether you have trespassed on a community no-go zone.',
  },
  {
    phase: 'mitigation',
    n: 3,
    title: 'Mitigation',
    todo: 'Spend above the locked minimums on water, waste and air. You can come back here after looking at benefits.',
  },
  {
    phase: 'benefits',
    n: 4,
    title: 'Benefits',
    todo: 'Commit to community benefits from what is left, then export. Going back to Step 3 to free up money is a normal move, not a mistake.',
  },
];

export const StepGuide: React.FC<{ b: MitigationBudgetApi }> = ({ b }) => {
  const currentIdx = STEPS.findIndex(st => st.phase === b.phase);
  const current = STEPS[currentIdx] ?? STEPS[0];
  return (
    <div className="shrink-0 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {STEPS.map((st, i) => (
          <React.Fragment key={st.phase}>
            <span
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold',
                i === currentIdx
                  ? 'bg-gray-900 text-white'
                  : i < currentIdx
                    ? 'bg-green-100 text-green-900 border border-green-300'
                    : 'bg-white text-gray-400 border border-gray-300'
              )}
            >
              <span
                className={clsx(
                  'inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px]',
                  i === currentIdx
                    ? 'bg-white text-gray-900'
                    : i < currentIdx
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                )}
              >
                {i < currentIdx ? '\u2713' : st.n}
              </span>
              {st.title}
            </span>
            {i < STEPS.length - 1 && (
              <ChevronRight size={12} className="text-gray-400 shrink-0" />
            )}
          </React.Fragment>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-gray-700">
        <strong>
          Step {current.n} of {STEPS.length} — {current.title}.
        </strong>{' '}
        {current.todo}
      </p>
    </div>
  );
};

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

    {/*
      Only the scenario lock lives here. The back/continue buttons for the
      later steps moved into PhaseNavControls, which is rendered beside the
      thing it advances to — beta item 25: "the 'continue to benefits' button
      should be closer to the actual benefits on the screen". It was in the
      left column, under the map, while the benefits panel was in the right.

      Sizes went up too (item 5: "make the lock and back button bigger so it
      catches the eye"): these are the controls that move a team through the
      exercise and they were the same weight as the help text above them.
    */}
    <div className="flex flex-wrap gap-2">
      {!b.scenarioLocked ? (
        <button
          type="button"
          onClick={b.lockScenario}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-lg bg-gray-900 text-white text-base font-bold shadow-md hover:bg-black focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-400"
        >
          <Lock size={20} /> Lock scenario
        </button>
      ) : (
        <button
          type="button"
          onClick={b.unlockScenario}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-lg border-2 border-gray-400 bg-white text-base font-bold text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-300"
          title="Unlock Step 1 (clears placements and benefits)"
        >
          <Unlock size={20} /> Unlock scenario
        </button>
      )}
    </div>
    {b.phase === 'siting' && !b.canContinueFromSiting && b.sitingValidation.messages.length > 0 && (
      <p className="text-[10px] text-amber-800 font-medium leading-snug">
        {b.sitingValidation.messages.join(' · ')}
      </p>
    )}
  </>
);

/**
 * Back / continue for one step, rendered next to that step's own controls.
 *
 * `scope` picks which step's buttons to show, so siting's pair sits under the
 * map and mitigation's and benefits' sit under the panels on the right. Beta
 * items 25 and 32: the continue button was nowhere near the thing it
 * continued to, and nobody realised they could go back to mitigation after
 * looking at the benefits.
 */
export const PhaseNavControls: React.FC<{ b: MitigationBudgetApi; scope: WorkflowPhase }> = ({
  b,
  scope,
}) => {
  if (!b.scenarioLocked || b.phase !== scope) return null;

  const backClass =
    'flex-1 flex items-center justify-center gap-2 py-3.5 rounded-lg border-2 border-gray-400 bg-white text-base font-bold text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-300';
  const fwdClass =
    'flex-1 flex items-center justify-center gap-2 py-3.5 rounded-lg bg-gray-900 text-white text-base font-bold shadow-md hover:bg-black focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-400';

  return (
    <div className="shrink-0 flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        {scope === 'siting' && (
          <>
            <button
              type="button"
              onClick={b.unlockScenario}
              className={backClass}
              title="Back to Step 1 (unlock and clear placements/benefits)"
            >
              <ChevronLeft size={20} /> Back to scenario
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
                'flex-1 flex items-center justify-center gap-2 py-3.5 rounded-lg text-base font-bold',
                b.canContinueFromSiting
                  ? 'bg-gray-900 text-white shadow-md hover:bg-black focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-400'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              )}
            >
              Continue to mitigation <ChevronRight size={20} />
            </button>
          </>
        )}
        {scope === 'mitigation' && (
          <>
            <button type="button" onClick={b.backFromMitigation} className={backClass}>
              <ChevronLeft size={20} /> Back to siting
            </button>
            <button type="button" onClick={b.continueFromMitigation} className={fwdClass}>
              Continue to benefits <ChevronRight size={20} />
            </button>
          </>
        )}
        {scope === 'benefits' && (
          <button type="button" onClick={b.backFromBenefits} className={backClass}>
            <ChevronLeft size={20} /> Back to mitigation — free up budget
          </button>
        )}
      </div>
      {scope === 'benefits' && (
        <p className="text-[10px] text-gray-600 leading-snug">
          Going back to Step 3 is a normal move. If a benefit the community asked for is out of
          reach, lowering a mitigation allocation to afford it is a decision you are meant to be
          able to make and defend — not a mistake you have to start over to undo.
        </p>
      )}
    </div>
  );
};

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
    {/*
      Beta item 28: "add clarity on whether unassigned budget is profit (aka
      whether they should be aiming for that)". The honest answer, and the one
      the code actually implements: nothing scores it either way, but the
      feasibility read-out names any community benefit you could have afforded
      and did not fund. So it is money retained, and the retaining is visible.
    */}
    <p className="text-[10px] text-blue-900/80 mt-1 leading-snug max-w-md">
      Unassigned money is not spent, and nothing in the model rewards leaving it. It is yours to
      argue for as retained shareholder value — but the feasibility read-out names every benefit
      the community asked for that this budget could have covered, so the choice not to spend is on
      the record rather than hidden in a total.
    </p>
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

/**
 * The arithmetic behind the three mitigation levers, behind a switch.
 *
 * Beta items 9 and 31 both asked for this, from two different testers: "toggle
 * on the mathematics on the three factors of remediation" and "make
 * mathematics of different mitigation strategies a toggle / info button". The
 * sliders showed a dollar figure and a result with nothing between them, so
 * the curve was something a team had to infer from dragging. Shown with the
 * current numbers substituted, because an abstract formula answers a different
 * question from the one being asked at the slider.
 */
const MathPanel: React.FC<{ b: MitigationBudgetApi }> = ({ b }) => {
  const waterM = b.allocWater / 1_000_000;
  const wasteM = b.allocWaste / 1_000_000;
  const n = (v: number) => formatNumber(Math.round(v));
  return (
    <div className="rounded-lg border border-gray-300 bg-gray-50 p-3 text-[11px] leading-snug text-gray-700">
      <p className="mb-2">
        Water and waste both follow the same shape: diminishing returns on money, down to a floor
        that spending cannot pass. The first million buys far more than the fifth. Air does not use
        this curve at all — it is equipment bought in packages, and where the facilities sit
        matters more than what is spent on them.
      </p>

      <div className="mb-2">
        <div className="font-bold text-blue-700">Water</div>
        <code className="block font-mono text-[10px] text-gray-800">
          final = floor + (baseline − floor) × e^(−{b.K_W} × $M)
        </code>
        <div className="mt-0.5">
          baseline {n(b.waterBaselineM3)} m³ (set by production rate) · floor{' '}
          {n(b.waterFloorM3)} m³ ({(b.ALPHA_W * 100).toFixed(0)}% of baseline, unreachable) ·
          spending ${waterM.toFixed(2)}M
          <br />
          → {n(b.waterFloorM3)} + ({n(b.waterBaselineM3)} − {n(b.waterFloorM3)}) × e^(−
          {(b.K_W * waterM).toFixed(2)}) = <strong>{n(b.targetWaterM3)} m³</strong> (
          {b.waterReduction.toFixed(0)}% down)
        </div>
      </div>

      <div className="mb-2">
        <div className="font-bold text-orange-700">Waste</div>
        <code className="block font-mono text-[10px] text-gray-800">
          final = floor + (baseline − floor) × e^(−{b.K_S} × $M)
        </code>
        <div className="mt-0.5">
          baseline {n(b.wasteBaselineTon)} t (set by mine size) · floor {n(b.wasteFloorTon)} t (
          {(b.ALPHA_S * 100).toFixed(0)}% of baseline) · spending ${wasteM.toFixed(2)}M
          <br />
          → <strong>{n(b.targetWasteTon)} t</strong> ({b.wasteReduction.toFixed(0)}% down)
        </div>
      </div>

      <div>
        <div className="font-bold text-gray-800">Air</div>
        <div className="mt-0.5">
          No curve. Capital buys control equipment in packages; the regulator then requires three
          years of running costs secured up front, at {(0.15 * 100).toFixed(0)}% of capital a year,
          which is the assurance line above. What reaches the Old Town is computed from a Gaussian
          plume — emissions by source, dispersed over the distance from each facility to each
          receptor — and reported in the ledger below in µg/m³. Concentration falls with
          roughly the square of distance, so moving a facility does more than the slider.
        </div>
      </div>

      <p className="mt-2 text-gray-500">
        These two curves are a calibrated convention rather than a measurement: they say money has
        diminishing returns and cannot reach zero, which is true of real remediation, but the
        particular numbers are chosen to make the trade-off playable. The water, waste and air
        ledgers below are the physical model, and those are built from published parameters.
      </p>
    </div>
  );
};


/**
 * Slider geometry for the mitigation levers.
 *
 * Two problems, found on run morning 4 November 2026 and fixed together,
 * because fixing either alone makes the other worse.
 *
 * The track used to run to a flat cap - $10.3M for water - at every scenario.
 * At 0.5 km2 / 0.5 Mt the whole budget is $600,000, so about 97% of the
 * travel was unreachable and the handle would not visibly move. Teams read
 * that as a broken control. So the top of the range is now whatever the
 * scenario can actually pay for, and the step gets finer when the range is
 * small, or a $600k track would have two usable stops.
 *
 * The track also used to START at the locked floor, which put the handle hard
 * left whether or not the floor had been met - nothing to show for locking.
 * Starting it at zero fixes that, but on a plain track it creates a worse
 * misreading: at 4 km2 the water floor is $4.3M of a $10.3M cap, so a
 * mandatory minimum would be drawn 42% of the way up and read as a choice the
 * team had made. Hence the band: everything below the floor is shaded as the
 * regulatory minimum and everything above it is the team's own money. Air has
 * no floor, so its band has zero width and its zero is a true zero - which is
 * what keeps the three levers honestly comparable.
 */
const sliderMaxUsd = (capUsd: number, totalBudgetUsd: number) =>
  Math.max(capUsd > totalBudgetUsd ? totalBudgetUsd : capUsd, 1);

const sliderStepUsd = (maxUsd: number) =>
  maxUsd <= 2_000_000 ? 50_000 : MITIGATION_SLIDER_STEP_USD;

/**
 * The mandatory stretch of a lever, drawn as its own strip under the track.
 *
 * First attempt painted it as the input's background. It was invisible:
 * Chrome's accent-color fills the whole track to the left of the thumb, which
 * is exactly the stretch the band occupies, so the band was buried under the
 * fill at every setting that mattered. A separate strip is less elegant and
 * survives the browser painting whatever it likes over the control.
 */
const FloorBar: React.FC<{ floorUsd: number; maxUsd: number; tone: string }> = ({
  floorUsd,
  maxUsd,
  tone,
}) => {
  const pct = Math.max(0, Math.min(100, (floorUsd / maxUsd) * 100));
  if (pct <= 0) return null;
  return (
    <div
      aria-hidden="true"
      className="flex h-1 w-full overflow-hidden rounded-sm -mt-0.5"
      title="Shaded: the regulatory minimum. Clear: your own money."
    >
      <div className="bg-slate-500" style={{ width: `${pct}%` }} />
      <div className={clsx('flex-1', tone)} />
    </div>
  );
};

/** The caption under a lever, naming the band rather than leaving it to be guessed. */
const FloorNote: React.FC<{
  floorUsd: number;
  allocUsd: number;
  label: string;
  /** Unassigned budget. Zero means there is nothing to drag up with. */
  headroomUsd: number;
}> = ({ floorUsd, allocUsd, label, headroomUsd }) =>
  floorUsd <= 0 ? (
    <span>No regulatory minimum on {label} — this one starts at a true zero.</span>
  ) : (
    <span>
      <span className="font-semibold text-gray-700">
        Regulatory minimum {formatCurrency(floorUsd)} met
      </span>{' '}
      — the shaded bar under the track.{' '}
      {allocUsd > floorUsd ? (
        `${formatCurrency(allocUsd - floorUsd)} of your own money above it.`
      ) : headroomUsd > 0 ? (
        'Drag above it to spend your own.'
      ) : (
        // Telling a team to drag up when the budget is already fully committed
        // is advice the model cannot receive - the same fault as the footprint
        // blocker recommending backfill it could not read.
        <span className="text-amber-800">
          Nothing unassigned to go above it: this scenario&rsquo;s budget is spent on the minimums.
        </span>
      )}
    </span>
  );

export const MitigationSlidersSection: React.FC<{ b: MitigationBudgetApi }> = ({ b }) => {
  // Ceilings for this scenario. At every size above the smallest the budget
  // already exceeds the cap, so these are the caps and nothing changes.
  const waterMax = sliderMaxUsd(b.WATER_SPEND_MAX_USD, b.totalBudget);
  const wasteMax = sliderMaxUsd(b.WASTE_SPEND_MAX_USD, b.totalBudget);
  const active = b.phase === 'mitigation';
  const [showMath, setShowMath] = React.useState(false);
  return (
    <div
      className={clsx(
        'flex flex-col gap-6 border-t pt-4',
        !active && 'opacity-50 pointer-events-none'
      )}
    >
      <div className="flex items-center justify-between gap-2 -mb-2 pointer-events-auto">
        <span className="text-xs font-bold text-gray-700">Mitigation allocations</span>
        <button
          type="button"
          onClick={() => setShowMath(v => !v)}
          aria-expanded={showMath}
          className="flex items-center gap-1.5 rounded border border-gray-400 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
        >
          <Info size={13} /> {showMath ? 'Hide the mathematics' : 'Show the mathematics'}
        </button>
      </div>
      {showMath && (
        <div className="pointer-events-auto">
          <MathPanel b={b} />
        </div>
      )}
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
          min={0}
          max={waterMax}
          step={sliderStepUsd(waterMax)}
          value={b.allocWater}
          disabled={!active}
          // applyWaterTarget raises anything below the floor back to it, so a
          // minimum of zero is safe: the thumb cannot be parked below the
          // regulatory minimum, it just snaps back onto the band's edge.
          onChange={e => b.applyWaterTarget(Number(e.target.value))}
          className={clsx(
            'w-full h-2 bg-gray-200 rounded-lg appearance-none accent-blue-600',
            active ? 'cursor-pointer' : 'cursor-not-allowed'
          )}
        />
        <FloorBar floorUsd={b.lockedWaterFloor} maxUsd={waterMax} tone="bg-blue-200" />
        <div className="text-[10px] text-gray-500 leading-snug">
          {active ? (
            <FloorNote
              floorUsd={b.lockedWaterFloor}
              allocUsd={b.allocWater}
              label="water"
              headroomUsd={b.unassignedBudget}
            />
          ) : (
            'Available in Step 3'
          )}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>
            {active
              ? `Ceiling ${formatCurrency(waterMax)} at this scenario — drag up only`
              : ''}
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
          min={0}
          max={wasteMax}
          step={sliderStepUsd(wasteMax)}
          value={b.allocWaste}
          disabled={!active}
          onChange={e => b.applyWasteTarget(Number(e.target.value))}
          className={clsx(
            'w-full h-2 bg-gray-200 rounded-lg appearance-none accent-orange-600',
            active ? 'cursor-pointer' : 'cursor-not-allowed'
          )}
        />
        <FloorBar floorUsd={b.lockedWasteFloor} maxUsd={wasteMax} tone="bg-orange-200" />
        <div className="text-[10px] text-gray-500 leading-snug">
          {active ? (
            <FloorNote
              floorUsd={b.lockedWasteFloor}
              allocUsd={b.allocWaste}
              label="waste"
              headroomUsd={b.unassignedBudget}
            />
          ) : (
            'Available in Step 3'
          )}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>
            {active
              ? `Ceiling ${formatCurrency(wasteMax)} at this scenario — drag up only`
              : ''}
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
        <FloorBar floorUsd={b.lockedAirFloor} maxUsd={b.AIR_SPEND_MAX_USD} tone="bg-gray-200" />
        <div className="text-[10px] text-gray-500 leading-snug">
          {active ? (
            <FloorNote
              floorUsd={b.lockedAirFloor}
              allocUsd={b.allocAir}
              label="air"
              headroomUsd={b.unassignedBudget}
            />
          ) : (
            'Available in Step 3'
          )}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>{active ? b.selectedFacility.label : ''}</span>
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
        <div className="text-[10px] text-gray-500 leading-snug">
          This slider moves in $2M steps while water and waste move in $250k steps, because control
          equipment is bought as packages rather than by the dollar — a baghouse and a scrubber
          train are each a yes or a no.
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

    </div>
  );
};

/**
 * The ledgers, outside the disabled-slider wrapper on purpose.
 *
 * They used to be the last child of MitigationSlidersSection, which carries
 * pointer-events-none outside Step 3. That was harmless while the panel was
 * always open and purely a read-out. It stopped being harmless the moment the
 * figures went behind a switch on 31 October 2026: a team at Step 4 could see
 * three verdicts and had no way to open the numbers behind them, which is
 * exactly when they would want to — benefits decide whether the haul fleet is
 * electrified, and that moves the air ledger.
 */
export const LedgerSection: React.FC<{ b: MitigationBudgetApi; benefitIds?: string[] }> = ({
  b,
  benefitIds,
}) => (
  <LedgerPanel
    mineSizeKm2={b.selectedSize.value}
    capacityTPerYr={b.selectedCapacity.value}
    waterMitigationSpendUsd={b.allocWater}
    placedIndustrial={b.placedIndustrial}
    airControlCapitalUsd={b.allocAir}
    benefitIds={b.phase === 'benefits' ? benefitIds : undefined}
    backfillPct={b.backfillPct}
    onBackfillChange={b.setBackfillPct}
  />
);

export const CommunityBenefitsSection: React.FC<{
  b: MitigationBudgetApi;
  selectedBenefits: string[];
  /**
   * Joint workspace only. Shows what the community's own vote would have
   * allowed at this mine size, without enforcing it — see
   * benefitsUnlockedForAreaKm2 for why it is shown rather than capped.
   */
  showCommunityExpectation?: boolean;
}> = ({ b, selectedBenefits, showCommunityExpectation = false }) => {
  const active = b.phase === 'benefits';
  const unlocked = benefitsUnlockedForAreaKm2(b.selectedSize.value);
  const chosen = selectedBenefits.length;
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

      {showCommunityExpectation && unlocked !== null && (
        <div
          className={clsx(
            'mt-2 rounded border px-2 py-1.5 text-[10px] leading-snug',
            chosen > unlocked
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-gray-200 bg-gray-50 text-gray-700'
          )}
        >
          <span className="font-semibold">
            A {b.selectedSize.label} mine unlocks {unlocked} benefit
            {unlocked === 1 ? '' : 's'} on the community side. Selected here: {chosen}.
          </span>{' '}
          {chosen > unlocked
            ? 'More than the size unlocks. Nothing here stops you — in this room the budget is the constraint — but it is a concession beyond what the community could have asked for on its own.'
            : chosen < unlocked
              ? 'Fewer than the size unlocks, so there is room the community could still ask for.'
              : 'That matches what the size unlocks.'}
        </div>
      )}

      {/*
        Beta item 35: "explicitly say how community benefits affect water level
        etc." The honest answer is that most of them do not, and saying so is
        more use than implying a link that is not in the model. Two benefits
        touch the physical ledgers and they are named; the rest are real
        commitments with real costs that change nothing in the water, waste or
        air arithmetic.
      */}
      <p className="mt-1.5 text-[10px] leading-snug text-gray-600">
        <strong>What these do to the ledgers.</strong> Two of them reach the physical model.{' '}
        <span className="font-semibold">Workforce training and the energy storage programme,
        together and only together</span>, electrify the haul fleet: that removes about 90% of the
        diesel exhaust and almost none of the dust, because the dust is raised by the wheels and
        the wheels keep turning. The <span className="font-semibold">underground canoe</span> runs
        the other way — it changes nothing, but it can only be delivered if the workings leave a
        navigable gallery and enough water is held back after closure, so the water and waste
        decisions above determine whether it can be promised at all. The park, the irrigation
        upgrade and the rest are commitments the community values and the budget pays for; they do
        not move the water, waste or air figures.
      </p>

      <div className="grid grid-cols-1 gap-1 mt-2">
        {COMMUNITY_BENEFITS.map(benefit => {
          const isSelected = selectedBenefits.includes(benefit.id);
          const priceUsd = benefitCostUsd(benefit.id, {
            mineSizeKm2: b.selectedSize.value,
            capacityTPerYr: b.selectedCapacity.value,
          });
          const canAfford = active && b.unassignedBudget >= priceUsd;
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
              <span className="font-mono">{formatCurrency(priceUsd)}</span>
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
    // The team's own backfill setting, not zero. Held at zero this panel told a
    // team that had filled the galleries what their canoe would cost to run,
    // which is a price for a thing that no longer exists.
    backfillFraction: b.backfillPct / 100,
  });
  // Read the price the budget actually charges rather than repeating a literal.
  // Hard-coding it meant the panel would keep quoting a figure the benefits list
  // no longer held — the same "two numbers that cannot both be true" fault as
  // the air cost units, in a third place.
  const canoePriceUsd = benefitCostUsd('canoe', {
    mineSizeKm2: b.selectedSize.value,
    capacityTPerYr: b.selectedCapacity.value,
  });
  const ratio = pc.canoeCost.recurringPvUsd / Math.max(1, canoePriceUsd);
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
      ) : pc.canoeVerdict === 'backfilled_away' || pc.canoeVerdict === 'too_short' ? (
        <>
          <span className="font-bold text-red-800">
            You have paid {formatCurrency(canoePriceUsd)} for a canoe route you are filling in.
          </span>{' '}
          At {b.backfillPct}% backfill about {Math.round(pc.navigableLengthM)} m of gallery is left
          navigable at the rebound horizon, and a usable route needs{' '}
          {CANOE_MIN_NAVIGABLE_LENGTH_M} m. The money is still spent and the benefit is still
          promised. Backfill less, or promise something you can deliver — the same paste that holds
          the ground under the Old Town is what closes the route, and nothing in the budget resolves
          that for you.
        </>
      ) : (
        <>
      <span className="font-bold">
        The canoe costs {formatCurrency(canoePriceUsd)} to build and{' '}
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
