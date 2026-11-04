import React, { useState, useMemo, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { MapPin, X, Download, Info } from 'lucide-react';
import {
  NO_BUILD_AREAS,
  canToggleNoBuildZone,
  getMaxNoBuildZonesForCommunityWinner,
  type NoBuildAreaId,
  type SelectableNoBuildId,
} from '../data/noBuildAreas';
import {
  COMMUNITY_BENEFITS,
  getCommunityBenefit,
  type CommunityBenefitId,
} from '../data/communityBenefits';
import {
  GROUPS,
  MINE_SIZES,
  SIZE_BALLOT,
  preferredSizeLabel,
  resolveCommunityWinner,
  resolveStageOne,
  tallySizeVotes,
  type GroupId,
  type MineSizeId,
  type MineStance,
} from '../data/communityVote';
import { BENEFIT_DETAILS } from '../data/benefitDetails';
import { NoBuildOverlays } from './map/NoBuildOverlays';
import { MapScaleBar } from './map/MapScaleBar';


export const CommunityView: React.FC = () => {
  const [votes, setVotes] = useState<Record<GroupId, Record<MineSizeId, number>>>(() => {
    const initial = {} as Record<GroupId, Record<MineSizeId, number>>;
    GROUPS.forEach(g => {
      initial[g.id] = {} as Record<MineSizeId, number>;
      MINE_SIZES.forEach(m => {
        initial[g.id][m.id] = 0;
      });
    });
    return initial;
  });

  /** Stage one. Every group starts undecided; nothing is assumed on their behalf. */
  const [stances, setStances] = useState<Record<GroupId, MineStance>>(() => {
    const initial = {} as Record<GroupId, MineStance>;
    GROUPS.forEach(g => {
      initial[g.id] = 'abstain';
    });
    return initial;
  });

  /** Fixed slots (1–3) for community-wide benefit picks — not per stakeholder group. */
  const [benefitSlots, setBenefitSlots] = useState<(CommunityBenefitId | '')[]>([]);

  const [hoveredBenefitId, setHoveredBenefitId] = useState<CommunityBenefitId | null>(null);
  const [selectedNoBuildIds, setSelectedNoBuildIds] = useState<SelectableNoBuildId[]>([]);

  const {
    winnerId: sizeWinnerId,
    tallies,
    refusals,
    firstPreferences,
    rounds,
    unresolved,
  } = useMemo(() => tallySizeVotes(votes), [votes]);

  const stageOne = useMemo(() => resolveStageOne(stances), [stances]);
  const {
    accepts,
    rejects,
    abstains,
    majority,
    decided: stageOneDecided,
    approved: mineApproved,
    refused: mineRefused,
  } = stageOne;

  const winnerId = resolveCommunityWinner(stageOne, sizeWinnerId);
  const winner = winnerId ? MINE_SIZES.find(m => m.id === winnerId) : null;
  const benefitsUnlocked = winner ? winner.benefitsUnlocked : 0;
  const maxNoBuildZones = getMaxNoBuildZonesForCommunityWinner(winnerId);

  const selectedBenefitIds = useMemo(
    () => benefitSlots.filter((id): id is CommunityBenefitId => id !== ''),
    [benefitSlots]
  );

  const prevWinnerRef = useRef<MineSizeId | null | undefined>(undefined);
  useEffect(() => {
    if (prevWinnerRef.current !== undefined && prevWinnerRef.current !== winnerId) {
      setSelectedNoBuildIds([]);
    }
    prevWinnerRef.current = winnerId;
  }, [winnerId]);

  /** Clear or trim selections when the winning size disallows or limits zones (e.g. 8 km² → 0). */
  useEffect(() => {
    setSelectedNoBuildIds(prev => {
      if (maxNoBuildZones <= 0 && prev.length > 0) return [];
      if (prev.length > maxNoBuildZones) return prev.slice(0, maxNoBuildZones);
      return prev;
    });
  }, [maxNoBuildZones]);

  useEffect(() => {
    setBenefitSlots(prev => {
      const kept = prev.filter((id): id is CommunityBenefitId => id !== '').slice(0, benefitsUnlocked);
      return [
        ...kept,
        ...Array(Math.max(0, benefitsUnlocked - kept.length)).fill('' as const),
      ];
    });
  }, [benefitsUnlocked, winnerId]);

  // Stage-two scores are deliberately NOT cleared when stage one flips to a
  // refusal. An earlier version wiped them, which punished a group for testing
  // what refusal looked like by destroying a ranking they had just agreed. The
  // scores never reach the export in that state — the exported winner is
  // 'oppose' and no benefits unlock — so keeping them costs nothing and means
  // changing an answer back restores the work.
  const handleStanceChange = (gId: GroupId, stance: MineStance) => {
    setStances(prev => ({ ...prev, [gId]: stance }));
  };

  const handleVoteChange = (gId: GroupId, mId: MineSizeId, val: number) => {
    setVotes(prev => ({
      ...prev,
      [gId]: { ...prev[gId], [mId]: val },
    }));
  };

  const handleBenefitSelectAt = (slotIndex: number, raw: string) => {
    setBenefitSlots(prev => {
      const next: (CommunityBenefitId | '')[] = Array.from(
        { length: benefitsUnlocked },
        (_, i) => prev[i] ?? ''
      );
      if (!raw) {
        next[slotIndex] = '';
        return next;
      }
      const bId = raw as CommunityBenefitId;
      for (let i = 0; i < benefitsUnlocked; i++) {
        if (i !== slotIndex && next[i] === bId) next[i] = '';
      }
      next[slotIndex] = bId;
      return next;
    });
  };

  const handleRemoveBenefit = (benefitId: CommunityBenefitId) => {
    setBenefitSlots(prev =>
      prev.map(id => (id === benefitId ? '' : id))
    );
  };

  const handleDownloadCSV = () => {
    const benefitIds = selectedBenefitIds.join('|');
    const consensusAreaIds =
      selectedNoBuildIds.length > 0 ? selectedNoBuildIds.join('|') : 'none';
    const noGoCount = selectedNoBuildIds.length;
    const csvContent = `winnerId,benefitsCount,benefitIds,consensusAreaId,noGoZoneCount,maxNoGoZones\n${winnerId || 'none'},${selectedBenefitIds.length},${benefitIds},${consensusAreaIds},${noGoCount},${maxNoBuildZones}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'community_results.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeBenefit = hoveredBenefitId
    ? {
        label: getCommunityBenefit(hoveredBenefitId)?.label ?? hoveredBenefitId,
        ...BENEFIT_DETAILS[hoveredBenefitId],
      }
    : null;

  const noBuildSummaryText =
    selectedNoBuildIds.length === 0
      ? (NO_BUILD_AREAS.find(a => a.id === 'none')?.description ?? '')
      : selectedNoBuildIds
          .map(id => NO_BUILD_AREAS.find(a => a.id === id)?.label)
          .filter(Boolean)
          .join(', ');

  const toggleNoBuildArea = (id: NoBuildAreaId) => {
    if (id === 'none') {
      setSelectedNoBuildIds([]);
      return;
    }
    if (maxNoBuildZones <= 0) {
      alert('The winning mine size (8 km²) does not allow no-go zones.');
      return;
    }
    const adding = !selectedNoBuildIds.includes(id as SelectableNoBuildId);
    const check = canToggleNoBuildZone(
      selectedNoBuildIds,
      id as SelectableNoBuildId,
      adding,
      maxNoBuildZones
    );
    if (!check.ok) {
      alert(check.message);
      return;
    }
    setSelectedNoBuildIds(prev =>
      prev.includes(id as SelectableNoBuildId)
        ? prev.filter(x => x !== id)
        : [...prev, id as SelectableNoBuildId]
    );
  };

  const noGoZoneDisabled = (id: NoBuildAreaId) => id !== 'none' && maxNoBuildZones <= 0;

  return (
    <div className="flex-1 flex gap-4 min-h-0 overflow-hidden relative">
      <button
        onClick={handleDownloadCSV}
        className="absolute bottom-4 left-4 z-50 bg-green-600 text-white px-4 py-2 rounded-full font-bold shadow-lg hover:bg-green-700 flex items-center gap-2 text-sm"
      >
        <Download size={16} /> Submit / Export CSV
      </button>

      <div className="flex-[3] bg-white rounded-xl shadow-lg border border-gray-200 overflow-auto">
        {/*
          The step strip. The no-go panel used to be the first thing on this
          screen, above the vote - and how many zones a community may name
          depends on the winning size, so the first control on the page could
          not be used until two later ones were done. It is now Step 4, where
          it belongs. Beta items 16 and 42, and Janelle's note on step order.
        */}
        <div className="p-3 border-b bg-gray-50 sticky top-0 z-20">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { n: 1, title: 'Mine?', done: stageOneDecided },
              { n: 2, title: 'Size', done: mineApproved && winnerId !== null && winnerId !== 'oppose' },
              { n: 3, title: 'Benefits', done: selectedBenefitIds.length > 0 },
              { n: 4, title: 'No-go zones', done: selectedNoBuildIds.length > 0 },
            ].map((st, i, all) => (
              <React.Fragment key={st.n}>
                <span
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold',
                    st.done
                      ? 'bg-green-100 text-green-900 border border-green-300'
                      : 'bg-white text-gray-500 border border-gray-300'
                  )}
                >
                  <span
                    className={clsx(
                      'inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px]',
                      st.done ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'
                    )}
                  >
                    {st.done ? '✓' : st.n}
                  </span>
                  {st.title}
                </span>
                {i < all.length - 1 && <span className="text-gray-400 text-[10px]">›</span>}
              </React.Fragment>
            ))}
            <span className="ml-auto text-[10px] text-gray-500">
              then Submit / Export CSV, bottom left
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-gray-700">
            <strong>Work down the page in order.</strong> Decide whether there should be a mine at
            all, then how big, then what you ask for in return, then which ground you put beyond
            reach. Each step sets what the next one is allowed to do — the size decides both how
            many benefits you may name and how many no-go zones you may hold.
          </p>
        </div>
        {/* ------------------------- STEP 1: mine or no mine ------------------------- */}
        <div className="p-3 border-b bg-white">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-gray-900">Step 1 — Should there be a mine?</h3>
            <span className="text-[10px] uppercase tracking-wide text-gray-500">
              one answer per group
            </span>
          </div>
          <p className="text-[11px] text-gray-600 mt-1 max-w-3xl leading-snug">
            Decide this before any size is discussed. Whether to mine and how big to mine are
            different questions, and a group can hold a firm view on the first while having no view
            on the second. A mine needs {majority} of the {GROUPS.length} groups to accept it.{' '}
            <strong>Holding no view does not count as acceptance</strong> — silence is not
            consent — so until {majority} groups come down on one side the question stays open
            rather than being settled by whoever happened to speak.
          </p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {GROUPS.map(g => (
              <div key={g.id} className={clsx('rounded border p-2', g.color)}>
                <div className="text-xs font-bold text-gray-800">{g.label}</div>
                <div className="mt-1 flex gap-1">
                  {(['accept', 'reject', 'abstain'] as const).map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleStanceChange(g.id, option)}
                      aria-pressed={stances[g.id] === option}
                      className={clsx(
                        'flex-1 rounded border px-1 py-1 text-[10px] font-semibold capitalize transition-colors',
                        stances[g.id] === option
                          ? option === 'accept'
                            ? 'bg-green-700 text-white border-green-800'
                            : option === 'reject'
                              ? 'bg-red-700 text-white border-red-800'
                              : 'bg-gray-700 text-white border-gray-800'
                          : 'bg-white/80 text-gray-700 border-gray-300 hover:bg-white'
                      )}
                    >
                      {option === 'abstain' ? 'no view' : option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div
            className={clsx(
              'mt-2 rounded border-2 px-3 py-2 text-xs font-semibold',
              mineApproved
                ? 'border-green-500 bg-green-50 text-green-900'
                : mineRefused
                  ? 'border-red-500 bg-red-50 text-red-900'
                  : 'border-gray-300 bg-gray-50 text-gray-600'
            )}
          >
            {mineApproved ? (
              <>
                A mine proceeds — {accepts} accept, {rejects} refuse
                {abstains ? `, ${abstains} with no view` : ''}. Go on to Step 2 and settle the size.
              </>
            ) : mineRefused ? (
              <>
                No mine — {accepts} accept, {rejects} refuse
                {abstains ? `, ${abstains} with no view` : ''}.{' '}
                {rejects >= majority
                  ? `${rejects} groups refuse, which is a majority.`
                  : 'Every group has answered and no majority accepts.'}{' '}
                The community&apos;s position is to oppose, and no size is voted on. Export this as
                the result, or change an answer above to reopen Step 2.
              </>
            ) : (
              <>
                Not settled — {accepts} accept, {rejects} refuse, {abstains} with no view.{' '}
                {majority - accepts} more acceptance{majority - accepts === 1 ? '' : 's'} opens Step
                2; {majority - rejects} more refusal{majority - rejects === 1 ? '' : 's'} closes it.
                A silent group counts toward neither.
              </>
            )}
          </div>
        </div>

        {/* --------------------------- STEP 2: which size --------------------------- */}
        <div className="p-3 border-b bg-white">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3
              className={clsx(
                'text-sm font-bold',
                mineApproved ? 'text-gray-900' : 'text-gray-400'
              )}
            >
              Step 2 — How big should it be?
            </h3>
            {!mineApproved && (
              <span className="text-[10px] uppercase tracking-wide text-gray-500">
                locked until {majority} groups accept a mine
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-600 mt-1 max-w-3xl leading-snug">
            Each group scores every size from 0 to 5. <strong>0 does not mean &ldquo;no
            opinion&rdquo;</strong> — it means that size is unacceptable to your group, and a size
            you score 0 will never be counted for you, even if everything you preferred is
            eliminated. 5 means strongly preferred.
          </p>
          <p className="text-[11px] text-gray-600 mt-1 max-w-3xl leading-snug">
            <strong>The scores set your order, not your weight.</strong> Every group carries one
            voice however large the numbers it writes, because summing the scores let a group that
            scored generously outweigh one that scored sharply — two groups putting a 5 on one
            size could beat three groups whose first choice was something else. So each group&apos;s
            top acceptable size is counted; if nothing holds a majority the weakest size drops out
            and those groups move to their next acceptable size, until one has a majority of the
            groups still counting.
          </p>
        </div>

        <table
          className={clsx(
            'w-full text-xs text-left border-collapse',
            !mineApproved && 'opacity-40 pointer-events-none select-none'
          )}
          aria-disabled={!mineApproved}
        >
          <thead className="bg-gray-100 text-gray-700 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="p-2 border font-bold min-w-[120px]">Community Group Impacted</th>
              {GROUPS.map(g => (
                <th key={g.id} className={clsx('p-2 border font-bold text-center', g.color)}>
                  {g.label}
                </th>
              ))}
              <th className="p-2 border font-bold bg-gray-200 text-center min-w-[140px]">
                Groups backing it
                <div className="text-[9px] font-normal normal-case text-gray-600">
                  first preferences · raw score · refusals
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {SIZE_BALLOT.map(size => (
              <tr
                key={size.id}
                className={clsx(
                  'hover:bg-gray-50',
                  winnerId === size.id && 'bg-yellow-50 font-medium'
                )}
              >
                <td className="p-2 border font-semibold">{size.label}</td>
                {GROUPS.map(g => (
                  <td key={g.id} className="p-1 border text-center">
                    <select
                      value={votes[g.id][size.id]}
                      onChange={e => handleVoteChange(g.id, size.id, Number(e.target.value))}
                      className="w-full p-0.5 border rounded text-center text-xs"
                    >
                      {[0, 1, 2, 3, 4, 5].map(n => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
                <td className="p-2 border text-center">
                  <div className="font-bold text-base text-blue-600">
                    {firstPreferences[size.id]}
                    <span className="text-[10px] font-normal text-gray-500">
                      {' '}
                      of {GROUPS.length}
                    </span>
                  </div>
                  <div className="text-[9px] text-gray-400 leading-tight">
                    raw score {tallies[size.id]} — not what decides it
                  </div>
                  <div
                    className={clsx(
                      'text-[9px] leading-tight',
                      refusals[size.id] > 0 ? 'font-semibold text-red-700' : 'text-gray-400'
                    )}
                  >
                    {refusals[size.id] === 0
                      ? 'no group refuses'
                      : `${refusals[size.id]} of ${GROUPS.length} find this unacceptable`}
                  </div>
                </td>
              </tr>
            ))}

            <tr className="bg-gray-100 border-t-2 border-gray-300">
              <td className="p-2 border font-bold">Group&apos;s Preferred Option</td>
              {GROUPS.map(g => (
                <td key={g.id} className="p-2 border text-center font-medium text-gray-600">
                  {preferredSizeLabel(votes[g.id])}
                </td>
              ))}
              <td className="p-2 border text-center font-bold text-lg bg-yellow-200 border-yellow-400">
                {winner
                  ? winner.label
                  : mineApproved
                    ? 'no size agreed'
                    : stageOneDecided
                      ? 'oppose'
                      : '-'}
              </td>
            </tr>

            <tr className="border-t-2 border-blue-200">
              <td className="p-2 border font-bold bg-blue-50 align-top">
                <div>Step 3 — Which benefits do you ask for?</div>
                <div className="text-[10px] font-normal text-gray-500 mt-0.5">
                  Select {benefitsUnlocked || '—'} benefit{benefitsUnlocked === 1 ? '' : 's'} for the
                  community. A larger mine unlocks more of them, which is the bargain on offer.
                </div>
                <div className="text-[10px] font-normal text-gray-500 mt-0.5">
                  Chosen: {selectedBenefitIds.length} / {benefitsUnlocked}
                </div>
              </td>
              <td colSpan={GROUPS.length} className="p-3 border bg-blue-50/30">
                {!winner || benefitsUnlocked === 0 ? (
                  <p className="text-[11px] text-gray-400 italic text-center py-2">
                    {winner?.id === 'oppose'
                      ? 'No benefits available when opposing the mine.'
                      : 'Complete voting to unlock community benefits.'}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-stretch justify-center gap-3">
                    {Array.from({ length: benefitsUnlocked }).map((_, slotIndex) => {
                      const slotValue = benefitSlots[slotIndex] ?? '';
                      return (
                        <div
                          key={slotIndex}
                          className="flex flex-col gap-1 min-w-[140px] flex-1 max-w-[220px]"
                        >
                          <span className="text-[10px] font-bold text-blue-800 text-center">
                            Benefit {slotIndex + 1}
                          </span>
                          <select
                            value={slotValue}
                            onChange={e => handleBenefitSelectAt(slotIndex, e.target.value)}
                            className="w-full p-1.5 border border-blue-200 rounded text-[11px] bg-white"
                            onMouseEnter={() => {
                              if (slotValue) setHoveredBenefitId(slotValue);
                            }}
                            onMouseLeave={() => setHoveredBenefitId(null)}
                          >
                            <option value="">Select benefit…</option>
                            {COMMUNITY_BENEFITS.map(b => (
                              <option
                                key={b.id}
                                value={b.id}
                                disabled={benefitSlots.some(
                                  (id, i) => i !== slotIndex && id === b.id
                                )}
                              >
                                {b.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </td>
              <td className="p-2 border bg-blue-50 align-top">
                <div className="flex flex-col gap-2">
                  <div className="rounded-lg border border-green-200 bg-green-50 px-2 py-2 text-center">
                    <div className="text-[10px] font-bold text-green-800 uppercase tracking-wide">
                      Community Benefit Package
                    </div>
                    <div className="text-2xl font-extrabold text-green-700 leading-tight mt-0.5">
                      {selectedBenefitIds.length} / {benefitsUnlocked || '—'}
                    </div>
                    <div className="text-[9px] text-green-700/80 mt-0.5">
                      Benefits selected for negotiation
                    </div>
                  </div>

                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                    Selected Benefits
                  </div>

                  {selectedBenefitIds.length === 0 && (
                    <div className="text-[10px] text-gray-400 italic">No benefits selected</div>
                  )}

                  {selectedBenefitIds.map(benefitId => {
                    const benefit = getCommunityBenefit(benefitId);
                    return (
                      <div
                        key={benefitId}
                        className="flex items-center justify-between bg-white p-1 rounded shadow-sm border border-blue-100 text-[10px] cursor-help"
                        onMouseEnter={() => setHoveredBenefitId(benefitId)}
                        onMouseLeave={() => setHoveredBenefitId(null)}
                      >
                        <span className="font-bold text-blue-800">{benefit?.label}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveBenefit(benefitId)}
                          className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
                          aria-label={`Remove ${benefit?.label}`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}

                  {selectedBenefitIds.length >= benefitsUnlocked && benefitsUnlocked > 0 && (
                    <div className="text-[10px] text-red-500 font-bold mt-0.5 text-center border-t border-red-200 pt-0.5">
                      Limit Reached
                    </div>
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/*
          How the size was reached, round by round. The count is no longer a
          single sum anyone can read off the page, so it has to show its work -
          otherwise "1 km2 won" is an assertion the room has to take on trust.
          A facilitator can walk the table and point at the transfer that
          decided it, which is the moment worth discussing.
        */}
        {mineApproved && rounds.length > 0 && (
          <div className="p-3 border-t bg-gray-50">
            <h4 className="text-xs font-bold text-gray-800">How the size was reached</h4>
            {unresolved ? (
              <p className="mt-1 text-[11px] text-red-800 bg-red-50 border border-red-200 rounded p-2 leading-snug">
                <strong>No size agreed.</strong> {unresolved}
              </p>
            ) : (
              <p className="text-[10px] text-gray-500 mt-0.5">
                One voice per group. Each round counts every group&apos;s best surviving size.
              </p>
            )}
            <ol className="mt-1.5 space-y-1">
              {rounds.map(r => {
                const needed = Math.floor(r.activeGroups / 2) + 1;
                return (
                  <li
                    key={r.round}
                    className={clsx(
                      'rounded border px-2 py-1 text-[11px] leading-snug',
                      r.decidedBy
                        ? 'border-green-400 bg-green-50 text-green-900'
                        : 'border-gray-300 bg-white text-gray-700'
                    )}
                  >
                    <span className="font-bold">Round {r.round}:</span>{' '}
                    {SIZE_BALLOT.filter(m => r.counts[m.id] > 0)
                      .map(m => `${m.label} ${r.counts[m.id]}`)
                      .join(' · ') || 'nothing counted'}
                    {r.exhaustedGroups > 0 && (
                      <span className="text-gray-500">
                        {' '}
                        ({r.exhaustedGroups} group
                        {r.exhaustedGroups === 1 ? '' : 's'} out of the count — every size they
                        would accept has been eliminated)
                      </span>
                    )}
                    {r.decidedBy ? (
                      <span className="font-semibold">
                        {' '}
                        — {MINE_SIZES.find(m => m.id === r.decidedBy)?.label} has{' '}
                        {r.counts[r.decidedBy]} of {r.activeGroups}, a majority of {needed}. Decided.
                      </span>
                    ) : r.eliminated.length ? (
                      <span>
                        {' '}
                        — no size reached {needed} of {r.activeGroups}, so{' '}
                        {r.eliminated
                          .map(id => MINE_SIZES.find(m => m.id === id)?.label ?? id)
                          .join(' and ')}{' '}
                        {r.eliminated.length === 1 ? 'drops' : 'drop'} out and those groups move to
                        their next acceptable size.
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* ------------------------ STEP 4: areas to avoid ------------------------ */}
        <div className="p-3 border-t-2 border-gray-300 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-gray-900">
                  Step 4 — Which ground is off limits?
                </h3>
                <span className="text-[10px] uppercase tracking-wide text-gray-500">
                  how many you may name depends on the size
                </span>
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {winner ? (
                  <span className="text-gray-600 font-medium">
                    Winning size {winner.label}:{' '}
                    {maxNoBuildZones === 0
                      ? 'no no-go zones allowed'
                      : `up to ${maxNoBuildZones} no-go zone(s) — ${selectedNoBuildIds.length} selected`}
                  </span>
                ) : (
                  <span className="text-gray-400 italic">Vote to determine mine size and no-go limit</span>
                )}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {selectedNoBuildIds.length === 0 ? (
                  noBuildSummaryText
                ) : (
                  <span>
                    Restricting:{' '}
                    <span className="font-semibold text-gray-700">{noBuildSummaryText}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-1 flex-wrap justify-end">
              {NO_BUILD_AREAS.map(area => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => toggleNoBuildArea(area.id)}
                  disabled={noGoZoneDisabled(area.id)}
                  className={clsx(
                    'px-2 py-1 rounded-full text-[10px] font-bold border transition-colors',
                    noGoZoneDisabled(area.id) && 'opacity-40 cursor-not-allowed',
                    area.id === 'none'
                      ? selectedNoBuildIds.length === 0
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      : selectedNoBuildIds.includes(area.id)
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  )}
                  aria-pressed={
                    area.id === 'none'
                      ? selectedNoBuildIds.length === 0
                      : selectedNoBuildIds.includes(area.id)
                  }
                >
                  {area.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/*
          Clearance for the floating Submit / Export CSV button, which is
          absolutely positioned at the bottom left of this column. Without it
          the button lands on the Step 4 read-out once the column is scrolled
          to the end, which is exactly when a team is reading that line.
        */}
        <div aria-hidden className="h-20 shrink-0" />
      </div>

      <div className="flex-[2] flex flex-col gap-2 bg-white p-3 rounded-xl shadow-lg border border-gray-200 h-full">
        {activeBenefit ? (
          <div className="flex flex-col h-full animate-in fade-in duration-300">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 shrink-0 mb-2 border-b pb-2">
              <Info size={20} className="text-blue-500" /> Benefit Details
            </h2>
            <div className="flex-1 overflow-hidden flex flex-col gap-3">
              <div className="relative h-48 shrink-0 bg-gray-100 rounded-lg overflow-hidden border">
                <img
                  src={activeBenefit.image}
                  alt={activeBenefit.label}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="overflow-y-auto">
                <h3 className="font-bold text-lg text-blue-700 mb-1">{activeBenefit.label}</h3>
                <p className="text-xs text-gray-600 leading-relaxed text-justify">
                  {activeBenefit.description}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full gap-3">
            <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2 shrink-0 mb-2">
              <MapPin size={20} /> Projected Impact
            </h2>
            <div className="flex-1 bg-gray-100 rounded-lg overflow-hidden border border-gray-300 relative flex items-center justify-center">
              <img
                src={winner ? winner.image : '/baseline.png'}
                alt={winner ? winner.label : 'Baseline'}
                className={clsx(
                  'w-full h-full',
                  winner && winner.id !== 'oppose' ? 'object-contain p-4' : 'object-cover p-0'
                )}
              />
              {winner && (
                <div className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 rounded shadow text-[10px] font-bold">
                  Winning Option: {winner.label}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-2 py-1 bg-gray-50 border-b text-[10px] font-bold text-gray-700 flex items-center justify-between">
                <span>No-build map</span>
                <span className="text-gray-500">
                  Selected:{' '}
                  {selectedNoBuildIds.length === 0
                    ? 'None'
                    : selectedNoBuildIds
                        .map(id => NO_BUILD_AREAS.find(a => a.id === id)?.label)
                        .filter(Boolean)
                        .join(', ')}
                </span>
              </div>
              <div className="relative w-full aspect-square bg-gray-100 overflow-visible">
                <img
                  src="/regional-map.png"
                  alt="Regional map"
                  className="absolute inset-0 w-full h-full object-contain object-center"
                />
                <NoBuildOverlays selectedNoBuildIds={selectedNoBuildIds} />
                <MapScaleBar />
              </div>
              <div className="px-2 py-1 text-[10px] text-gray-500">
                Map scale: 10 km × 10 km. Selected no-go zones show a red border and light fill.
              </div>
            </div>

            <div className="text-[10px] text-gray-400 text-center italic">
              Hover over a selected benefit to see details.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
