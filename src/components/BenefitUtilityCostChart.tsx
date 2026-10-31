import React, { useMemo } from 'react';
import clsx from 'clsx';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  Label,
  Cell,
} from 'recharts';
import {
  BENEFIT_LEVER_CATEGORY,
  calculateWeightedBenefitUtility,
  getLeverWeightsForAllocations,
  weightForBenefitId,
  type LeverWeights,
} from '../data/benefitLeverWeights';
import { COMMUNITY_BENEFITS } from '../data/communityBenefits';
import type { CommunityBenefitId } from '../data/communityBenefits';

export const BENEFIT_VALUES: Record<string, { cost: number; util: number }> = {
  research: { cost: 5000000, util: 0.33 },
  energy: { cost: 3000000, util: 0.27 },
  canoe: { cost: 2500000, util: 0.2 },
  irrigation: { cost: 900000, util: 0.13 },
  park: { cost: 700000, util: 0.07 },
};

const BENEFIT_ID_ORDER = ['park', 'irrigation', 'canoe', 'energy', 'research'] as const;

const BASE_UTIL_BY_ID: Record<string, number> = Object.fromEntries(
  Object.entries(BENEFIT_VALUES).map(([k, v]) => [k, v.util])
);

export type LeverAllocations = {
  allocWater: number;
  allocWaste: number;
  allocAir: number;
};

function sameBenefitSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function percentileValue(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

const LEVER_LABEL: Record<'water' | 'waste' | 'air', string> = {
  water: 'water',
  waste: 'waste',
  air: 'air',
};

function benefitLabel(id: string): string {
  return COMMUNITY_BENEFITS.find(b => b.id === id)?.label ?? id;
}

function percentileBand(
  utility: number,
  sortedUtilities: number[],
  benefitIds: string[]
): string | null {
  if (benefitIds.length === 0) return null;
  if (sortedUtilities.length < 2) return null;
  const p25 = percentileValue(sortedUtilities, 25);
  const p75 = percentileValue(sortedUtilities, 75);
  if (utility < p25) return 'bottom 25% of bundles by utility';
  if (utility <= p75) return 'middle 50% of bundles by utility';
  return 'top 25% of bundles by utility';
}

function buildBundleTooltipLines(
  benefitIds: string[],
  utility: number,
  cost: number,
  weights: LeverWeights,
  hasLeverAllocations: boolean,
  percentileLabel: string | null,
  isMatch: boolean
): string[] {
  if (benefitIds.length === 0) {
    return [
      'No community benefits in this package.',
      'Utility and cost are both zero.',
      'Select benefits in the matrix or developer panel to compare funded bundles.',
    ];
  }

  const names = benefitIds.map(benefitLabel).join(', ');
  const lines: string[] = [
    `This package includes: ${names}.`,
  ];

  if (hasLeverAllocations) {
    const parts = benefitIds.map(id => {
      const base = BASE_UTIL_BY_ID[id] ?? 0;
      const w = weightForBenefitId(id, weights);
      const cat = BENEFIT_LEVER_CATEGORY[id as CommunityBenefitId];
      return `${benefitLabel(id)}: ${base.toFixed(2)} × ${w.toFixed(2)} (${LEVER_LABEL[cat]})`;
    });
    lines.push(`Utility sums base score × lever weight per benefit: ${parts.join('; ')}.`);
  } else {
    const parts = benefitIds.map(id => {
      const base = BASE_UTIL_BY_ID[id] ?? 0;
      return `${benefitLabel(id)} ${base.toFixed(2)}`;
    });
    lines.push(`Utility is the sum of base scores (weights = 1.0): ${parts.join(' + ')}.`);
  }

  lines.push(
    `Total utility = ${utility.toFixed(3)}; total cost = $${(cost / 1_000_000).toFixed(1)}M.`
  );

  if (percentileLabel) {
    lines.push(`Ranked in the ${percentileLabel}.`);
  }
  if (isMatch) {
    lines.push('★ This is the current team selection (black ring).');
  }

  return lines;
}

/**
 * How a bundle is drawn.
 *
 * This used to be a red / orange / green traffic light on utility percentile,
 * and it was wrong on three counts. First, it moralised: red said a cheap
 * low-utility bundle was a bad bundle, when the whole design of this exercise
 * refuses to rank dimensions against one another or produce an overall score.
 * A bundle that buys a park and nothing else is small, not wicked. Second, the
 * encoding was redundant — utility is already the y-axis, so colour was
 * repeating the vertical position and saying nothing new. Third, two of the
 * three colours failed the contrast floor against this panel's background
 * (#22c55e at 2.22:1 and #f97316 at 2.73:1, where a mark needs 3:1), and
 * red-against-green is the single worst pair to hand a colour-blind reader.
 *
 * So colour now carries the thing the facilitator actually needs and neither
 * axis shows: whether the bundle is inside the developer's budget. One hue,
 * two prominences — solid for affordable, faded for out of reach — which is
 * legible in any form of colour vision because it does not depend on hue at
 * all. Utility rank survives as words in the tooltip, where a rank belongs.
 */
const MARK_BLUE = '#2a78d6'; // 4.2:1 on this panel
const MARK_NEUTRAL = '#9ca3af';

function bundleMarkStyle(
  cost: number,
  benefitIds: string[],
  budget: number | null
): { fill: string; fillOpacity: number } {
  // The "fund nothing" point is neither affordable nor not; it is the origin.
  if (benefitIds.length === 0) return { fill: MARK_NEUTRAL, fillOpacity: 0.55 };
  if (budget == null || budget <= 0) return { fill: MARK_BLUE, fillOpacity: 0.8 };
  return cost <= budget
    ? { fill: MARK_BLUE, fillOpacity: 0.85 }
    : { fill: MARK_BLUE, fillOpacity: 0.22 };
}

/** All non-empty subsets for scatter (2^5 - 1 = 31) plus optional empty point. */
function generateBundleChartRows(weights: LeverWeights, includeEmpty: boolean) {
  const rows: {
    id: string;
    cost: number;
    utility: number;
    label: string;
    benefitIds: string[];
  }[] = [];

  if (includeEmpty) {
    rows.push({
      id: 'bundle-empty',
      cost: 0,
      utility: 0,
      label: '(no benefits)',
      benefitIds: [],
    });
  }

  const n = BENEFIT_ID_ORDER.length;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    const benefitIds: string[] = [];
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) benefitIds.push(BENEFIT_ID_ORDER[i]);
    }
    let cost = 0;
    for (const id of benefitIds) {
      cost += BENEFIT_VALUES[id]?.cost ?? 0;
    }
    const utility = calculateWeightedBenefitUtility(benefitIds, BASE_UTIL_BY_ID, weights);
    rows.push({
      id: `bundle-${mask}`,
      cost,
      utility,
      label: benefitIds.join(' + '),
      benefitIds,
    });
  }
  return rows;
}

