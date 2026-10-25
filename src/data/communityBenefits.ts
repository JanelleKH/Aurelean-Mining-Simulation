export type CommunityBenefitId = 'park' | 'irrigation' | 'canoe' | 'energy' | 'research';

export interface CommunityBenefit {
  id: CommunityBenefitId;
  label: string;
  /**
   * Capital cost, charged to the developer's budget once.
   *
   * For every benefit but one this is the whole story. The canoe is the
   * exception: see `deferredLiability` and src/model/postClosure.ts.
   */
  cost: number;
  /**
   * True where the headline price is not the real cost, because the obligation
   * continues after the budget has been spent and after the mine has closed.
   */
  deferredLiability?: boolean;
}

export const COMMUNITY_BENEFITS: CommunityBenefit[] = [
  { id: 'park', label: 'Park/Forestry', cost: 700000 },
  { id: 'irrigation', label: 'Upgrade Irrigation System', cost: 900000 },
  /**
   * REPRICED 24 October 2026, from $2.5M.
   *
   * The galleries are driven anyway as part of mining; what the benefit buys is
   * a portal, a landing, lighting and access works. So it is now the second
   * cheapest thing on the list — cheap to promise, which is the point. Its real
   * cost is deferred and recurring: the backfill not placed, water treatment
   * once the workings rebound, pumping and access in perpetuity, and the
   * liability of leaving voids open beneath a historic town. None of that is
   * charged here, which is exactly how such obligations behave in the world.
   */
  { id: 'canoe', label: 'Underground Canoe System', cost: 900000, deferredLiability: true },
  { id: 'energy', label: 'Energy Storage Research Program', cost: 3000000 },
  { id: 'research', label: 'Advanced Manufacturing Workforce Training', cost: 5000000 },
];

export function getCommunityBenefit(id: string): CommunityBenefit | undefined {
  return COMMUNITY_BENEFITS.find(b => b.id === id);
}
