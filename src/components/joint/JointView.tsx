import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { Download } from 'lucide-react';
import {
  JointNoBuildToolbar,
  type NoBuildAreaId,
  type SelectableNoBuildId,
} from './JointNoBuildSection';
import { DraggableRegionalMap } from '../map/DraggableRegionalMap';
import type { BenefitPlacement } from '../map/DraggableRegionalMap';
import { BenefitUtilityCostChart, type LeverAllocations } from '../BenefitUtilityCostChart';
import { JointDeveloperPanel } from './JointDeveloperPanel';
import { getCommunityBenefit, type CommunityBenefitId, canoeAvailability } from '../../data/communityBenefits';
import {
  getMaxNoBuildZonesForMineSizeKm2,
  canToggleNoBuildZone,
} from '../../data/noBuildAreas';
import type { JointExportExtras, WorkflowPhase } from '../../hooks/useMitigationBudgetV2';
import type { MineSize, Capacity, AirTierId } from '../../data/mitigationConstants';
import type { PlacedIndustrialSymbol } from '../map/mapSymbols';

function fireSubmitCelebration() {
  const duration = 2500;
  const end = Date.now() + duration;
  const frame = () => {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
  confetti({
    particleCount: 120,
    spread: 90,
    origin: { y: 0.55 },
  });
}

/**
 * Joint negotiation: no-build toolbar, utility chart (left) + draggable regional map (right), developer controls below.
 */
export const JointView: React.FC = () => {
  const [chartBudget, setChartBudget] = useState<number | null>(null);
  const [chartBenefits, setChartBenefits] = useState<string[]>([]);
  const [unassignedBudget, setUnassignedBudget] = useState(0);
  const [leverAllocations, setLeverAllocations] = useState<LeverAllocations | null>(null);
  const [selectedNoBuildIds, setSelectedNoBuildIds] = useState<SelectableNoBuildId[]>([]);
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>([]);
  const [benefitPlacements, setBenefitPlacements] = useState<
    Partial<Record<CommunityBenefitId, BenefitPlacement>>
  >({});
  const [placedIndustrial, setPlacedIndustrial] = useState<PlacedIndustrialSymbol[]>([]);
  const [selectedSize, setSelectedSize] = useState<MineSize | null>(null);
  const [selectedCapacity, setSelectedCapacity] = useState<Capacity | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<AirTierId | null>(null);
  const [scenarioLocked, setScenarioLocked] = useState(false);
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>('scenario');
  const [avgChainSpreadPct, setAvgChainSpreadPct] = useState(0);
  const [spreadPenaltyPct, setSpreadPenaltyPct] = useState(0);

  const industrialScenario = useMemo(() => {
    if (!selectedSize || !selectedCapacity || !selectedFacilityId) return null;
    return {
      mineSizeKm2: selectedSize.value,
      capacityMton: selectedCapacity.value,
      facilityTier: selectedFacilityId,
    };
  }, [selectedSize, selectedCapacity, selectedFacilityId]);

  const exportFnRef = useRef<((jointExtras?: JointExportExtras) => void) | null>(null);

  const maxNoBuildZones = selectedSize
    ? getMaxNoBuildZonesForMineSizeKm2(selectedSize.value)
    : 4;

  const prevSizeRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedSize === null) return;
    if (prevSizeRef.current !== null && prevSizeRef.current !== selectedSize.value) {
      setSelectedNoBuildIds([]);
    }
    prevSizeRef.current = selectedSize.value;
  }, [selectedSize]);

  const handleMetricsChange = useCallback(
    (m: {
      totalBudget: number;
      selectedBenefits: string[];
      unassignedBudget: number;
      allocWater: number;
      allocWaste: number;
      allocAir: number;
      avgChainSpreadPct: number;
      spreadPenaltyPct: number;
      sitingPenaltyUsd: number;
    }) => {
      setChartBudget(m.totalBudget);
      setChartBenefits(m.selectedBenefits);
      setUnassignedBudget(m.unassignedBudget);
      setAvgChainSpreadPct(m.avgChainSpreadPct);
      setSpreadPenaltyPct(m.spreadPenaltyPct);
      setLeverAllocations({
        allocWater: m.allocWater,
        allocWaste: m.allocWaste,
        allocAir: m.allocAir,
      });
    },
    []
  );

  const handleScenarioStateChange = useCallback(
    (s: {
      selectedSize: MineSize;
      selectedCapacity: Capacity;
      selectedFacilityId: AirTierId;
      scenarioLocked: boolean;
      phase: WorkflowPhase;
    }) => {
      setSelectedSize(s.selectedSize);
      setSelectedCapacity(s.selectedCapacity);
      setSelectedFacilityId(s.selectedFacilityId);
      setScenarioLocked(s.scenarioLocked);
      setWorkflowPhase(s.phase);
    },
    []
  );

  const handleRegisterExport = useCallback((exportFn: (jointExtras?: JointExportExtras) => void) => {
    exportFnRef.current = exportFn;
  }, []);

  const handleJointSubmit = useCallback(() => {
    if (!exportFnRef.current) return;
    exportFnRef.current({
      noBuildZoneIds: selectedNoBuildIds,
      benefitPlacements,
    });
    fireSubmitCelebration();
  }, [selectedNoBuildIds, benefitPlacements]);

  const toggleBenefit = useCallback(
    (id: string) => {
      const benefit = getCommunityBenefit(id);
      if (!benefit) return;
      if (selectedBenefits.includes(id)) {
        setSelectedBenefits(prev => prev.filter(b => b !== id));
        setBenefitPlacements(prev => {
          const next = { ...prev };
          delete next[benefit.id];
          return next;
        });
      } else {
        // Physical precondition before price, same rule as the developer flow.
        if (id === 'canoe' && selectedSize && selectedCapacity) {
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
          setSelectedBenefits(prev => [...prev, id]);
        } else {
          alert(
            'Not enough unassigned budget. Reduce water or waste spend, or unlock scenario to change mine/capacity/facility.'
          );
        }
      }
    },
    [selectedBenefits, unassignedBudget, selectedSize, selectedCapacity]
  );

  const handleBenefitPlace = useCallback(
    (id: CommunityBenefitId, xPct: number, yPct: number) => {
      if (workflowPhase !== 'benefits') return;
      const benefit = getCommunityBenefit(id);
      if (!benefit) return;
      if (!selectedBenefits.includes(id)) {
        if (id === 'canoe' && selectedSize && selectedCapacity) {
          const avail = canoeAvailability({
            mineSizeKm2: selectedSize.value,
            capacityTPerYr: selectedCapacity.value,
          });
          if (!avail.deliverable) {
            alert(avail.reason ?? 'The canoe cannot be delivered at this mine size.');
            return;
          }
        }
        if (unassignedBudget < benefit.cost) {
          alert(
            'Not enough unassigned budget. Reduce water or waste spend, or unlock scenario to change mine/capacity/facility.'
          );
          return;
        }
        setSelectedBenefits(prev => [...prev, id]);
      }
      setBenefitPlacements(prev => ({ ...prev, [id]: { xPct, yPct } }));
    },
    [selectedBenefits, unassignedBudget, workflowPhase, selectedSize, selectedCapacity]
  );

  const handleBenefitRemove = useCallback((id: CommunityBenefitId) => {
    setSelectedBenefits(prev => prev.filter(b => b !== id));
    setBenefitPlacements(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleScenarioUnlock = useCallback(() => {
    setSelectedBenefits([]);
    setBenefitPlacements({});
    setPlacedIndustrial([]);
  }, []);

  const toggleNoBuildArea = useCallback(
    (id: NoBuildAreaId) => {
      if (id === 'none') {
        setSelectedNoBuildIds([]);
        return;
      }
      if (maxNoBuildZones <= 0) {
        alert('This mine size does not allow no-go zones.');
        return;
      }
      const adding = !selectedNoBuildIds.includes(id as SelectableNoBuildId);
      const check = canToggleNoBuildZone(
        selectedNoBuildIds,
        id as SelectableNoBuildId,
        adding,
        maxNoBuildZones
      );
      if (!check.ok) {
        alert(check.message);
        return;
      }
      setSelectedNoBuildIds(prev =>
        prev.includes(id as SelectableNoBuildId)
          ? prev.filter(x => x !== id)
          : [...prev, id as SelectableNoBuildId]
      );
    },
    [selectedNoBuildIds, maxNoBuildZones]
  );

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto overflow-x-hidden text-gray-900">
      <p className="text-[11px] text-gray-600 px-1 shrink-0">
        Joint workspace: lock scenario → site facilities → allocate mitigation → select benefits.
        Chart stays on the left; map on the right; technical controls below.
      </p>

      <JointNoBuildToolbar
        selectedNoBuildIds={selectedNoBuildIds}
        onToggle={toggleNoBuildArea}
        maxNoBuildZones={maxNoBuildZones}
        mineSizeLabel={selectedSize?.label}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch flex-1 min-h-[360px]">
        <div className="flex flex-col min-h-[320px] lg:min-h-[min(72vh,640px)]">
          <BenefitUtilityCostChart
            developerBudget={chartBudget}
            highlightBenefitIds={chartBenefits}
            leverAllocations={leverAllocations}
            title="Utility vs cost (funded community benefits)"
            className="h-full min-h-[320px] flex-1"
          />
        </div>
        <div className="flex flex-col min-h-[320px]">
          <DraggableRegionalMap
            selectedNoBuildIds={selectedNoBuildIds}
            selectedBenefits={selectedBenefits}
            benefitPlacements={benefitPlacements}
            unassignedBudget={unassignedBudget}
            placedIndustrial={placedIndustrial}
            onPlacedIndustrialChange={setPlacedIndustrial}
            onBenefitPlace={handleBenefitPlace}
            onBenefitRemove={handleBenefitRemove}
            industrialScenario={industrialScenario}
            scenarioLocked={scenarioLocked}
            workflowPhase={workflowPhase}
            avgChainSpreadPct={avgChainSpreadPct}
            spreadPenaltyPct={spreadPenaltyPct}
          />
        </div>
      </div>

      <div className="min-h-[320px] shrink-0 flex flex-col gap-3">
        <JointDeveloperPanel
          selectedBenefits={selectedBenefits}
          onToggleBenefit={toggleBenefit}
          onScenarioUnlock={handleScenarioUnlock}
          placedIndustrial={placedIndustrial}
          onMetricsChange={handleMetricsChange}
          onScenarioStateChange={handleScenarioStateChange}
          onRegisterExport={handleRegisterExport}
        />
        <button
          type="button"
          onClick={handleJointSubmit}
          disabled={workflowPhase !== 'benefits'}
          className="shrink-0 bg-gray-900 text-white px-4 py-3 rounded-lg font-bold shadow hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
        >
          <Download size={16} />
          Submit Negotiation
        </button>
      </div>
    </div>
  );
};
