/**
 * The community vote, as logic rather than as a screen.
 *
 * Pulled out of CommunityView on 31 October 2026 when the vote became
 * two-stage, for one reason: this is the most consequential arithmetic in the
 * exercise and it was sitting inside a React component where nothing could
 * test it. The pre-registered checks in scripts/check-air-campus.ts now assert
 * its behaviour directly.
 *
 * The two stages exist because "should there be a mine" and "how big should it
 * be" are different questions that were previously scored on one 0-5 scale.
 * "Oppose Mine" sat in the size list as a sixth option, so a group could score
 * 4 km2 a five and Oppose a five in the same breath and the tally added both.
 */

export type GroupId = 'tourism' | 'agriculture' | 'academics' | 'industries' | 'environmental';
export type MineSizeId = '8km' | '4km' | '2km' | '1km' | '0.5km' | 'oppose';

/** Stage one: a group accepts a mine in principle, refuses one, or holds no view. */
export type MineStance = 'accept' | 'reject' | 'abstain';

export interface Group {
  id: GroupId;
  label: string;
  /** Tailwind classes for the group's column and card. */
  color: string;
}

export const GROUPS: Group[] = [
  { id: 'tourism', label: 'Tourism', color: 'bg-blue-100 border-blue-300' },
  { id: 'agriculture', label: 'Agriculture', color: 'bg-green-100 border-green-300' },
  { id: 'academics', label: 'Academics', color: 'bg-purple-100 border-purple-300' },
  { id: 'industries', label: 'Industries', color: 'bg-orange-100 border-orange-300' },
  { id: 'environmental', label: 'Environmental', color: 'bg-teal-100 border-teal-300' },
];

export const MINE_SIZES: {
  id: MineSizeId;
  label: string;
  benefitsUnlocked: number;
  image: string;
}[] = [
  { id: '8km', label: '8 km²', benefitsUnlocked: 5, image: '/mining_5.png' },
  { id: '4km', label: '4 km²', benefitsUnlocked: 4, image: '/mining_4.png' },
  { id: '2km', label: '2 km²', benefitsUnlocked: 3, image: '/mining_3.png' },
  { id: '1km', label: '1 km²', benefitsUnlocked: 2, image: '/mining_2.png' },
  { id: '0.5km', label: '0.5 km²', benefitsUnlocked: 1, image: '/mining_1.png' },
  { id: 'oppose', label: 'Oppose Mine', benefitsUnlocked: 0, image: '/baseline.png' },
];

/** The five real sizes. Opposition is recorded in stage one, not scored here. */
export const SIZE_BALLOT = MINE_SIZES.filter(m => m.id !== 'oppose');

export type SizeVotes = Record<GroupId, Record<MineSizeId, number>>;

export interface StageOneResult {
  accepts: number;
  rejects: number;
  abstains: number;
  /** Groups needed on one side for the question to be settled. */
  majority: number;
  /** The question is settled, one way or the other. */
  decided: boolean;
  /** An absolute majority of groups accept a mine in principle. */
  approved: boolean;
  /** An absolute majority refuse, or everyone has answered and no majority accepts. */
  refused: boolean;
}

/**
 * Stage one, and the rule is an absolute majority rather than "more accepts
 * than refuses".
 *
 * The simpler rule was there first and it was wrong. Under it, one group
 * accepting while the other four held no view approved a mine, because one
 * beats zero. That is a project cleared with the active support of a fifth of
 * the community, in an exercise about consent. Silence is not consent, so
 * abstaining does not count toward a mine - three of the five groups have to
 * accept one.
 *
 * It follows that the question can be unsettled rather than answered: two
 * accepting and three silent is neither approval nor refusal, and the panel
 * says so instead of recording opposition the community never voted for.
 * Refusal needs a majority too, or else every group answering without a
 * majority accepting, which is the real deadlock case.
 */
export function resolveStageOne(stances: Record<GroupId, MineStance>): StageOneResult {
  const accepts = GROUPS.filter(g => stances[g.id] === 'accept').length;
  const rejects = GROUPS.filter(g => stances[g.id] === 'reject').length;
  const abstains = GROUPS.length - accepts - rejects;
  const majority = Math.floor(GROUPS.length / 2) + 1;
  const everyoneAnswered = abstains === 0;

  const approved = accepts >= majority;
  const refused = !approved && (rejects >= majority || everyoneAnswered);

  return { accepts, rejects, abstains, majority, decided: approved || refused, approved, refused };
}