export function calculateBenefitBundleMetrics(
  benefitIds: string[],
  leverAllocations?: LeverAllocations | null
) {
  let cost = 0;
  for (const id of benefitIds) {
    const data = BENEFIT_VALUES[id];
    if (data) cost += data.cost;
  }
  const weights = getLeverWeightsForAllocations(
    leverAllocations?.allocWater,
    leverAllocations?.allocWaste,
    leverAllocations?.allocAir
  );
  const util = calculateWeightedBenefitUtility(benefitIds, BASE_UTIL_BY_ID, weights);
  return { cost, util };
}

export interface BenefitUtilityCostChartProps {
  developerBudget: number | null;
  highlightBenefitIds: string[];
  /** When set, utility uses water/waste/air weight table from these allocations (dollars only for lookup). */
  leverAllocations?: LeverAllocations | null;
  className?: string;
  title?: string;
}

export const BenefitUtilityCostChart: React.FC<BenefitUtilityCostChartProps> = ({
  developerBudget,
  highlightBenefitIds,
  leverAllocations = null,
  className = '',
  title = 'Community Benefit Options Analysis',
}) => {
  const weights = useMemo(
    () =>
      getLeverWeightsForAllocations(
        leverAllocations?.allocWater,
        leverAllocations?.allocWaste,
        leverAllocations?.allocAir
      ),
    [leverAllocations?.allocWater, leverAllocations?.allocWaste, leverAllocations?.allocAir]
  );

  const choice = useMemo(
    () =>
      highlightBenefitIds.length > 0
        ? calculateBenefitBundleMetrics(highlightBenefitIds, leverAllocations)
        : null,
    [highlightBenefitIds, leverAllocations]
  );

  const hasLeverAllocations = leverAllocations != null;

  const chartData = useMemo(() => {
    const rows = generateBundleChartRows(weights, true);
    const utilitiesForRank = rows
      .filter(r => r.benefitIds.length > 0)
      .map(r => r.utility)
      .sort((a, b) => a - b);
    return rows.map(item => {
      const isMatch = choice ? sameBenefitSet(item.benefitIds, highlightBenefitIds) : false;
      return {
        ...item,
        isMatch,
        ...bundleMarkStyle(item.cost, item.benefitIds, developerBudget),
        tooltipLines: buildBundleTooltipLines(
          item.benefitIds,
          item.utility,
          item.cost,
          weights,
          hasLeverAllocations,
          percentileBand(item.utility, utilitiesForRank, item.benefitIds),
          isMatch
        ),
      };
    });
  }, [weights, choice, highlightBenefitIds, hasLeverAllocations, developerBudget]);

  return (
    <div
      className={clsx(
        'w-full min-h-[240px] bg-gray-50 rounded-xl border p-3 relative shrink-0 flex flex-col',
        className
      )}
    >
      <h3 className="text-sm font-bold text-gray-700 mb-1 text-center shrink-0">{title}</h3>
      <p className="text-[10px] text-gray-600 text-center mb-1 shrink-0 leading-snug px-1">
        Each dot is one benefit bundle. <strong>Utility</strong> sums each benefit&apos;s base score
        (research 0.33 → park 0.07) times an environmental weight (water, waste, or air).
        {hasLeverAllocations
          ? ` Weights follow mitigation spend (water ×${weights.water.toFixed(2)}, waste ×${weights.waste.toFixed(2)}, air ×${weights.air.toFixed(2)}).`
          : ' On Admin, weights are 1.0.'}{' '}
        <strong>Cost</strong> is the sum of benefit price tags. Hover a dot for the calculation.
      </p>
      <p className="text-[9px] text-gray-500 text-center mb-1 shrink-0">
        Solid dots are bundles the developer&apos;s budget covers; faded dots cost more than the
        budget. The orange line is the budget. Black ring = the community&apos;s current selection.
      </p>
      <ResponsiveContainer width="100%" height="85%">
        <ScatterChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="cost"
            name="Cost"
            unit="$"
            tickFormatter={val => `$${(val / 1000000).toFixed(1)}M`}
            domain={[0, 20000000]}
          >
            <Label value="Community benefit cost ($)" offset={-8} position="insideBottom" />
          </XAxis>
          <YAxis type="number" dataKey="utility" name="Utility" domain={[0, 'auto']}>
            <Label value="Weighted utility" angle={-90} position="insideLeft" />
          </YAxis>
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload as (typeof chartData)[0];
                return (
                  <div className="bg-white p-2.5 border rounded-lg shadow-lg text-xs max-w-[280px]">
                    <p className="font-bold text-gray-900 mb-1.5">{data.label}</p>
                    {data.tooltipLines.map((line, i) => (
                      <p key={i} className="text-gray-700 leading-snug mb-1 last:mb-0">
                        {line}
                      </p>
                    ))}
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend />
          <Scatter name="Benefit bundles" data={chartData} fill={MARK_BLUE}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.fill}
                fillOpacity={entry.fillOpacity}
                stroke={entry.isMatch ? '#0b0b0b' : 'none'}
                strokeWidth={entry.isMatch ? 2.5 : 0}
              />
            ))}
          </Scatter>
          {developerBudget != null && developerBudget > 0 && (
            <ReferenceLine
              x={developerBudget}
              stroke="#eb6834"
              strokeWidth={2}
              strokeDasharray="4 3"
              label={{
                position: 'top',
                value: "Developer's budget",
                fill: '#b84c21',
                fontSize: 11,
                fontWeight: 600,
              }}
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};
