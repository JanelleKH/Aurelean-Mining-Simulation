export const MINE_SIZES = [
  { value: 0.5, label: '0.5 km²', waste: 1500000, image: '/mining_1.png' },
  { value: 1.0, label: '1.0 km²', waste: 4500000, image: '/mining_2.png' },
  { value: 2.0, label: '2.0 km²', waste: 9000000, image: '/mining_3.png' },
  { value: 4.0, label: '4.0 km²', waste: 15000000, image: '/mining_4.png' },
  { value: 8.0, label: '8.0 km²', waste: 25000000, image: '/mining_5.png' },
] as const;

export const CAPACITIES = [
  { value: 500000, label: '0.5 Mton/yr', water: 250000 },
  { value: 1500000, label: '1.5 Mton/yr', water: 750000 },
  { value: 3000000, label: '3.0 Mton/yr', water: 1500000 },
  { value: 5000000, label: '5.0 Mton/yr', water: 2500000 },
] as const;

export type MineSize = (typeof MINE_SIZES)[number];
export type Capacity = (typeof CAPACITIES)[number];

export const ALPHA_W = 0.05;
export const ALPHA_S = 0.05;
export const K_W = 0.5;
export const K_S = 0.5;

export const MITIGATION_SPEND_MIN_USD = 300_000;
export const MITIGATION_STEP_USD = 2_000_000;
export const WATER_SPEND_MAX_USD = MITIGATION_SPEND_MIN_USD + 5 * MITIGATION_STEP_USD;
export const WASTE_SPEND_MAX_USD = MITIGATION_SPEND_MIN_USD + 6 * MITIGATION_STEP_USD;
export const AIR_SPEND_MAX_USD = 6_000_000;
export const BASELINE_WATER_WASTE_MITIGATION_USD = MITIGATION_SPEND_MIN_USD * 2;

/* ------------------------------------------------------------------ *
 * Financial assurance for air control
 *
 * Added 24 October 2026. Air control is capital that must then be
 * OPERATED — water, power, reagent, filter media, labour — at roughly
 * 15% of capital a year. Until now the budget charged only the
 * equipment, so a commitment to clean air cost nothing to keep and
 * could not compete with a community benefit.
 *
 * Regulators do not let operators carry that obligation on a promise:
 * they require financial assurance, posted up front and reviewed on a
 * three-to-five-year cycle. Three years is the conservative end, and it
 * is what the budget now charges alongside the equipment.
 *
 * The arithmetic that matters: the supply-chain tier ADDS its air
 * allocation to the budget and the allocation is then spent, so air used
 * to net to exactly zero — the cancellation found in the 23 September
 * trial. With assurance charged on top, every dollar of air control now
 * costs 45 cents of community benefits. At the $6M cap that is $2.7M,
 * roughly one benefit. Air bites without swamping the budget.
 * ------------------------------------------------------------------ */

/** Years of operating cost that must be secured before operating. */
export const AIR_ASSURANCE_YEARS = 3;

/** Annual operating cost as a share of control capital. Mirrors src/model/params.ts. */
export const AIR_OM_FRACTION_OF_CAPITAL = 0.15;

/** Each dollar of air capital costs this much budget, equipment plus assurance. */
export const AIR_BUDGET_MULTIPLIER = 1 + AIR_OM_FRACTION_OF_CAPITAL * AIR_ASSURANCE_YEARS;

/** Assurance that must be posted for a given air-control capital spend. */
export function airAssuranceUsd(airAllocUsd: number): number {
  return Math.max(0, airAllocUsd) * AIR_OM_FRACTION_OF_CAPITAL * AIR_ASSURANCE_YEARS;
}

export type AirTierId = 'extraction' | 'refining' | 'processing' | 'advanced_manufacturing';

