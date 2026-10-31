import React, { useEffect } from 'react';
import { useMitigationBudgetV2, type JointExportExtras } from '../hooks/useMitigationBudgetV2';
import type { MineSize, Capacity, AirTierId } from '../data/mitigationConstants';
import type { PlacedIndustrialSymbol } from './map/mapSymbols';
import {
  ScenarioHeader,
  ScenarioDropdowns,
  ScenarioLockControls,
  PhaseNavControls,
  StepGuide,
  BudgetSummaryCard,
  MitigationSlidersSection,
  LedgerSection,
  CommunityBenefitsSection,
  ExportResultsButton,
} from './MitigationBudgetSections';

export interface MitigationBudgetControlsProps {
  selectedBenefits: string[];
  onToggleBenefit: (id: string) => void;
  onScenarioUnlock?: () => void;
  placedIndustrial?: PlacedIndustrialSymbol[];
  onMetricsChange?: (m: {
    totalBudget: number;
    selectedBenefits: string[];
    unassignedBudget: number;
    allocWater: number;
    allocWaste: number;
    allocAir: number;
    avgChainSpreadPct: number;
    spreadPenaltyPct: number;
    sitingPenaltyUsd: number;
  }) => void;
  onScenarioStateChange?: (s: {
    selectedSize: MineSize;
    selectedCapacity: Capacity;
    selectedFacilityId: AirTierId;
    scenarioLocked: boolean;
    phase: ReturnType<typeof useMitigationBudgetV2>['phase'];
  }) => void;
  showSubmitButton?: boolean;
  onRegisterExport?: (exportFn: (jointExtras?: JointExportExtras) => void) => void;
}

/** Full stacked controls (Joint). DeveloperView composes sections directly. */
export const MitigationBudgetControls: React.FC<MitigationBudgetControlsProps> = ({
  selectedBenefits,
  onToggleBenefit,
  onScenarioUnlock,
  onMetricsChange,
  onScenarioStateChange,
  showSubmitButton = true,
  placedIndustrial = [],
  onRegisterExport,
}) => {
  const b = useMitigationBudgetV2({
    selectedBenefits,
    onToggleBenefit,
    onScenarioUnlock,
    placedIndustrial,
  });

  useEffect(() => {
    onMetricsChange?.({
      totalBudget: b.totalBudget,
      selectedBenefits,
      unassignedBudget: b.unassignedBudget,
      allocWater: b.allocWater,
      allocWaste: b.allocWaste,
      allocAir: b.allocAir,
      avgChainSpreadPct: b.avgChainSpreadPct,
      spreadPenaltyPct: b.spreadPenaltyPct,
      sitingPenaltyUsd: b.sitingPenaltyUsd,
    });
  }, [
    b.totalBudget,
    b.unassignedBudget,
    b.allocWater,
    b.allocWaste,
    b.allocAir,
    b.avgChainSpreadPct,
    b.spreadPenaltyPct,
    b.sitingPenaltyUsd,
    selectedBenefits,
    onMetricsChange,
  ]);

  useEffect(() => {
    onScenarioStateChange?.({
      selectedSize: b.selectedSize,
      selectedCapacity: b.selectedCapacity,
      selectedFacilityId: b.selectedFacilityId,
      scenarioLocked: b.scenarioLocked,
      phase: b.phase,
    });
  }, [
    b.selectedSize,
    b.selectedCapacity,
    b.selectedFacilityId,
    b.scenarioLocked,
    b.phase,
    onScenarioStateChange,
  ]);

  useEffect(() => {
    onRegisterExport?.(b.handleDownloadCSV);
  }, [b.handleDownloadCSV, onRegisterExport]);

  return (
    <>
      <StepGuide b={b} />
      <ScenarioHeader b={b} />
      <ScenarioDropdowns b={b} />
      <ScenarioLockControls b={b} />
      {/*
        The step navigation has to be repeated here. ScenarioLockControls used
        to carry back/continue for every phase; when those moved out so they
        could sit beside the panels they advance to (beta item 25), this
        stacked Joint layout was left with a lock button and no way forward.
        Each nav sits under the section it governs, same as in DeveloperView.
      */}
      <PhaseNavControls b={b} scope="siting" />
      <BudgetSummaryCard b={b} />
      <MitigationSlidersSection b={b} />
      <LedgerSection b={b} benefitIds={selectedBenefits} />
      <PhaseNavControls b={b} scope="mitigation" />
      <CommunityBenefitsSection b={b} selectedBenefits={selectedBenefits} />
      <PhaseNavControls b={b} scope="benefits" />
      {showSubmitButton && <ExportResultsButton b={b} />}
    </>
  );
};