export interface RunoffRound {
  /** 1-based. */
  round: number;
  /** First-preference count per surviving size this round. */
  counts: Record<MineSizeId, number>;
  /** Groups still backing a surviving size. */
  activeGroups: number;
  /** Groups whose every acceptable size has been eliminated. */
  exhaustedGroups: number;
  /** Sizes dropped at the end of this round. */
  eliminated: MineSizeId[];
  /** The size that reached a majority this round, if any. */
  decidedBy: MineSizeId | null;
}

export interface SizeTally {
  /** The size that won, or null where the vote cannot resolve one. */
  winnerId: MineSizeId | null;
  /** Raw summed scores. Kept for display only - it no longer picks the winner. */
  tallies: Record<MineSizeId, number>;
  /** How many groups scored each size zero, i.e. declared it unacceptable. */
  refusals: Record<MineSizeId, number>;
  /** How many groups put each size first among the sizes they accept. */
  firstPreferences: Record<MineSizeId, number>;
  /** The elimination rounds, so a facilitator can show why a size won. */
  rounds: RunoffRound[];
  /** Set where the count ran out of ways to resolve, with the reason. */
  unresolved: string | null;
}

const zeroed = (): Record<MineSizeId, number> => ({
  '8km': 0,
  '4km': 0,
  '2km': 0,
  '1km': 0,
  '0.5km': 0,
  oppose: 0,
});

/**
 * A group's sizes in its own order of preference, highest score first, with
 * every size it scored zero left out entirely.
 *
 * The exclusion is the point. A zero means that size is unacceptable to the
 * group, so it can never become a transfer target: a group whose first choice
 * is eliminated moves to its next ACCEPTABLE size, and if it has none left it
 * drops out of the count rather than being pushed onto something it refused.
 *
 * Ties inside a group are broken toward the smaller mine. Some tiebreak is
 * needed and this one is at least principled: where a group has expressed no
 * preference between two sizes, the exercise should not read that indifference
 * as licence for the larger excavation.
 */
function preferenceOrder(groupVotes: Record<MineSizeId, number>): MineSizeId[] {
  return SIZE_BALLOT.filter(m => (groupVotes[m.id] ?? 0) > 0)
    .slice()
    .sort((a, b) => {
      const diff = (groupVotes[b.id] ?? 0) - (groupVotes[a.id] ?? 0);
      if (diff !== 0) return diff;
      // SIZE_BALLOT runs largest to smallest, so later index = smaller mine.
      return SIZE_BALLOT.indexOf(b) - SIZE_BALLOT.indexOf(a);
    })
    .map(m => m.id);
}

/**
 * Stage two, counted by group rather than by points.
 *
 * Summing every group's 0-5 scores was wrong, and wrong in a way that decided
 * real runs. A group's weight depended on how generously it scored: an
 * emphatic group putting a 5 on one size contributed five points, while a
 * hedging group spreading 3, 2 and 1 contributed six. Two groups scoring 8 km2
 * a five could beat three groups whose first choice was 1 km2 and who had all
 * scored 8 km2 zero - a minority winning outright on vocabulary.
 *
 * Normalizing each group to a fixed point budget does not fix it; that was
 * tested before this was written. Two groups all-in on one size put their
 * whole budget there while three groups spreading the same budget across three
 * sizes give their favourite only three fifths of theirs. Concentration beats
 * numbers under ANY scheme that sums intensities. Only counting groups fixes
 * it, so each group now contributes exactly one voice however it writes its
 * numbers, and the 0-5 scores earn their keep as the transfer order.
 *
 * A winner needs a majority of the groups still in the count, which matches
 * stage one: both stages are decided by a majority of groups rather than by
 * whoever pressed hardest.
 */
