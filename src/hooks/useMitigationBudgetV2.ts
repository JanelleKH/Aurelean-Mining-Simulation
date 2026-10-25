import { useState, useCallback, useMemo } from 'react';
import { canoeAvailability, COMMUNITY_BENEFITS } from '../data/communityBenefits';
import { serializeIndustrialPlacements, serializeBenefitPlacements } from '../data/mapOverlap';
import {
  formatFacilityPlacementSummary,
  validateIndustrialPlacements,
} from '../data/industrialPlacementRules';
import { computeFacilitySpreadPenalty } from '../data/facilitySpreadPenalty';
import { escapeCsvField } from '../utils/csvParse';
import type { PlacedIndustrialSymbol } from '../components/map/mapSymbols';
import type { SelectableNoBuildId } from '../data/noBuildAreas';
import {
  MINE_SIZES,
  CAPACITIES,
  AIR_TIERS,
  AIR_BUDGET_MULTIPLIER,
  airAssuranceUsd,
  MITIGATION_SPEND_MIN_USD,
  MITIGATION_STEP_USD,
  WATER_SPEND_MAX_USD,
  WASTE_SPEND_MAX_USD,
  AIR_SPEND_MAX_USD,
  BASELINE_WATER_WASTE_MITIGATION_USD,
  ALPHA_W,
  ALPHA_S,
  K_W,
  K_S,
  clampMitigationLeverSpend,
  clampAirSpend,
  airTierForBudgetAdd,
  finalForAlloc,
  waterSpendForCapacityIndex,
  wasteSpendForMineIndex,
  computeTotalBudget,
  scenarioDiscretionaryPoolUsd,
  type AirTierId,
  type MineSize,
  type Capacity,
} from '../data/mitigationConstants';

const clampWaterTargetStep = (value: number) => Math.round(value / 10_000) * 10_000;
const clampWasteTargetStep = (value: number) => Math.round(value / 50_000) * 50_000;

/** Wizard workflow after scenario lock. */
export type WorkflowPhase = 'scenario' | 'siting' | 'mitigation' | 'benefits';

export const WORKFLOW_PHASE_LABELS: Record<WorkflowPhase, string> = {
  scenario: 'Step 1: Choose scenario',
  siting: 'Step 2: Site facilities',
  mitigation: 'Step 3: Allocate mitigation',
  benefits: 'Step 4: Community benefits',
};

export interface JointExportExtras {
  noBuildZoneIds?: SelectableNoBuildId[];
  benefitPlacements?: Partial<Record<string, { xPct: number; yPct: number }>>;
  downloadFilename?: string;
}

export interface UseMitigationBudgetV2Options {
  selectedBenefits: string[];
  onToggleBenefit: (id: string) => void;
  onScenarioUnlock?: () => void;
  placedIndustrial?: PlacedIndustrialSymbol[];
}

