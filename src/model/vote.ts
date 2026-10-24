/**
 * vote.ts — the community's mine-size vote, as a pure function.
 *
 * Extracted from CommunityView.tsx on 24 October 2026 (work plan C2) so it can
 * be tested, and changed to implement B3: ties are not allowed to resolve.
 *
 * The defect this replaces: the old tally walked the options in declaration
 * order and kept any score strictly greater than the running maximum, so a tie
 * silently went to whichever option came first in the list. That list begins at
 * 8 km2 and ends with "oppose", which meant an even split between opposing the
 * mine and an 8 km2 mine was recorded as an 8 km2 mine, with nothing on screen
 * to say the room was divided.
 *
 * Janelle's decision: don't allow ties. A tie is therefore not resolved here at
 * all — it is reported as a tie, and the room is asked to vote again. That is
 * also the honest reading of how the exercise runs: the groups have to agree in
 * a room, so a split is a fact about the room, not an arithmetic problem to be
 * broken by a rule the participants cannot see.
 */

export type MineSizeId = '8km' | '4km' | '2km' | '1km' | '0.5km' | 'oppose';

export const MINE_SIZE_IDS: MineSizeId[] = ['8km', '4km', '2km', '1km', '0.5km', 'oppose'];

export type Tallies = Record<MineSizeId, number>;

export type VoteOutcome =
  /** A single highest-scoring option. */
  | { kind: 'winner'; winnerId: MineSizeId; score: number; tallies: Tallies }
  /** Two or more options share the highest score. The room must vote again. */
  | { kind: 'tie'; tiedIds: MineSizeId[]; score: number; tallies: Tallies }
  /** Nothing scored: no votes have been entered yet. */
  | { kind: 'no_votes'; tallies: Tallies };

export function emptyTallies(): Tallies {
  return { '8km': 0, '4km': 0, '2km': 0, '1km': 0, '0.5km': 0, oppose: 0 };
}

export function tallyVotes(votes: Record<string, Partial<Record<MineSizeId, number>>>): Tallies {
  const tallies = emptyTallies();
  for (const groupVotes of Object.values(votes)) {
    for (const id of MINE_SIZE_IDS) {
      const score = groupVotes[id];
      if (typeof score === 'number' && Number.isFinite(score)) {
        tallies[id] += score;
      }
    }
  }
  return tallies;
}

export function outcomeFromTallies(tallies: Tallies): VoteOutcome {
  let max = 0;
  for (const id of MINE_SIZE_IDS) {
    if (tallies[id] > max) max = tallies[id];
  }
  if (max <= 0) return { kind: 'no_votes', tallies };

  const leaders = MINE_SIZE_IDS.filter(id => tallies[id] === max);
  if (leaders.length > 1) {
    return { kind: 'tie', tiedIds: leaders, score: max, tallies };
  }
  return { kind: 'winner', winnerId: leaders[0], score: max, tallies };
}

export function getVoteOutcome(
  votes: Record<string, Partial<Record<MineSizeId, number>>>,
): VoteOutcome {
  return outcomeFromTallies(tallyVotes(votes));
}

/** Human-readable reason the room cannot proceed, or null if it can. */
export function blockingReason(outcome: VoteOutcome, labelFor: (id: MineSizeId) => string): string | null {
  if (outcome.kind === 'no_votes') {
    return 'No scores entered yet. Each group needs to rank the options before the result can be read.';
  }
  if (outcome.kind === 'tie') {
    const names = outcome.tiedIds.map(labelFor);
    const list =
      names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `The vote is tied between ${list}, each on ${outcome.score} points. A tie cannot be resolved by the portal — talk it through and vote again.`;
  }
  return null;
}
