import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import type { SelectableNoBuildId } from '../../data/noBuildAreas';
import { getNoBuildAreaLabel } from '../../data/noBuildAreas';
import {
  benefitCostUsd,
  COMMUNITY_BENEFITS,
  type CommunityBenefitId,
} from '../../data/communityBenefits';
import {
  MAP_BENEFIT_DRAG_TYPE,
  MAP_INDUSTRIAL_DRAG_TYPE,
  INDUSTRIAL_SYMBOLS,
  BENEFIT_CHIP_CLASS,
  getBenefitLabel,
  getIndustrialSymbolDef,
  type IndustrialSymbolType,
  type PlacedIndustrialSymbol,
} from './mapSymbols';
import {
  clientToMapPercentClamped,
  clampPct,
  getObjectContainRect,
  type ContainRect,
} from './mapGeometry';
import { isPointInNoBuildZone } from './noBuildZones';
import { NoBuildOverlays } from './NoBuildOverlays';
import { MapScaleBar } from './MapScaleBar';
import {
  canPlaceIndustrialType,
  formatFacilityPlacementSummary,
  validateIndustrialPlacementLocation,
  type IndustrialScenario,
} from '../../data/industrialPlacementRules';
import {
  formatMapDistanceKm,
  SPREAD_PENALTY_ZERO_AT_KM,
} from '../../data/mapScale';
import type { WorkflowPhase } from '../../hooks/useMitigationBudgetV2';

export interface BenefitPlacement {
  xPct: number;
  yPct: number;
}

export type RegionalMapMode = 'joint' | 'technical';

export interface DraggableRegionalMapProps {
  selectedNoBuildIds: SelectableNoBuildId[];
  mode?: RegionalMapMode;
  /** Controlled industrial placements (technical dashboard + CSV export). */
  placedIndustrial?: PlacedIndustrialSymbol[];
  onPlacedIndustrialChange?: (symbols: PlacedIndustrialSymbol[]) => void;
  selectedBenefits?: string[];
  benefitPlacements?: Partial<Record<CommunityBenefitId, BenefitPlacement>>;
  unassignedBudget?: number;
  onBenefitPlace?: (id: CommunityBenefitId, xPct: number, yPct: number) => void;
  onBenefitRemove?: (id: CommunityBenefitId) => void;
  /** Smaller map footprint (developer dashboard, matches community preview size). */
  compact?: boolean;
  /** Mine size, capacity, and facility tier for industrial placement limits (technical mode). */
  industrialScenario?: IndustrialScenario | null;
  scenarioLocked?: boolean;
  /** Workflow phase — industrial placement only in `siting`. */
  workflowPhase?: WorkflowPhase;
  /** Facility spread penalty (from mitigation budget hook). */
  avgChainSpreadPct?: number;
  spreadPenaltyPct?: number;
  className?: string;
}

let symbolIdCounter = 0;
function nextSymbolId() {
  symbolIdCounter += 1;
  return `sym-${symbolIdCounter}`;
}

