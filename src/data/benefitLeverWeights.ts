import { normalizeBenefitId } from './communityBenefits';
import type { CommunityBenefitId } from './communityBenefits';

/** Spend rung (USD) → weight for utility scaling (no dollars enter the utility formula). */
export const WATER_SPEND_WEIGHTS: { spendUsd: number; weight: number }[] = [
  { spendUsd: 300_000, weight: 0.1 },
  { spendUsd: 2_300_000, weight: 0.37 },
  { spendUsd: 4_300_000, weight: 0.63 },
  { spendUsd: 6_300_000, weight: 0.9 },
];

export const WASTE_SPEND_WEIGHTS: { spendUsd: number; weight: number }[] = [
  { spendUsd: 300_000, weight: 0.1 },
  { spendUsd: 2_300_000, weight: 0.3 },
  { spendUsd: 4_300_000, weight: 0.5 },
  { spendUsd: 6_300_000, weight: 0.7 },
  { spendUsd: 8_300_000, weight: 0.9 },
];

export const AIR_SPEND_WEIGHTS: { spendUsd: number; weight: number }[] = [
  { spendUsd: 0, weight: 0.1 },
  { spendUsd: 2_000_000, weight: 0.37 },
  { spendUsd: 4_000_000, weight: 0.63 },
  { spendUsd: 6_000_000, weight: 0.9 },
];

/** Which mitigation lever scales each benefit’s base utility. */
export const BENEFIT_LEVER_CATEGORY: Record<CommunityBenefitId, 'water' | 'waste' | 'air'> = {
  park: 'air',
  irrigation: 'water',
  canoe: 'water',
  energy_storage: 'waste',
  workforce: 'waste',
};

export type LeverWeights = { water: number; waste: number; air: number };

const DEFAULT_WEIGHTS: LeverWeights = { water: 1, waste: 1, air: 1 };

function weightForSpend(
  spendUsd: number,
  rungs: { spendUsd: number; weight: number }[]
): number {
  if (rungs.length === 0) return 1;
  const sorted = [...rungs].sort((a, b) => a.spendUsd - b.spendUsd);
  if (spendUsd <= sorted[0].spendUsd) return sorted[0].weight;
  const last = sorted[sorted.length - 1];
  if (spendUsd >= last.spendUsd) return last.weight;
  let best = sorted[0];
  let bestDist = Infinity;
  for (const r of sorted) {
    const d = Math.abs(spendUsd - r.spendUsd);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return best.weight;
}

/** Map current water/waste/air allocations to table weights. */
export function getLeverWeightsForAllocations(
  allocWater: number | null | undefined,
  allocWaste: number | null | undefined,
  allocAir: number | null | undefined
): LeverWeights {
  if (
    allocWater == null ||
    allocWaste == null ||
    allocAir == null ||
    !Number.isFinite(allocWater) ||
    !Number.isFinite(allocWaste) ||
    !Number.isFinite(allocAir)
  ) {
    return { ...DEFAULT_WEIGHTS };
  }
  return {
    water: weightForSpend(allocWater, WATER_SPEND_WEIGHTS),
    waste: weightForSpend(allocWaste, WASTE_SPEND_WEIGHTS),
    air: weightForSpend(allocAir, AIR_SPEND_WEIGHTS),
  };
}

export function weightForBenefitId(
  benefitId: string,
  weights: LeverWeights
): number {
  // Accepts IDs from builds before the 31 October 2026 rename.
  const cat = BENEFIT_LEVER_CATEGORY[normalizeBenefitId(benefitId) as CommunityBenefitId];
  if (!cat) return 1;
  return weights[cat];
}

/**
 * Sum of (base utility × lever weight for that benefit’s category).
 * Base utilities are the existing chart constants; dollars are not used here.
 */
export function calculateWeightedBenefitUtility(
  benefitIds: string[],
  baseUtilById: Record<string, number>,
  weights: LeverWeights
): number {
  let sum = 0;
  for (const id of benefitIds) {
    const base = baseUtilById[normalizeBenefitId(id)];
    if (base == null) continue;
    sum += base * weightForBenefitId(id, weights);
  }
  return sum;
}
