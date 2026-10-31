import React, { useState, useCallback, useMemo } from 'react';
import { DraggableRegionalMap } from './map/DraggableRegionalMap';
import { AirAtSiting, airReadingsForSiting } from './AirAtSiting';
import type { PlacedIndustrialSymbol } from './map/mapSymbols';
import { MapPin } from 'lucide-react';
import { useMitigationBudgetV2 } from '../hooks/useMitigationBudgetV2';
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

export const DeveloperView: React.FC = () => {
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>([]);
  const [placedIndustrial, setPlacedIndustrial] = useState<PlacedIndustrialSymbol[]>([]);

  const toggleBenefit = useCallback((id: string) => {
    setSelectedBenefits(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  }, []);

  const handleScenarioUnlock = useCallback(() => {
    setSelectedBenefits([]);
    setPlacedIndustrial([]);
  }, []);

  const b = useMitigationBudgetV2({
    selectedBenefits,
    onToggleBenefit: toggleBenefit,
    onScenarioUnlock: handleScenarioUnlock,
    placedIndustrial,
  });

  const airReadings = useMemo(
    () =>
      b.scenarioLocked
        ? airReadingsForSiting({
            mineSizeKm2: b.selectedSize.value,
            capacityTPerYr: b.selectedCapacity.value,
            placedIndustrial,
          })
        : [],
    [b.scenarioLocked, b.selectedSize.value, b.selectedCapacity.value, placedIndustrial]
  );

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden relative font-sans text-gray-900 h-full">
      <StepGuide b={b} />

      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-hidden">
        {/* Left: scenario dropdowns + map */}
        <div className="flex-1 min-w-0 basis-1/2 bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex flex-col gap-3 overflow-y-auto max-h-full">
          <ScenarioHeader b={b} />
          <ScenarioDropdowns b={b} />
          <ScenarioLockControls b={b} />
          <BudgetSummaryCard b={b} />
          <DraggableRegionalMap
            mode="technical"
            compact
            className="w-full"
            selectedNoBuildIds={[]}
            placedIndustrial={placedIndustrial}
            onPlacedIndustrialChange={setPlacedIndustrial}
            industrialScenario={b.industrialScenario}
            scenarioLocked={b.scenarioLocked}
            workflowPhase={b.phase}
            avgChainSpreadPct={b.avgChainSpreadPct}
            spreadPenaltyPct={b.spreadPenaltyPct}
            airReadings={airReadings}
          />
          {/*
            The air consequence of this siting, shown while the siting is
            happening. The spread penalty is in dollars and immediate; without
            this the air cost was in micrograms and two steps away, so teams
            clustered on the ore body - which sits directly north of the Old
            Town and is the worst ground for air on the map.
          */}
          {b.scenarioLocked && (
            <AirAtSiting
              mineSizeKm2={b.selectedSize.value}
              capacityTPerYr={b.selectedCapacity.value}
              placedIndustrial={placedIndustrial}
            />
          )}
          {/* Siting's nav belongs under the map, which is what it acts on. */}
          <PhaseNavControls b={b} scope="siting" />
        </div>

        {/* Right: site visual + mitigation + benefits */}
        <div className="flex-1 min-w-0 basis-1/2 flex flex-col gap-3 min-h-0 overflow-y-auto bg-white p-3 rounded-xl shadow-lg border border-gray-200">
          <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2 shrink-0">
            <MapPin size={20} /> Projected Impact
          </h2>

          <div className="relative w-full aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden border border-gray-300 shrink-0">
            <img
              key={b.selectedSize.value}
              src={b.selectedSize.image}
              alt={`Mine size ${b.selectedSize.label}`}
              className="absolute inset-0 w-full h-full object-contain p-4"
            />
            <div className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 rounded shadow text-[10px] font-bold">
              Size: {b.selectedSize.label}
            </div>
            <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded shadow text-[10px]">
              <div className="font-bold text-gray-800">Visualizing</div>
              <div>Size: {b.selectedSize.label}</div>
              <div>Capacity: {b.selectedCapacity.label}</div>
            </div>
          </div>

          <MitigationSlidersSection b={b} />
          <LedgerSection b={b} benefitIds={selectedBenefits} />
          <PhaseNavControls b={b} scope="mitigation" />
          <CommunityBenefitsSection b={b} selectedBenefits={selectedBenefits} />
          <PhaseNavControls b={b} scope="benefits" />
          <ExportResultsButton b={b} />
        </div>
      </div>
    </div>
  );
};