export function tallySizeVotes(votes: SizeVotes): SizeTally {
  const tallies = zeroed();
  const refusals = zeroed();

  GROUPS.forEach(g => {
    const groupVotes = votes[g.id];
    if (!groupVotes) return;
    SIZE_BALLOT.forEach(({ id }) => {
      const score = groupVotes[id] ?? 0;
      tallies[id] += score;
      if (score === 0) refusals[id] += 1;
    });
  });

  const orders = new Map<GroupId, MineSizeId[]>();
  GROUPS.forEach(g => orders.set(g.id, preferenceOrder(votes[g.id] ?? zeroed())));

  const alive = new Set<MineSizeId>(SIZE_BALLOT.map(m => m.id));
  const rounds: RunoffRound[] = [];
  const firstPreferences = zeroed();

  // First preferences before any elimination, for display.
  GROUPS.forEach(g => {
    const top = (orders.get(g.id) ?? [])[0];
    if (top) firstPreferences[top] += 1;
  });

  let winnerId: MineSizeId | null = null;
  let unresolved: string | null = null;

  for (let round = 1; round <= SIZE_BALLOT.length + 1; round++) {
    const counts = zeroed();
    let active = 0;
    let exhausted = 0;

    GROUPS.forEach(g => {
      const choice = (orders.get(g.id) ?? []).find(id => alive.has(id));
      if (choice) {
        counts[choice] += 1;
        active += 1;
      } else {
        exhausted += 1;
      }
    });

    if (active === 0) {
      rounds.push({
        round,
        counts,
        activeGroups: 0,
        exhaustedGroups: exhausted,
        eliminated: [],
        decidedBy: null,
      });
      unresolved =
        'No group has named an acceptable size. Every group scored every size zero, so there is nothing to count.';
      break;
    }

    const needed = Math.floor(active / 2) + 1;
    const leaders = [...alive].filter(id => counts[id] >= needed);

    if (leaders.length === 1) {
      winnerId = leaders[0];
      rounds.push({
        round,
        counts,
        activeGroups: active,
        exhaustedGroups: exhausted,
        eliminated: [],
        decidedBy: winnerId,
      });
      break;
    }

    const contenders = [...alive].filter(id => counts[id] > 0);
    if (contenders.length === 1) {
      winnerId = contenders[0];
      rounds.push({
        round,
        counts,
        activeGroups: active,
        exhaustedGroups: exhausted,
        eliminated: [],
        decidedBy: winnerId,
      });
      break;
    }

    // Eliminate the weakest surviving size. A size nobody currently backs goes
    // first; otherwise the lowest count, and on a tie the larger mine, for the
    // same reason ties inside a group break toward the smaller one.
    const lowest = Math.min(...contenders.map(id => counts[id]));
    const unbacked = [...alive].filter(id => counts[id] === 0);
    const doomed = unbacked.length
      ? unbacked
      : [contenders.filter(id => counts[id] === lowest)[0]];

    if (doomed.length === alive.size) {
      rounds.push({
        round,
        counts,
        activeGroups: active,
        exhaustedGroups: exhausted,
        eliminated: [],
        decidedBy: null,
      });
      unresolved =
        'Every surviving size is tied with every other and eliminating any would decide the vote arbitrarily. The groups have to talk rather than recount.';
      break;
    }

    doomed.forEach(id => alive.delete(id));
    rounds.push({
      round,
      counts,
      activeGroups: active,
      exhaustedGroups: exhausted,
      eliminated: doomed,
      decidedBy: null,
    });
  }

  return { winnerId, tallies, refusals, firstPreferences, rounds, unresolved };
}

/**
 * The single value the rest of the app reads, and the one written to the CSV.
 *
 * `null` means the community has not resolved anything yet. `'oppose'` is the
 * recorded outcome of a stage-one refusal, which keeps the export shape
 * unchanged for the admin dashboard while meaning something different from
 * "they wanted a smaller mine".
 */
export function resolveCommunityWinner(
  stageOne: StageOneResult,
  sizeWinnerId: MineSizeId | null
): MineSizeId | null {
  if (stageOne.refused) return 'oppose';
  if (!stageOne.approved) return null;
  return sizeWinnerId;
}

/** A group's own top size, or a statement that it finds every size unacceptable. */
export function preferredSizeLabel(groupVotes: Record<MineSizeId, number>): string {
  let bestId: MineSizeId | null = null;
  let max = 0;
  SIZE_BALLOT.forEach(({ id }) => {
    const score = groupVotes[id] ?? 0;
    if (score > max) {
      max = score;
      bestId = id;
    }
  });
  if (!bestId) return 'none acceptable';
  return MINE_SIZES.find(m => m.id === bestId)?.label ?? '-';
}
