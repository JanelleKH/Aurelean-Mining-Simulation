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

export interface SizeTally {
  /** Highest total among the five sizes, or null where every size scored zero. */
  winnerId: MineSizeId | null;
  tallies: Record<MineSizeId, number>;
  /** How many groups scored each size zero, i.e. declared it unacceptable. */
  refusals: Record<MineSizeId, number>;
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
 * Stage two: which size, given that a mine is going ahead.
 *
 * Also counts, per size, how many groups scored it zero. A zero adds nothing to
 * a sum, so under the old read-out "two groups find 8 km2 unacceptable" and
 * "two groups left that row alone" looked identical on screen. The sum still
 * picks the winner - no single group holds a veto here - but the refusals are
 * reported beside it, which is the point of voting in front of each other.
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

  let winnerId: MineSizeId | null = null;
  let maxScore = 0;
  SIZE_BALLOT.forEach(({ id }) => {
    if (tallies[id] > maxScore) {
      maxScore = tallies[id];
      winnerId = id;
    }
  });

  return { winnerId, tallies, refusals };
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