export const DraggableRegionalMap: React.FC<DraggableRegionalMapProps> = ({
  selectedNoBuildIds,
  mode = 'joint',
  placedIndustrial: placedIndustrialProp,
  onPlacedIndustrialChange,
  selectedBenefits = [],
  benefitPlacements = {},
  unassignedBudget = 0,
  onBenefitPlace,
  onBenefitRemove,
  compact = false,
  industrialScenario = null,
  scenarioLocked = false,
  workflowPhase = 'scenario',
  avgChainSpreadPct = 0,
  spreadPenaltyPct = 0,
  className,
}) => {
  const isTechnical = mode === 'technical';
  const enforceIndustrialLimits = Boolean(industrialScenario && scenarioLocked);
  const industrialPlacementEnabled = workflowPhase === 'siting';
  const benefitPlacementEnabled = !isTechnical && workflowPhase === 'benefits';
  const mapPlacementEnabled = industrialPlacementEnabled || benefitPlacementEnabled;
  const [internalIndustrial, setInternalIndustrial] = useState<PlacedIndustrialSymbol[]>([]);
  const placedIndustrial = placedIndustrialProp ?? internalIndustrial;

  const setPlacedIndustrial = useCallback(
    (updater: PlacedIndustrialSymbol[] | ((prev: PlacedIndustrialSymbol[]) => PlacedIndustrialSymbol[])) => {
      const next =
        typeof updater === 'function' ? updater(placedIndustrial) : updater;
      if (onPlacedIndustrialChange) onPlacedIndustrialChange(next);
      else setInternalIndustrial(next);
    },
    [placedIndustrial, onPlacedIndustrialChange]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingCategory, setDraggingCategory] = useState<'industrial' | 'benefit' | null>(null);

  const selectedLabels =
    selectedNoBuildIds.length === 0
      ? 'None'
      : selectedNoBuildIds.map(getNoBuildAreaLabel).join(', ');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const cr = entries[0]?.contentRect;
      if (cr) setContainerSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const imageRect: ContainRect = useMemo(
    () => getObjectContainRect(containerSize.w, containerSize.h, naturalSize.w, naturalSize.h),
    [containerSize, naturalSize]
  );

  const canPlaceAt = useCallback(
    (xPct: number, yPct: number) => !isPointInNoBuildZone(xPct, yPct, selectedNoBuildIds),
    [selectedNoBuildIds]
  );

  useEffect(() => {
    setPlacedIndustrial(prev => {
      const next = prev.filter(s => canPlaceAt(s.xPct, s.yPct));
      return next.length === prev.length ? prev : next;
    });
    // Only re-filter when no-go selection changes (not on every placement update).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNoBuildIds]);

  const resolveDropPercent = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container || imageRect.width <= 0 || imageRect.height <= 0) return null;
      return clientToMapPercentClamped(clientX, clientY, container, imageRect);
    },
    [imageRect]
  );

  const addIndustrialAtClient = useCallback(
    (type: IndustrialSymbolType, clientX: number, clientY: number) => {
      if (!industrialPlacementEnabled) return;
      const pct = resolveDropPercent(clientX, clientY);
      if (!pct) return;
      if (!canPlaceAt(pct.xPct, pct.yPct)) {
        if (isTechnical) {
          alert(
            'Cannot place facility in a no-go zone. Adjust community constraints or choose another site.'
          );
        }
        return;
      }
      if (enforceIndustrialLimits && industrialScenario) {
        const check = canPlaceIndustrialType(
          type,
          placedIndustrial,
          industrialScenario,
          pct.xPct,
          pct.yPct
        );
        if (!check.ok) {
          alert(check.message);
          return;
        }
      }
      const newSym: PlacedIndustrialSymbol = {
        id: nextSymbolId(),
        type,
        xPct: clampPct(pct.xPct),
        yPct: clampPct(pct.yPct),
      };
      setPlacedIndustrial(prev => [...prev, newSym]);
    },
    [
      resolveDropPercent,
      canPlaceAt,
      setPlacedIndustrial,
      isTechnical,
      enforceIndustrialLimits,
      industrialScenario,
      scenarioLocked,
      placedIndustrial,
      industrialPlacementEnabled,
    ]
  );

  const handleMapDragOver = (e: React.DragEvent) => {
    if (!mapPlacementEnabled) return;
    const types = e.dataTransfer.types;
    if (
      types.includes(MAP_INDUSTRIAL_DRAG_TYPE) ||
      types.includes('text/plain') ||
      (!isTechnical &&
        (types.includes(MAP_BENEFIT_DRAG_TYPE) || types.includes('text/plain')))
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleMapDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!mapPlacementEnabled) return;
    const industrialType = (e.dataTransfer.getData(MAP_INDUSTRIAL_DRAG_TYPE) ||
      e.dataTransfer.getData('text/plain')) as IndustrialSymbolType;
    if (industrialType && INDUSTRIAL_SYMBOLS.some(s => s.type === industrialType)) {
      if (!industrialPlacementEnabled) return;
      addIndustrialAtClient(industrialType, e.clientX, e.clientY);
      return;
    }
    if (!isTechnical && onBenefitPlace && benefitPlacementEnabled) {
      const benefitId = (e.dataTransfer.getData(MAP_BENEFIT_DRAG_TYPE) ||
        e.dataTransfer.getData('text/plain')) as CommunityBenefitId;
      if (benefitId && COMMUNITY_BENEFITS.some(b => b.id === benefitId)) {
        const pct = resolveDropPercent(e.clientX, e.clientY);
        if (!pct) return;
        onBenefitPlace(benefitId, clampPct(pct.xPct), clampPct(pct.yPct));
      }
    }
  };

  const handleMarkerPointerDown = (
    e: React.PointerEvent,
    id: string,
    category: 'industrial' | 'benefit'
  ) => {
    if (category === 'industrial' && !industrialPlacementEnabled) return;
    if (category === 'benefit' && !benefitPlacementEnabled) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingId(id);
    setDraggingCategory(category);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleMarkerPointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !draggingCategory || !containerRef.current) return;
    const pct = resolveDropPercent(e.clientX, e.clientY);
    if (!pct) return;
    const x = clampPct(pct.xPct);
    const y = clampPct(pct.yPct);

    if (draggingCategory === 'industrial') {
      if (!canPlaceAt(x, y)) return;
      const sym = placedIndustrial.find(s => s.id === draggingId);
      if (sym) {
        const locationCheck = validateIndustrialPlacementLocation(sym.type, x, y);
        if (!locationCheck.ok) return;
      }
      setPlacedIndustrial(prev =>
        prev.map(s => (s.id === draggingId ? { ...s, xPct: x, yPct: y } : s))
      );
    } else if (onBenefitPlace) {
      const benefitId = draggingId as CommunityBenefitId;
      if (benefitPlacements[benefitId]) {
        onBenefitPlace(benefitId, x, y);
      }
    }
  };

  const handleMarkerPointerUp = (e: React.PointerEvent) => {
    if (draggingId) {
      setDraggingId(null);
      setDraggingCategory(null);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
  };

  const removeIndustrial = (id: string) => {
    if (!industrialPlacementEnabled) return;
    setPlacedIndustrial(prev => prev.filter(s => s.id !== id));
  };

  const benefitCanAfford = (id: CommunityBenefitId) => {
    if (!benefitPlacementEnabled) return false;
    const benefit = COMMUNITY_BENEFITS.find(b => b.id === id);
    if (!benefit) return false;
    if (selectedBenefits.includes(id)) return true;
    const priceUsd = benefitCostUsd(
      benefit.id,
      industrialScenario
        ? {
            mineSizeKm2: industrialScenario.mineSizeKm2,
            capacityTPerYr: industrialScenario.capacityMton,
          }
        : null,
    );
    return unassignedBudget >= priceUsd;
  };

  const placedBenefitCount = Object.keys(benefitPlacements).length;

  const industrialChipEnabled = useCallback(
    (type: IndustrialSymbolType) => {
      if (!industrialPlacementEnabled) return false;
      if (!enforceIndustrialLimits || !industrialScenario) return false;
      return canPlaceIndustrialType(type, placedIndustrial, industrialScenario).ok;
    },
    [industrialPlacementEnabled, enforceIndustrialLimits, industrialScenario, placedIndustrial]
  );

  const overlayMessage =
    workflowPhase === 'scenario'
      ? 'Lock scenario to site facilities'
      : workflowPhase === 'siting'
        ? null
        : workflowPhase === 'mitigation'
          ? 'Continue to benefits when ready — map siting is locked'
          : isTechnical
            ? 'Siting complete — export from Step 4'
            : 'Place community benefits on the map';

  return (
    <div
      className={clsx(
        'rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col',
        compact ? 'shrink-0' : 'min-h-[320px] lg:min-h-[min(72vh,640px)] h-full',
        className
      )}
    >
      <div className="px-2 py-1.5 bg-gray-50 border-b text-[10px] font-bold text-gray-700 flex items-center justify-between shrink-0">
        <span>
          {isTechnical
            ? 'Regional map — site industrial facilities'
            : 'Regional map — drag symbols onto map'}
        </span>
        {!isTechnical && (
          <span className="text-gray-500 font-normal">No-build: {selectedLabels}</span>
        )}
      </div>

      <div
        className={clsx(
          'px-2 py-2 border-b bg-white shrink-0',
          !industrialPlacementEnabled && 'opacity-50 pointer-events-none'
        )}
      >
        <span className="text-[10px] text-gray-500 font-semibold block mb-1.5">
          Industrial chain (drag onto map):
        </span>
        <div className="flex flex-row flex-wrap gap-2">
          {INDUSTRIAL_SYMBOLS.map(({ type, label, Icon, chipClass }) => {
            const canDrag = industrialChipEnabled(type);
            return (
            <div
              key={type}
              draggable={canDrag}
              onDragStart={e => {
                if (!canDrag) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.setData(MAP_INDUSTRIAL_DRAG_TYPE, type);
                e.dataTransfer.setData('text/plain', type);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className={clsx(
                'flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold shadow-sm select-none',
                chipClass,
                canDrag
                  ? 'cursor-grab active:cursor-grabbing'
                  : 'opacity-40 cursor-not-allowed'
              )}
              title={
                !industrialPlacementEnabled
                  ? 'Complete Step 1 (lock) and use Step 2 to place facilities'
                  : canDrag
                    ? `Drag ${label} to map`
                    : enforceIndustrialLimits && industrialScenario
                      ? canPlaceIndustrialType(type, placedIndustrial, industrialScenario).message ??
                        `Cannot place ${label}`
                      : `Drag ${label} to map`
              }
            >
              <Icon size={14} strokeWidth={2.5} />
              {label}
            </div>
            );
          })}
        </div>
      </div>

      <div className={clsx('flex flex-row', compact ? 'shrink-0' : 'flex-1 min-h-0')}>
        {!isTechnical && (
          <div
            className={clsx(
              'w-[min(140px,28%)] shrink-0 border-r bg-white px-1.5 py-2 flex flex-col gap-1.5 overflow-y-auto',
              !benefitPlacementEnabled && 'opacity-50 pointer-events-none'
            )}
          >
            <span className="text-[9px] text-gray-500 font-semibold leading-tight">
              Community benefits:
            </span>
            {COMMUNITY_BENEFITS.map(({ id, label, cost }) => {
              const affordable = benefitCanAfford(id);
              const isSelected = selectedBenefits.includes(id);
              return (
                <div
                  key={id}
                  draggable={affordable}
                  onDragStart={e => {
                    if (!affordable) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.setData(MAP_BENEFIT_DRAG_TYPE, id);
                    e.dataTransfer.setData('text/plain', id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className={clsx(
                    'px-1.5 py-1.5 rounded-lg border text-[9px] font-bold leading-tight text-center cursor-grab active:cursor-grabbing shadow-sm select-none',
                    BENEFIT_CHIP_CLASS,
                    !affordable && 'opacity-50 cursor-not-allowed',
                    isSelected && 'ring-2 ring-green-300'
                  )}
                  title={
                    !benefitPlacementEnabled
                      ? 'Continue to Step 4 to place community benefits'
                      : affordable
                        ? `Drag ${label} to map ($${(cost / 1_000_000).toFixed(1)}M)`
                        : 'Not enough budget remaining'
                  }
                >
                  {label}
                </div>
              );
            })}
          </div>
        )}

        <div
          className={clsx(
            'bg-gray-100 flex items-center justify-center p-2 min-w-0 w-full',
            compact ? 'shrink-0' : 'flex-1'
          )}
        >
          <div
            ref={containerRef}
            className={clsx(
              'relative w-full aspect-square mx-auto overflow-visible',
              compact ? 'max-w-full' : 'max-w-full max-h-[min(68vh,620px)]',
              !industrialPlacementEnabled && !benefitPlacementEnabled && 'opacity-60'
            )}
            onDragOver={handleMapDragOver}
            onDrop={handleMapDrop}
          >
            <img
              src="/regional-map.png"
              alt="Regional map"
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain object-center select-none pointer-events-none"
              onLoad={e => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                }
              }}
            />

            <NoBuildOverlays selectedNoBuildIds={selectedNoBuildIds} />

            {imageRect.width > 0 && imageRect.height > 0 && (
              <div
                className="absolute z-10 pointer-events-none"
                style={{
                  left: imageRect.left,
                  top: imageRect.top,
                  width: imageRect.width,
                  height: imageRect.height,
                }}
              >
                <MapScaleBar />
              </div>
            )}

            {overlayMessage && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-900/10 pointer-events-none">
                <span className="text-[10px] font-semibold text-gray-700 bg-white/90 px-2 py-1 rounded shadow">
                  {overlayMessage}
                </span>
              </div>
            )}

            {imageRect.width > 0 && imageRect.height > 0 && (
              <div
                className="absolute z-10"
                style={{
                  left: imageRect.left,
                  top: imageRect.top,
                  width: imageRect.width,
                  height: imageRect.height,
                  pointerEvents: mapPlacementEnabled ? 'auto' : 'none',
                }}
              >
                {placedIndustrial.map(sym => {
                  const def = getIndustrialSymbolDef(sym.type);
                  const { Icon } = def;
                  const isDragging = draggingId === sym.id;
                  return (
                    <div
                      key={sym.id}
                      role="button"
                      tabIndex={0}
                      className={clsx(
                        'absolute flex items-center justify-center w-8 h-8 rounded-full border-2 shadow-md cursor-grab touch-none pointer-events-auto',
                        def.chipClass,
                        isDragging && 'ring-2 ring-yellow-400 scale-110 z-20'
                      )}
                      style={{
                        left: `${sym.xPct}%`,
                        top: `${sym.yPct}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      title={`${def.label} — drag to move, double-click to remove`}
                      onPointerDown={e =>
                        handleMarkerPointerDown(e, sym.id, 'industrial')
                      }
                      onPointerMove={handleMarkerPointerMove}
                      onPointerUp={handleMarkerPointerUp}
                      onPointerCancel={handleMarkerPointerUp}
                      onDoubleClick={() => removeIndustrial(sym.id)}
                    >
                      <Icon size={16} strokeWidth={2.5} />
                      <button
                        type="button"
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-600 flex items-center justify-center hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation();
                          removeIndustrial(sym.id);
                        }}
                        aria-label={`Remove ${def.label}`}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}

                {!isTechnical &&
                  onBenefitRemove &&
                  (Object.entries(benefitPlacements) as [CommunityBenefitId, BenefitPlacement][]).map(
                    ([id, pos]) => {
                      const isDragging = draggingId === id;
                      return (
                        <div
                          key={id}
                          role="button"
                          tabIndex={0}
                          className={clsx(
                            'absolute flex items-center justify-center min-w-[2rem] max-w-[5rem] px-1 py-0.5 rounded-md border-2 shadow-md cursor-grab touch-none text-[8px] font-bold text-center leading-tight',
                            BENEFIT_CHIP_CLASS,
                            isDragging && 'ring-2 ring-yellow-400 scale-110 z-20'
                          )}
                          style={{
                            left: `${pos.xPct}%`,
                            top: `${pos.yPct}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                          title={`${getBenefitLabel(id)} — drag to move, double-click to remove`}
                          onPointerDown={e =>
                            handleMarkerPointerDown(e, id, 'benefit')
                          }
                          onPointerMove={handleMarkerPointerMove}
                          onPointerUp={handleMarkerPointerUp}
                          onPointerCancel={handleMarkerPointerUp}
                          onDoubleClick={() => onBenefitRemove(id)}
                        >
                          <span className="line-clamp-2">{getBenefitLabel(id)}</span>
                          <button
                            type="button"
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-600 flex items-center justify-center hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                            onPointerDown={e => e.stopPropagation()}
                            onClick={e => {
                              e.stopPropagation();
                              onBenefitRemove(id);
                            }}
                            aria-label={`Remove ${getBenefitLabel(id)}`}
                          >
                            <X size={10} />
                          </button>
                        </div>
                      );
                    }
                  )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-2 py-1 text-[10px] text-gray-500 border-t bg-white shrink-0 space-y-0.5">
        <p>
          {workflowPhase === 'scenario'
            ? 'Step 1: Lock mine size, capacity, and facility, then site industrial facilities on the map.'
            : workflowPhase === 'siting'
              ? 'Step 2: Place required facilities. Extraction must be within 1 km of the ore body.'
              : workflowPhase === 'mitigation'
                ? 'Step 3: Allocate mitigation on the right (or below). Map siting is locked.'
                : isTechnical
                  ? 'Step 4: Select community benefits and submit results.'
                  : 'Step 4: Select and place community benefits, then submit.'}
        </p>
        {scenarioLocked && spreadPenaltyPct > 0 && (
          <p className="font-medium text-amber-800">
            Avg link distance: {formatMapDistanceKm(avgChainSpreadPct)} · −
            {spreadPenaltyPct.toFixed(1)}% of unassigned budget (penalty applies above{' '}
            {SPREAD_PENALTY_ZERO_AT_KM} km per link)
          </p>
        )}
        {scenarioLocked && spreadPenaltyPct === 0 && avgChainSpreadPct > 0 && (
          <p className="font-medium text-gray-700">
            Avg link distance: {formatMapDistanceKm(avgChainSpreadPct)} (no penalty within{' '}
            {SPREAD_PENALTY_ZERO_AT_KM} km per link)
          </p>
        )}
        {industrialScenario && workflowPhase === 'siting' && (
          <p className="font-medium text-gray-700">
            Required: {formatFacilityPlacementSummary(placedIndustrial, industrialScenario)}
          </p>
        )}
        {workflowPhase === 'scenario' && industrialScenario && (
          <p className="text-amber-700">Lock scenario in Configuration before placing facilities.</p>
        )}
        {!isTechnical && workflowPhase === 'benefits' && (
          <p>
            Drag community benefits from the left onto the map; double-click or ✕ to remove.
          </p>
        )}
        {(placedIndustrial.length > 0 || placedBenefitCount > 0) && (
          <p className="font-semibold text-gray-700">
            Placed: {placedIndustrial.length} industrial
            {!isTechnical && `, ${placedBenefitCount} benefit(s)`}
          </p>
        )}
      </div>
    </div>
  );
};
