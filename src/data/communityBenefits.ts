import { computeWaterLedger, computePostClosure } from '../model/index';

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
  /**
   * BASELINE ONLY. The canoe's charged price scales with mine size — see
   * benefitCostUsd() below — because what the benefit buys is access works
   * along however much gallery has to be made safe and lit. This figure is the
   * price at the smallest size where the benefit can be delivered at all, and
   * it is what a caller gets if it asks for a price without a scenario.
   */
  { id: 'canoe', label: 'Underground Canoe System', cost: 425000, deferredLiability: true },
  { id: 'energy', label: 'Energy Storage Research Program', cost: 3000000 },
  { id: 'research', label: 'Advanced Manufacturing Workforce Training', cost: 5000000 },
];

export function getCommunityBenefit(id: string): CommunityBenefit | undefined {
  return COMMUNITY_BENEFITS.find(b => b.id === id);
}

/**
 * Whether the underground canoe can physically be delivered at this scenario.
 *
 * The canoe is the only benefit with a physical precondition rather than just a
 * price, and until now nothing enforced it: a team could buy it at any mine
 * size and be charged for something the model says cannot exist.
 *
 * It fails at both ends, for different reasons. Too small a mine leaves too
 * little gallery at the rebound horizon to be a route. Too large a mine leaves
 * the aquifer owing more to its own recovery each year than it receives, so
 * there is no spare recharge to hold the galleries flooded. Created by the
 * harm and destroyed by too much of it.
 *
 * Tested at zero backfill — the best case. Choosing to backfill later destroys
 * the route as well, but that is a separate decision with its own consequence.
 */
export function canoeAvailability(input: {
  mineSizeKm2: number;
  capacityTPerYr: number;
}): { deliverable: boolean; reason: string | null } {
  const water = computeWaterLedger({
    mineSizeKm2: input.mineSizeKm2,
    capacityTPerYr: input.capacityTPerYr,
    waterMitigationSpendUsd: 0,
  });
  const pc = computePostClosure({
    mineSizeKm2: input.mineSizeKm2,
    capacityTPerYr: input.capacityTPerYr,
    storageDepletedM3: water.balance.storageDepletedM3,
    backfillFraction: 0,
  });

  if (pc.canoeVerdict === 'not_enough_water') {
    return {
      deliverable: false,
      reason:
        `At ${input.mineSizeKm2} km² the canoe cannot be delivered, and no amount of money changes ` +
        `that. The galleries would flood within months of closure, but holding them needs about ` +
        `${Math.round(pc.water.reservationM3PerYr / 1000)}k m³ a year of throughflow and the aquifer ` +
        `has none to spare: it owes ${(pc.water.recoveryCallM3PerYr / 1e6).toFixed(1)}M m³ a year ` +
        `against the ${(pc.water.rechargeM3PerYr / 1e6).toFixed(1)}M m³ it receives, just to make ` +
        `good what this mine took. A smaller mine leaves enough water. This one does not.`,
    };
  }
  if (pc.canoeVerdict === 'too_short') {
    return {
      deliverable: false,
      reason:
        `At ${input.mineSizeKm2} km² the workings are too small to leave a navigable route: about ` +
        `${Math.round(pc.navigableLengthM)} m of gallery at the rebound horizon, where a usable ` +
        `route needs 800 m. A larger mine would drive enough gallery.`,
    };
  }
  return { deliverable: true, reason: null };
}

/** Rounding for prices shown to participants: nearest $25,000. */
const roundPrice = (usd: number) => Math.round(usd / 25_000) * 25_000;

/**
 * What a benefit costs at this scenario, in dollars charged once.
 *
 * Every benefit but one is a flat price. The canoe is not: the galleries are
 * driven as part of mining anyway, and what the benefit buys is the access
 * works — portal, landing, lighting, handrail — along however much gallery is
 * navigable. More mine means more gallery means more to make safe.
 *
 * The scaling range is small, because above 4 km2 the canoe cannot be bought
 * at any price (see canoeAvailability). So it runs about $0.43M at 1 km2 to
 * $0.95M at 4 km2 and stops. It stays the cheapest or second cheapest benefit
 * everywhere it can be promised, which is the point of it.
 *
 * Call this rather than reading `.cost` wherever money changes hands.
 */
export function benefitCostUsd(
  id: string,
  scenario?: { mineSizeKm2: number; capacityTPerYr: number } | null,
): number {
  const benefit = COMMUNITY_BENEFITS.find(b => b.id === id);
  if (!benefit) return 0;
  if (id !== 'canoe' || !scenario) return benefit.cost;

  const water = computeWaterLedger({
    mineSizeKm2: scenario.mineSizeKm2,
    capacityTPerYr: scenario.capacityTPerYr,
    waterMitigationSpendUsd: 0,
  });
  const pc = computePostClosure({
    mineSizeKm2: scenario.mineSizeKm2,
    capacityTPerYr: scenario.capacityTPerYr,
    storageDepletedM3: water.balance.storageDepletedM3,
    backfillFraction: 0,
  });
  return roundPrice(pc.canoeCost.capitalUsd);
}