export const AIR_TIERS: {
  id: AirTierId;
  label: string;
  rangeLabel: string;
  aqiWorst: number;
  statusLabel: string;
  statusColorClass: string;
  budgetAdd: number;
  description: string;
}[] = [
  {
    id: 'extraction',
    label: 'Extraction',
    rangeLabel: '0–51',
    aqiWorst: 0,
    statusLabel: 'Good',
    statusColorClass: 'text-green-700',
    budgetAdd: 0,
    description:
      'Traditional open-pit mining requires heavy blasting and ore crushing. These activities generate massive amounts of mineral dust and fine particulate matter. Combined with constant diesel exhaust from heavy machinery, this process typically creates the highest immediate impact on local air quality.',
  },
  {
    id: 'refining',
    label: 'Refining',
    rangeLabel: '51–100',
    aqiWorst: 100,
    statusLabel: 'Moderate',
    statusColorClass: 'text-yellow-700',
    budgetAdd: 2_000_000,
    description:
      'Turning ore or brine into battery-grade lithium chemicals involves high-heat roasting and acid leaching. This stage can release chemical vapors and sulfur dioxide into the atmosphere.',
  },
  {
    id: 'processing',
    label: 'Processing',
    rangeLabel: '101–150',
    aqiWorst: 150,
    statusLabel: 'Unhealthy for Sensitive Groups',
    statusColorClass: 'text-orange-700',
    budgetAdd: 4_000_000,
    description:
      'This stage involves the mixing and coating of chemicals to create battery cathodes and anodes.',
  },
  {
    id: 'advanced_manufacturing',
    label: 'Advanced Manufacturing',
    rangeLabel: '151–200',
    aqiWorst: 200,
    statusLabel: 'Unhealthy',
    statusColorClass: 'text-red-700',
    budgetAdd: 6_000_000,
    description:
      'The final assembly of battery cells happens in dry rooms and clean rooms to prevent contamination.',
  },
];

export const formatNumber = (num: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);

export const formatCurrency = (num: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    num
  );

export const clampMitigationLeverSpend = (
  raw: number,
  maxAffordableUsd: number,
  spendCeilingUsd: number
) => {
  const min = MITIGATION_SPEND_MIN_USD;
  const step = MITIGATION_STEP_USD;
  const cap = Math.min(Math.max(0, maxAffordableUsd), spendCeilingUsd);
  if (cap < min) return 0;
  const r = Number.isFinite(raw) ? raw : min;
  const t = Math.max(min, Math.min(r, cap));
  const k = Math.round((t - min) / step);
  let out = min + k * step;
  if (out > cap) {
    const kMax = Math.floor((cap - min) / step);
    out = min + Math.max(0, kMax) * step;
  }
  return out;
};

export const finalForAlloc = (params: { baseline: number; min: number; k: number; alloc: number }) => {
  const { baseline, min, k, alloc } = params;
  return min + (baseline - min) * Math.exp(-k * (alloc / 1_000_000));
};

export function waterSpendForCapacityIndex(capacityIdx: number) {
  return MITIGATION_SPEND_MIN_USD + capacityIdx * MITIGATION_STEP_USD;
}

export function wasteSpendForMineIndex(mineIdx: number) {
  return MITIGATION_SPEND_MIN_USD + mineIdx * MITIGATION_STEP_USD;
}

/** Required water+waste floors at lock, plus discretionary pool from mine/capacity steps. */
export function scenarioDiscretionaryPoolUsd(mineIdx: number, capacityIdx: number) {
  return (mineIdx + capacityIdx) * MITIGATION_STEP_USD;
}

export function computeTotalBudget(
  mineIdx: number,
  capacityIdx: number,
  airAllocUsd: number
) {
  const scenarioStepsUsd = (mineIdx + capacityIdx) * MITIGATION_STEP_USD;
  const requiredFloorsUsd = BASELINE_WATER_WASTE_MITIGATION_USD + scenarioStepsUsd;
  return requiredFloorsUsd + scenarioDiscretionaryPoolUsd(mineIdx, capacityIdx) + airAllocUsd;
}

export function airTierForBudgetAdd(budgetAdd: number) {
  return AIR_TIERS.find(t => t.budgetAdd === budgetAdd) ?? AIR_TIERS[0];
}

/** Snap to tier steps (0 / 2M / 4M / 6M) and cap by affordable spend. */
export function clampAirSpend(raw: number, maxAffordableUsd: number) {
  const stepped = Math.max(
    0,
    Math.min(AIR_SPEND_MAX_USD, Math.round(raw / MITIGATION_STEP_USD) * MITIGATION_STEP_USD)
  );
  const cap = Math.max(0, Math.min(AIR_SPEND_MAX_USD, maxAffordableUsd));
  let best = 0;
  for (const tier of AIR_TIERS) {
    if (tier.budgetAdd <= stepped && tier.budgetAdd <= cap) {
      best = Math.max(best, tier.budgetAdd);
    }
  }
  return best;
}
