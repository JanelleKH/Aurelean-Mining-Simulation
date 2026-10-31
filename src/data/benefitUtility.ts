/**
 * The benefit chart's scoring convention: a price and a base utility per
 * benefit, and the fixed order bundles are enumerated in.
 *
 * Moved out of BenefitUtilityCostChart on 31 October 2026 so the registry
 * check can reach it. A node script cannot import a .tsx, so data living
 * inside a component is data no test can see - which is exactly how a benefit
 * went missing from a registry and stayed missing through the whole beta.
 *
 * These utilities are a convention for ranking bundles against one another.
 * They are NOT a measurement of anything in the ground: the water, waste and
 * air ledgers are the physical model.
 */

import { normalizeBenefitId } from './communityBenefits';
import type { CommunityBenefitId } from './communityBenefits';

// Typed against the ID union on purpose. As Record<string, ...> this map
// accepted a renamed or misspelled key in silence, which is how the
// electrification pairing stayed broken through the whole beta.
export const BENEFIT_VALUES: Record<CommunityBenefitId, { cost: number; util: number }> = {
  workforce: { cost: 5000000, util: 0.33 },
  energy_storage: { cost: 3000000, util: 0.27 },
  canoe: { cost: 2500000, util: 0.2 },
  irrigation: { cost: 900000, util: 0.13 },
  park: { cost: 700000, util: 0.07 },
};

/**
 * Look a benefit's chart values up from a string of unknown provenance - a CSV
 * field, a bundle key - accepting IDs written by builds before the 31 October
 * 2026 rename. The map itself stays typed against the ID union so a renamed or
 * misspelled key is a compile error rather than a silent zero.
 */
export function benefitValue(id: string): { cost: number; util: number } | undefined {
  const normalized = normalizeBenefitId(id) as CommunityBenefitId;
  return BENEFIT_VALUES[normalized];
}

export const BENEFIT_ID_ORDER = [
  'park',
  'irrigation',
  'canoe',
  'energy_storage',
  'workforce',
] as const satisfies readonly CommunityBenefitId[];