export function useMitigationBudgetV2({
  selectedBenefits,
  onToggleBenefit,
  onScenarioUnlock,
  placedIndustrial = [],
}: UseMitigationBudgetV2Options) {
  const [scenarioLocked, setScenarioLocked] = useState(false);
  const [phase, setPhase] = useState<WorkflowPhase>('scenario');
  const [lockedTotalBudget, setLockedTotalBudget] = useState<number | null>(null);
  const [selectedSize, setSelectedSize] = useState<MineSize>(MINE_SIZES[0]);
  const [selectedCapacity, setSelectedCapacity] = useState<Capacity>(CAPACITIES[0]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<AirTierId>('extraction');

  const [allocWater, setAllocWater] = useState(MITIGATION_SPEND_MIN_USD);
  const [allocWaste, setAllocWaste] = useState(MITIGATION_SPEND_MIN_USD);
  const [allocAir, setAllocAir] = useState(0);
  const [lockedWaterFloor, setLockedWaterFloor] = useState(MITIGATION_SPEND_MIN_USD);
  const [lockedWasteFloor, setLockedWasteFloor] = useState(MITIGATION_SPEND_MIN_USD);
  const [lockedAirFloor, setLockedAirFloor] = useState(0);

  const [targetWaterM3, setTargetWaterM3] = useState(() => {
    const W0 = CAPACITIES[0].water;
    const Wmin = ALPHA_W * W0;
    return clampWaterTargetStep(
      Wmin + (W0 - Wmin) * Math.exp(-K_W * (MITIGATION_SPEND_MIN_USD / 1_000_000))
    );
  });
  const [targetWasteTon, setTargetWasteTon] = useState(() => {
    const S0 = MINE_SIZES[0].waste;
    const Smin = ALPHA_S * S0;
    return clampWasteTargetStep(
      Smin + (S0 - Smin) * Math.exp(-K_S * (MITIGATION_SPEND_MIN_USD / 1_000_000))
    );
  });

  const [waterClamped, setWaterClamped] = useState(false);
  const [wasteClamped, setWasteClamped] = useState(false);
  const [airClamped, setAirClamped] = useState(false);

  const mineStepIndex = Math.max(0, MINE_SIZES.findIndex(s => s.value === selectedSize.value));
  const capacityStepIndex = Math.max(0, CAPACITIES.findIndex(c => c.value === selectedCapacity.value));
  const selectedFacility = airTierForBudgetAdd(allocAir);
  const baseScenarioBudget = mineStepIndex * MITIGATION_STEP_USD + capacityStepIndex * MITIGATION_STEP_USD;
  const discretionaryPoolUsd = scenarioDiscretionaryPoolUsd(mineStepIndex, capacityStepIndex);

  const liveTotalBudget = computeTotalBudget(mineStepIndex, capacityStepIndex, allocAir);
  const totalBudget =
    scenarioLocked && lockedTotalBudget !== null ? lockedTotalBudget : liveTotalBudget;

  const communitySpend = useMemo(
    () =>
      scenarioLocked
        ? selectedBenefits.reduce((sum, id) => {
            const benefit = COMMUNITY_BENEFITS.find(b => b.id === id);
            return sum + (benefit ? benefit.cost : 0);
          }, 0)
        : 0,
    [scenarioLocked, selectedBenefits]
  );

  const industrialScenario = useMemo(
    () => ({
      mineSizeKm2: selectedSize.value,
      capacityMton: selectedCapacity.value,
      facilityTier: selectedFacilityId,
    }),
    [selectedSize, selectedCapacity, selectedFacilityId]
  );

  const sitingValidation = useMemo(
    () => validateIndustrialPlacements(placedIndustrial, industrialScenario),
    [placedIndustrial, industrialScenario]
  );

  const sitingSummary = useMemo(
    () => formatFacilityPlacementSummary(placedIndustrial, industrialScenario),
    [placedIndustrial, industrialScenario]
  );

  const canContinueFromSiting = scenarioLocked && phase === 'siting' && sitingValidation.ok;

  // Air costs the equipment plus the assurance that it will be operated.
  // Without this the tier's budget addition and its spend cancelled exactly,
  // and air mitigation was free.
  const airAssurance = airAssuranceUsd(allocAir);
  const totalAllocated = allocWater + allocWaste + allocAir + airAssurance + communitySpend;
  const grossUnassigned = totalBudget - totalAllocated;

  const { avgChainSpreadPct, spreadPenaltyPct, sitingPenaltyUsd } = useMemo(
    () => computeFacilitySpreadPenalty(placedIndustrial, grossUnassigned, scenarioLocked),
    [placedIndustrial, grossUnassigned, scenarioLocked]
  );

  const unassignedBudget = grossUnassigned - sitingPenaltyUsd;
  const budgetOverrun = grossUnassigned < sitingPenaltyUsd || totalAllocated > totalBudget;

  const W0 = selectedCapacity.water;
  const Wmin = ALPHA_W * W0;
  const W_final = Wmin + (W0 - Wmin) * Math.exp(-K_W * (allocWater / 1_000_000));
  const waterReduction = ((W0 - W_final) / W0) * 100;

  const S0 = selectedSize.waste;
  const Smin = ALPHA_S * S0;
  const S_final = Smin + (S0 - Smin) * Math.exp(-K_S * (allocWaste / 1_000_000));
  const wasteReduction = ((S0 - S_final) / S0) * 100;

  const maxWaterSpendAffordable = Math.max(
    0,
    totalBudget - allocWaste - allocAir - airAssurance - communitySpend - sitingPenaltyUsd
  );
  const maxWasteSpendAffordable = Math.max(
    0,
    totalBudget - allocWater - allocAir - airAssurance - communitySpend - sitingPenaltyUsd
  );
  // Divided by the multiplier because each dollar allocated to air also draws
  // its assurance from the same budget.
  const maxAirSpendAffordable = Math.max(
    0,
    (totalBudget - allocWater - allocWaste - communitySpend - sitingPenaltyUsd) /
      AIR_BUDGET_MULTIPLIER
  );

  const syncWaterOutcome = useCallback(
    (waterUsd: number, capacity: Capacity) => {
      const w0 = capacity.water;
      const wmin = ALPHA_W * w0;
      setTargetWaterM3(
        clampWaterTargetStep(
          wmin + (w0 - wmin) * Math.exp(-K_W * (waterUsd / 1_000_000))
        )
      );
    },
    []
  );

  const syncWasteOutcome = useCallback((wasteUsd: number, size: MineSize) => {
    const s0 = size.waste;
    const smin = ALPHA_S * s0;
    setTargetWasteTon(
      clampWasteTargetStep(smin + (s0 - smin) * Math.exp(-K_S * (wasteUsd / 1_000_000)))
    );
  }, []);

  const setAirFromBudgetAdd = (budgetAdd: number) => {
    const tier = airTierForBudgetAdd(budgetAdd);
    setAllocAir(tier.budgetAdd);
    setSelectedFacilityId(tier.id);
  };

  const handleCapacityChange = (capacityValue: number) => {
    if (scenarioLocked) return;
    const cap = CAPACITIES.find(c => c.value === capacityValue);
    if (!cap) return;
    const capacityIdx = Math.max(0, CAPACITIES.findIndex(c => c.value === cap.value));
    const desiredWater = waterSpendForCapacityIndex(capacityIdx);
    setSelectedCapacity(cap);
    setAllocWater(desiredWater);
    syncWaterOutcome(desiredWater, cap);
    setWaterClamped(false);
  };

  const handleSizeChange = (sizeValue: number) => {
    if (scenarioLocked) return;
    const size = MINE_SIZES.find(s => s.value === sizeValue);
    if (!size) return;
    const mineIdx = Math.max(0, MINE_SIZES.findIndex(s => s.value === size.value));
    const desiredWaste = wasteSpendForMineIndex(mineIdx);
    setSelectedSize(size);
    setAllocWaste(desiredWaste);
    syncWasteOutcome(desiredWaste, size);
    setWasteClamped(false);
  };

  const handleFacilityChange = (nextId: AirTierId) => {
    if (scenarioLocked) return;
    const tier = AIR_TIERS.find(t => t.id === nextId) ?? AIR_TIERS[0];
    setAirFromBudgetAdd(tier.budgetAdd);
  };

  const lockScenario = () => {
    const frozenTotal = computeTotalBudget(mineStepIndex, capacityStepIndex, allocAir);
    setLockedTotalBudget(frozenTotal);
    setLockedWaterFloor(allocWater);
    setLockedWasteFloor(allocWaste);
    setLockedAirFloor(allocAir);
    setScenarioLocked(true);
    setPhase('siting');
    setWaterClamped(false);
    setWasteClamped(false);
    setAirClamped(false);
  };

  const unlockScenario = () => {
    if (
      !window.confirm(
        'Unlock scenario? Facility placements, mitigation allocations, and community benefits will be reset.'
      )
    ) {
      return;
    }
    setScenarioLocked(false);
    setLockedTotalBudget(null);
    setPhase('scenario');
    onScenarioUnlock?.();
    setWaterClamped(false);
    setWasteClamped(false);
    setAirClamped(false);
  };

  const continueFromSiting = () => {
    if (!canContinueFromSiting) return;
    setPhase('mitigation');
  };

  const continueFromMitigation = () => {
    if (phase !== 'mitigation') return;
    setPhase('benefits');
  };

  const backFromMitigation = () => {
    if (phase !== 'mitigation') return;
    setPhase('siting');
  };

  const backFromBenefits = () => {
    if (phase !== 'benefits') return;
    setPhase('mitigation');
  };

  const applyWaterTarget = (desiredAllocUsd: number) => {
    if (phase !== 'mitigation') return;
    const raw = Number.isFinite(desiredAllocUsd) ? desiredAllocUsd : lockedWaterFloor;
    const raised = Math.max(raw, lockedWaterFloor);
    const clamped = Math.min(raised, WATER_SPEND_MAX_USD, maxWaterSpendAffordable);
    const allocCap = clampMitigationLeverSpend(clamped, maxWaterSpendAffordable, WATER_SPEND_MAX_USD);
    const finalAlloc = Math.max(allocCap, lockedWaterFloor);
    setAllocWater(finalAlloc);
    setTargetWaterM3(
      clampWaterTargetStep(finalForAlloc({ baseline: W0, min: Wmin, k: K_W, alloc: finalAlloc }))
    );
    setWaterClamped(raised > maxWaterSpendAffordable || finalAlloc < raised);
  };

  const applyWasteTarget = (desiredAllocUsd: number) => {
    if (phase !== 'mitigation') return;
    const raw = Number.isFinite(desiredAllocUsd) ? desiredAllocUsd : lockedWasteFloor;
    const raised = Math.max(raw, lockedWasteFloor);
    const clamped = Math.min(raised, WASTE_SPEND_MAX_USD, maxWasteSpendAffordable);
    const allocCap = clampMitigationLeverSpend(clamped, maxWasteSpendAffordable, WASTE_SPEND_MAX_USD);
    const finalAlloc = Math.max(allocCap, lockedWasteFloor);
    setAllocWaste(finalAlloc);
    setTargetWasteTon(
      clampWasteTargetStep(finalForAlloc({ baseline: S0, min: Smin, k: K_S, alloc: finalAlloc }))
    );
    setWasteClamped(raised > maxWasteSpendAffordable || finalAlloc < raised);
  };

  const applyAirTarget = (desiredAllocUsd: number) => {
    if (phase !== 'mitigation') return;
    const raw = Number.isFinite(desiredAllocUsd) ? desiredAllocUsd : lockedAirFloor;
    const raised = Math.max(raw, lockedAirFloor);
    const finalAlloc = clampAirSpend(raised, maxAirSpendAffordable);
    const tier = airTierForBudgetAdd(finalAlloc);
    setAllocAir(finalAlloc);
    setSelectedFacilityId(tier.id);
    setAirClamped(raised > maxAirSpendAffordable || finalAlloc < raised);
  };

  const handleToggleBenefit = (id: string) => {
    if (phase !== 'benefits') return;
    const benefit = COMMUNITY_BENEFITS.find(b => b.id === id);
    if (!benefit) return;
    if (selectedBenefits.includes(id)) {
      onToggleBenefit(id);
      return;
    }
    // Physical precondition before price. The canoe is the only benefit that
    // can be impossible rather than merely unaffordable.
    if (id === 'canoe') {
      const avail = canoeAvailability({
        mineSizeKm2: selectedSize.value,
        capacityTPerYr: selectedCapacity.value,
      });
      if (!avail.deliverable) {
        alert(avail.reason ?? 'The canoe cannot be delivered at this mine size.');
        return;
      }
    }
    if (unassignedBudget >= benefit.cost) {
      onToggleBenefit(id);
    } else {
      alert(
        'Not enough unassigned budget. Reduce water, waste, or air mitigation spend, or unlock scenario to change mine/capacity/facility.'
      );
    }
  };

  const handleDownloadCSV = (jointExtras?: JointExportExtras) => {
    if (phase !== 'benefits') {
      alert('Complete all steps (scenario → siting → mitigation → benefits) before exporting.');
      return;
    }
    if (placedIndustrial.length > 0) {
      const placementCheck = validateIndustrialPlacements(placedIndustrial, {
        mineSizeKm2: selectedSize.value,
        capacityMton: selectedCapacity.value,
        facilityTier: selectedFacilityId,
      });
      if (!placementCheck.ok) {
        alert(
          `Facility siting does not match scenario rules:\n\n${placementCheck.messages.join('\n')}`
        );
        return;
      }
    }
    const benefitIdsStr = selectedBenefits.join('|');
    const tier = selectedFacility;
    const industrialStr = escapeCsvField(serializeIndustrialPlacements(placedIndustrial));
    const baseRow = `${selectedSize.value},${selectedCapacity.value},${totalBudget},${allocWater},${allocWaste},${allocAir},${communitySpend},${W_final.toFixed(0)},${S_final.toFixed(0)},${benefitIdsStr},${industrialStr},1,${tier.id},${allocAir},,${allocAir},${scenarioLocked ? 1 : 0},${avgChainSpreadPct.toFixed(2)},${spreadPenaltyPct.toFixed(2)},${Math.round(sitingPenaltyUsd)}`;
    const baseHeader =
      'size_km2,capacity_mton,total_budget,water_alloc,waste_alloc,air_alloc,community_alloc,final_water_m3,final_waste_ton,selected_benefits,industrial_placements,air_quality_enabled,air_process,air_quality_aqi,air_aqi_range,air_budget_add,scenario_locked,facility_spread_pct,siting_penalty_pct,siting_penalty_usd';
    let csvContent: string;
    let filename = 'mining_simulation_results.csv';
    if (jointExtras) {
      const noBuildStr =
        jointExtras.noBuildZoneIds && jointExtras.noBuildZoneIds.length > 0
          ? jointExtras.noBuildZoneIds.join('|')
          : 'none';
      const benefitPlacementStr = escapeCsvField(
        serializeBenefitPlacements(jointExtras.benefitPlacements ?? {})
      );
      csvContent = `${baseHeader},no_build_zones,benefit_placements\n${baseRow},${noBuildStr},${benefitPlacementStr}`;
      filename = jointExtras.downloadFilename ?? 'joint_negotiation_results.csv';
    } else {
      csvContent = `${baseHeader}\n${baseRow}`;
    }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return {
    phase,
    scenarioLocked,
    // Exposed so the ledger panel can compute air, which depends on WHERE the
    // facilities are, not only on what is spent. Water and waste do not need it.
    placedIndustrial,
    selectedSize,
    selectedCapacity,
    selectedFacility,
    selectedFacilityId,
    industrialScenario,
    sitingValidation,
    sitingSummary,
    canContinueFromSiting,
    allocWater,
    allocWaste,
    allocAir,
    lockedWaterFloor,
    lockedWasteFloor,
    lockedAirFloor,
    targetWaterM3,
    targetWasteTon,
    waterClamped,
    wasteClamped,
    airClamped,
    mineStepIndex,
    capacityStepIndex,
    baseScenarioBudget,
    discretionaryPoolUsd,
    totalBudget,
    communitySpend,
    airAssurance,
    unassignedBudget,
    budgetOverrun,
    avgChainSpreadPct,
    spreadPenaltyPct,
    sitingPenaltyUsd,
    waterReduction,
    wasteReduction,
    handleSizeChange,
    handleCapacityChange,
    handleFacilityChange,
    lockScenario,
    unlockScenario,
    continueFromSiting,
    continueFromMitigation,
    backFromMitigation,
    backFromBenefits,
    applyWaterTarget,
    applyWasteTarget,
    applyAirTarget,
    handleToggleBenefit,
    handleDownloadCSV,
    BASELINE_WATER_WASTE_MITIGATION_USD,
    MITIGATION_SPEND_MIN_USD,
    MITIGATION_STEP_USD,
    WATER_SPEND_MAX_USD,
    WASTE_SPEND_MAX_USD,
    AIR_SPEND_MAX_USD,
  };
}
