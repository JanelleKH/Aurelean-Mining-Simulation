import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Upload, AlertTriangle, CheckCircle, XCircle, FileText } from 'lucide-react';
import { BenefitUtilityCostChart } from './BenefitUtilityCostChart';
import { WhyItFailedCard, type Blocker } from './WhyItFailedCard';
import { AdminNegotiationMap } from './map/AdminNegotiationMap';
import type { SelectableNoBuildId } from '../data/noBuildAreas';
import {
  getMaxNoBuildZonesForCommunityWinner,
  getMaxNoBuildZonesForMineSizeKm2,
  getNoBuildAreaLabel,
  normalizeNoBuildId,
  validateNoGoZoneFeasibility,
} from '../data/noBuildAreas';
import { benefitCostUsd, getCommunityBenefit } from '../data/communityBenefits';
import { computeWasteLedger, computeWaterLedger, computeAirLedger } from '../model/index';
import { toAirSourcesFromRecords } from '../data/airSources';
import {
  findIndustrialNoBuildConflicts,
  parseIndustrialPlacements,
  type IndustrialPlacementRecord,
} from '../data/mapOverlap';
import { getIndustrialSymbolDef, type IndustrialSymbolType } from './map/mapSymbols';
import { getCsvField, parseCsvLine } from '../utils/csvParse';
import { checkCsvForSlot } from '../utils/csvSchema';

interface CommunityResult {
  winnerId: string;
  consensusAreaIds: SelectableNoBuildId[];
  benefitsCount: number;
  selectedBenefitIds: string[];
  noGoZoneCount: number;
  maxNoGoZones: number | null;
}

interface DeveloperResult {
  size_km2: number;
  capacity_mton: number;
  total_budget: number;
  final_water: number;
  water_alloc: number;
  air_alloc: number;
  final_waste: number;
  selectedBenefitIds: string[];
  industrialPlacements: IndustrialPlacementRecord[];
}

const SIZE_LABELS: Record<string, string> = {
  '8km': '8 km²',
  '4km': '4 km²',
  '2km': '2 km²',
  '1km': '1 km²',
  '0.5km': '0.5 km²',
  oppose: 'Oppose Mine',
};

const SIZE_INDICES: Record<string, number> = {
  '8km': 0,
  '4km': 1,
  '2km': 2,
  '1km': 3,
  '0.5km': 4,
  oppose: 5,
};

function parseNoBuildIds(raw: string): SelectableNoBuildId[] {
  if (!raw || raw === 'none') return [];
  return raw
    .split('|')
    .map(s => normalizeNoBuildId(s))
    .filter((id): id is SelectableNoBuildId => id !== null);
}

const parseCSV = (text: string, type: 'community' | 'developer'): CommunityResult | DeveloperResult | null => {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const header = parseCsvLine(lines[0]);
  const values = parseCsvLine(lines[1]);

  if (type === 'community') {
    const winnerId = getCsvField(header, values, 'winnerId') || values[0] || 'none';
    const benefitsCount = Number(
      getCsvField(header, values, 'benefitsCount') || values[1] || '0'
    );
    const benefitIdsRaw = getCsvField(header, values, 'benefitIds') || values[2] || '';
    const benefitIds = benefitIdsRaw ? benefitIdsRaw.split('|').map(id => id.trim()) : [];
    const consensusRaw =
      getCsvField(header, values, 'consensusAreaId') || values[3] || 'none';
    const consensusAreaIds = parseNoBuildIds(consensusRaw);
    const noGoFromCsv = getCsvField(header, values, 'noGoZoneCount');
    const maxFromCsv = getCsvField(header, values, 'maxNoGoZones');
    const noGoZoneCount = noGoFromCsv
      ? Number(noGoFromCsv)
      : consensusAreaIds.length;
    const parsedMax = maxFromCsv ? Number(maxFromCsv) : NaN;

    return {
      winnerId,
      consensusAreaIds,
      benefitsCount,
      selectedBenefitIds: benefitIds,
      noGoZoneCount,
      maxNoGoZones: Number.isFinite(parsedMax) ? parsedMax : null,
    } as CommunityResult;
  }

  const benefitIdsRaw = getCsvField(header, values, 'selected_benefits');
  const benefitIds = benefitIdsRaw
    ? benefitIdsRaw.split('|').map(id => id.trim())
    : [];

  const industrialRaw = getCsvField(header, values, 'industrial_placements', {
    mergeExtraCommas: true,
  });

  const waterRaw = getCsvField(header, values, 'final_water_m3');
  const wasteRaw = getCsvField(header, values, 'final_waste_ton');

  return {
    size_km2: Number(getCsvField(header, values, 'size_km2') || values[0]),
    capacity_mton: Number(getCsvField(header, values, 'capacity_mton') || values[1]),
    total_budget: Number(getCsvField(header, values, 'total_budget') || values[2]),
    final_water: Number(waterRaw || values[6]),
    water_alloc: Number(getCsvField(header, values, 'water_alloc') || 0),
    air_alloc: Number(getCsvField(header, values, 'air_alloc') || 0),
    final_waste: Number(wasteRaw || values[7]),
    selectedBenefitIds: benefitIds,
    industrialPlacements: parseIndustrialPlacements(industrialRaw),
  } as DeveloperResult;
};

const getDevSizeId = (sizeVal: number): string => {
  if (sizeVal >= 6.0) return '8km';
  if (sizeVal >= 3.5) return '4km';
  if (sizeVal >= 1.5) return '2km';
  if (sizeVal >= 0.8) return '1km';
  return '0.5km';
};

type SectionVerdict = 'pass' | 'warn' | 'fail';

interface FeasibilitySection {
  title: string;
  verdict: SectionVerdict;
  summary: string;
  details: string[];
}

interface FeasibilityResult {
  status: 'optimal' | 'suboptimal' | 'infeasible';
  blockers: Blocker[];
  sections: {
    sizeAlignment: FeasibilitySection;
    environmentalBenefits: FeasibilitySection;
    mapSiting: FeasibilitySection;
  };
}

/** $1,234,567 -> "$1.2M". Used only in blocker text. */
const usdM = (n: number) => '$' + (n / 1e6).toFixed(1) + 'M';

/**
 * Production rate, in the units it is actually in.
 *
 * `capacity_mton` is named as though it were megatonnes and carries tonnes per
 * year: the CSV writes 3000000 for a 3.0 Mt/yr plan. The read-out printed the
 * raw number against the label "Mt capacity", so a facilitator reading the
 * first line of the first card saw "3000000 Mt capacity" - a figure a million
 * times too large, on the screen the whole room looks at. The field name is
 * load-bearing in the CSV and across the model, so it stays; the formatting is
 * fixed here instead.
 */
const mtPerYr = (tonnesPerYear: number) => `${(tonnesPerYear / 1e6).toFixed(1)} Mt/yr`;


function benefitLabel(id: string): string {
  return getCommunityBenefit(id)?.label ?? id;
}

function buildFeasibilityAnalysis(
  communityData: CommunityResult,
  developerData: DeveloperResult,
  sitingConflicts: ReturnType<typeof findIndustrialNoBuildConflicts>
): FeasibilityResult {
  const sizeDetails: string[] = [];
  let sizeVerdict: SectionVerdict = 'pass';
  const blockers: Blocker[] = [];

  const communitySizeLabel =
    SIZE_LABELS[communityData.winnerId] ?? communityData.winnerId;
  const devSizeId = getDevSizeId(developerData.size_km2);
  const devSizeLabel = SIZE_LABELS[devSizeId] ?? `${developerData.size_km2} km²`;

  sizeDetails.push(
    `Community voted for a ${communitySizeLabel} mine. Developer proposed ${devSizeLabel} at ${mtPerYr(developerData.capacity_mton)}.`
  );

  const commIndex = SIZE_INDICES[communityData.winnerId];
  const devIndex = SIZE_INDICES[devSizeId];
  const safeDevIndex = devIndex ?? 99;
  const sizeGap = Math.abs(safeDevIndex - commIndex);

  // Opposition is not a size. The community voting against a mine at all used to
  // be scored as a five-step gap on the size ladder, which read as "you wanted
  // different sizes" when what happened was a refusal. Since the community vote
  // became two-stage on 31 October 2026, 'oppose' is the recorded outcome of
  // stage one, and it gets its own verdict here.
  if (communityData.winnerId === 'oppose') {
    sizeVerdict = 'fail';
    sizeDetails.push(
      `The community voted against a mine at any size. The developer proposed ${devSizeLabel}. This is a refusal rather than a disagreement about scale — there is no size that splits the difference.`
    );
    blockers.push({
      kind: 'fail',
      section: 1,
      test: 'Community consent to mine at all',
      measured: `Refused at stage one of the community vote; developer proposed ${devSizeLabel}`,
      threshold: 'More groups accepting a mine than refusing one',
      remedy:
        'Nothing in this submission. A benefits package cannot buy consent that was withheld in principle, and shrinking the mine does not answer a vote that was about whether to mine. The developer either persuades a group to change its stage-one answer, or there is no project.',
    });
  } else if (sizeGap === 0) {
    sizeDetails.push('Mine sizes match — both sides targeted the same scale.');
  } else if (sizeGap <= 2) {
    sizeVerdict = 'warn';
    sizeDetails.push(
      `Mine sizes are close but not identical (${sizeGap} step${sizeGap === 1 ? '' : 's'} apart). The deal may still work, but alignment is not ideal.`
    );
    blockers.push({
      kind: 'warn',
      section: 1,
      test: 'Mine size alignment',
      measured: `${sizeGap} step${sizeGap === 1 ? '' : 's'} apart on the size ladder — community ${communitySizeLabel}, developer ${devSizeLabel}`,
      threshold: 'Same step to pass cleanly; 1 to 2 steps is a warning',
      remedy: `Developer moves to ${communitySizeLabel}, or the community accepts ${devSizeLabel}`,
    });
  } else {
    sizeVerdict = 'fail';
    sizeDetails.push(
      `Mine sizes are too far apart (${sizeGap} steps). Community and developer are not negotiating the same project scale — not feasible.`
    );
    blockers.push({
      kind: 'fail',
      section: 1,
      test: 'Mine size alignment',
      measured: `${sizeGap} steps apart — community voted ${communitySizeLabel}, developer proposed ${devSizeLabel}`,
      threshold: 'No more than 2 steps apart on the size ladder',
      remedy: 'One side moves. There is no package of benefits that closes a three-step gap, because the two sides are costing different projects.',
    });
  }

  const zoneCount = communityData.consensusAreaIds.length;
  const expectedMax = getMaxNoBuildZonesForCommunityWinner(communityData.winnerId);
  const noGoCheck = validateNoGoZoneFeasibility(
    communityData.winnerId,
    zoneCount,
    communityData.maxNoGoZones ?? undefined
  );
  const devMaxNoGo = getMaxNoBuildZonesForMineSizeKm2(developerData.size_km2);

  // No-go zones are tested ONE way only: by whether facilities actually overlap
  // them, which is the siting check in section 3.
  //
  // This section used to fail the plan whenever the community had designated
  // more zones than the DEVELOPER's chosen mine size would allow. That was
  // backwards. A no-go zone is the community's veto; the developer choosing a
  // larger mine cannot delete it. It also made the front of the read-out
  // contradict section 3, which was testing overlap correctly. Counts are
  // reported here as context; the verdict lives with the overlap.
  if (communityData.noGoZoneCount !== zoneCount) {
    // A genuine file problem rather than a judgement about the plan.
    sizeVerdict = 'fail';
    sizeDetails.push(
      `Community file is inconsistent: it records ${communityData.noGoZoneCount} no-go zone(s) but lists ${zoneCount}. Re-export from the community view before assessing.`
    );
    blockers.push({
      kind: 'fail',
      section: 1,
      test: 'Community results file is internally consistent',
      measured: `Header says ${communityData.noGoZoneCount} no-go zone(s); the file lists ${zoneCount}`,
      threshold: 'The two figures have to match',
      remedy: 'Re-export from the community view. This is a file problem, not a judgement about the plan — nothing below it has been assessed against the right zones.',
    });
  } else if (!noGoCheck.ok) {
    sizeVerdict = 'fail';
    sizeDetails.push(
      `Community file breaks its own rules: ${noGoCheck.message ?? `more no-go zones than ${communitySizeLabel} permits.`} Re-export from the community view.`
    );
    blockers.push({
      kind: 'fail',
      section: 1,
      test: 'No-go zones within the community\u2019s own allowance',
      measured: `${zoneCount} zone(s) designated at ${communitySizeLabel}`,
      threshold: `${expectedMax} zone(s) permitted at ${communitySizeLabel}`,
      remedy: 'Community drops a zone, or votes for a larger mine, which buys more of them. Re-export either way.',
    });
  } else if (zoneCount === 0) {
    sizeDetails.push('Community designated no no-go zones, so no area is protected from siting.');
  } else {
    const zoneNames = communityData.consensusAreaIds.map(getNoBuildAreaLabel).join(', ');
    sizeDetails.push(
      `Community designated ${zoneCount} no-go zone(s) of ${expectedMax} allowed at ${communitySizeLabel}: ${zoneNames}. Whether the developer respected them is tested in the siting check below, not here.`
    );
    if (zoneCount > devMaxNoGo) {
      sizeDetails.push(
        `Note: at ${developerData.size_km2} km² the developer's own allowance would be ${devMaxNoGo}. That does not override the community's designation — it means the developer has less room to site around them.`
      );
    }
  }

  const sizeSummary =
    sizeVerdict === 'pass'
      ? 'Mine size aligns between community and developer.'
      : sizeVerdict === 'warn'
        ? 'Mine sizes are close, but not a perfect match.'
        : 'Mine size does not align, or a results file is inconsistent.';

  const envDetails: string[] = [];
  let envVerdict: SectionVerdict = 'pass';

  envDetails.push(
    'We read the water and waste ledgers in physical units and ask what actually breaks: how much is pumped against what the aquifer receives, whether the cistern and the farm wells survive it, how much rock and tailings the plan generates, whether the disturbed ground fits the licence, and whether the benefits the community asked for are funded. The three dimensions are reported separately and never added together.'
  );

  // Water and waste now come from the physical ledgers in src/model rather than
  // from two hard-coded limits (800,000 m3 and 5 Mt), which had no source and
  // were applied only when the community happened to request a related benefit.
  const waterLedger = computeWaterLedger({
    mineSizeKm2: developerData.size_km2,
    capacityTPerYr: developerData.capacity_mton,
    waterMitigationSpendUsd: developerData.water_alloc,
  });
  const wasteLedger = computeWasteLedger({
    mineSizeKm2: developerData.size_km2,
    capacityTPerYr: developerData.capacity_mton,
  });
  const cistern = waterLedger.receptors[0];
  const wells = waterLedger.receptors[1];

  if (!waterLedger.timing.plausibleMinePlan) {
    envVerdict = 'warn';
    envDetails.push(
      `Plan: this size and rate imply a ${waterLedger.timing.mineLifeYr.toFixed(0)}-year mine life, where a reserve of this size would normally be mined over about ${waterLedger.timing.taylorLifeYr.toFixed(0)} years. Not a plan anyone would fund.`
    );
    blockers.push({
      kind: 'warn',
      section: 2,
      test: 'Mine life is plausible for the reserve (Taylor\u2019s rule)',
      measured: `${waterLedger.timing.mineLifeYr.toFixed(1)} years at ${mtPerYr(developerData.capacity_mton)}`,
      threshold: `About ${waterLedger.timing.taylorLifeYr.toFixed(0)} years for a reserve of ${(wasteLedger.tonnage.oreMinedT / 1e6).toFixed(0)} Mt`,
      remedy: 'Lower the production rate or take a larger footprint. Nothing physical is broken here — it is a plan no lender would finance.',
    });
  }

  envDetails.push(
    `Water balance: the mine pumps ${Math.round(waterLedger.mitigation.netDewateringM3PerDay).toLocaleString()} m3/day from the aquifer, which is ${waterLedger.balance.multipleOfRecharge.toFixed(1)} times its natural recharge.` +
      (waterLedger.balance.spendingStorage
        ? ` Above one, the shortfall comes out of stored water and the water table keeps falling: ${(waterLedger.balance.storageDepletedM3 / 1e6).toFixed(1)} million m3 over the life of the mine.`
        : ' Within recharge, so the aquifer is not being drained.')
  );

  if (cistern.verdict === 'lost') {
    envVerdict = 'fail';
    envDetails.push(
      cistern.spendToSaveUsd === null
        ? `Old Cistern: LOST. Drawdown of ${cistern.drawdownM.toFixed(2)} m against an available column of ${cistern.toleranceM.toFixed(2)} m, and no amount of grouting or reinjection reaches it. This is not a cost, it is a loss — only a smaller mine or a no-go zone avoids it.`
        : `Old Cistern: LOST at the current mitigation spend. Drawdown ${cistern.drawdownM.toFixed(2)} m against ${cistern.toleranceM.toFixed(2)} m available. About $${(cistern.spendToSaveUsd / 1e6).toFixed(1)}M more on reinjection and grouting would hold it.`
    );
    blockers.push({
      kind: 'fail',
      section: 2,
      test: 'Old Cistern keeps water in it',
      measured: `${cistern.drawdownM.toFixed(2)} m of drawdown at the cistern${cistern.shieldedByBarrier ? ', compartment barrier intact' : ', compartment barrier breached'}`,
      threshold: `${cistern.toleranceM.toFixed(2)} m of water column available before it runs dry`,
      remedy:
        cistern.spendToSaveUsd === null
          ? null
          : `${usdM(cistern.spendToSaveUsd)} more on reinjection and grouting, on top of the ${usdM(developerData.water_alloc)} already allocated to water`,
    });
  } else if (cistern.verdict === 'at_risk') {
    if (envVerdict === 'pass') envVerdict = 'warn';
    envDetails.push(
      `Old Cistern: holding, but close. Drawdown ${cistern.drawdownM.toFixed(2)} m of ${cistern.toleranceM.toFixed(2)} m available.`
    );
    blockers.push({
      kind: 'warn',
      section: 2,
      test: 'Old Cistern keeps water in it',
      measured: `${cistern.drawdownM.toFixed(2)} m of drawdown`,
      threshold: `${cistern.toleranceM.toFixed(2)} m available — holding, with ${(cistern.toleranceM - cistern.drawdownM).toFixed(2)} m to spare`,
      remedy: 'Holds as submitted. Any increase in pumping, or a dry year, takes it.',
    });
  } else {
    envDetails.push(
      `Old Cistern: holds. Drawdown ${cistern.drawdownM.toFixed(2)} m of ${cistern.toleranceM.toFixed(2)} m available${cistern.shieldedByBarrier ? ', with the compartment barrier intact' : ''}.`
    );
  }

  if (wells.verdict === 'lost') {
    if (envVerdict !== 'fail') envVerdict = 'warn';
    envDetails.push(
      `Agricultural wells: failing. Drawdown ${wells.drawdownM.toFixed(2)} m against ${wells.toleranceM.toFixed(2)} m of available drawdown.` +
        (wells.spendToSaveUsd !== null
          ? ` About $${(wells.spendToSaveUsd / 1e6).toFixed(1)}M would recover them — unlike the cistern, this harm answers to money.`
          : '')
    );
    blockers.push({
      kind: 'warn',
      section: 2,
      test: 'Agricultural wells keep yielding',
      measured: `${wells.drawdownM.toFixed(2)} m of drawdown at the farm wells`,
      threshold: `${wells.toleranceM.toFixed(2)} m of available drawdown before the pumps break suction`,
      remedy:
        wells.spendToSaveUsd === null
          ? null
          : `${usdM(wells.spendToSaveUsd)} on deepening and reinjection — unlike the cistern, this harm answers to money`,
    });
  } else {
    envDetails.push(
      `Agricultural wells: yielding. Drawdown ${wells.drawdownM.toFixed(2)} m of ${wells.toleranceM.toFixed(2)} m.`
    );
  }

  envDetails.push(
    `Waste and land: ${(wasteLedger.tonnage.wasteRockT / 1e6).toFixed(1)} Mt of waste rock and ${(wasteLedger.tonnage.tailingsT / 1e6).toFixed(1)} Mt of tailings over the life of the mine, from ${(wasteLedger.tonnage.oreMinedT / 1e6).toFixed(1)} Mt of ore. Waste follows the tonnage mined, not the licence area.`
  );

  if (wasteLedger.footprint.exceedsLicenceArea) {
    envVerdict = 'fail';
    envDetails.push(
      `Footprint: the dumps and impoundment need ${Math.round(wasteLedger.footprint.totalDisturbedHa)} ha, and the community licence allows ${Math.round(wasteLedger.footprint.licenceAreaHa)} ha. The plan does not fit the ground it has been given — either more tailings go underground as backfill, or the licence has to grow.`
    );
    blockers.push({
      kind: 'fail',
      section: 2,
      test: 'Disturbed ground fits inside the licence area',
      measured: `${Math.round(wasteLedger.footprint.totalDisturbedHa)} ha — ${Math.round(wasteLedger.footprint.wasteDumpHa)} ha of waste dump plus ${Math.round(wasteLedger.footprint.tailingsImpoundmentHa)} ha of impoundment`,
      threshold: `${Math.round(wasteLedger.footprint.licenceAreaHa)} ha licensed — over by ${Math.round(wasteLedger.footprint.totalDisturbedHa - wasteLedger.footprint.licenceAreaHa)} ha`,
      remedy: 'Place tailings underground as paste backfill, mine less rock, or the community grants a larger licence area. Money alone does not shrink a footprint.',
    });
  } else {
    envDetails.push(
      `Footprint: ${Math.round(wasteLedger.footprint.totalDisturbedHa)} ha of disturbed ground against a licence of ${Math.round(wasteLedger.footprint.licenceAreaHa)} ha. Fits.`
    );
  }

  // Air. Unlike water and waste, this one depends on WHERE the facilities were
  // placed, so it is computed from the siting recorded in the developer's file.
  // EU limit values are binding law rather than guidance, so an exceedance is a
  // refusal and not a warning: no benefits package buys past it.
  const airSources = toAirSourcesFromRecords(developerData.industrialPlacements);
  if (airSources.length === 0) {
    envDetails.push(
      'Air: not assessed. The developer file records no facility placements, and air depends on where the operation sits.'
    );
    blockers.push({
      kind: 'warn',
      section: 2,
      test: 'Air quality at the Old Town and the campus',
      measured: 'Not assessed — no facility placements in the developer file',
      threshold: 'PM10 40 and PM2.5 25 µg/m³ (EU limit values, binding); 15 and 5 (WHO guidelines, advisory)',
      remedy: 'Site the facilities on the map and re-export. Air is the one dimension that depends on where things sit rather than what is spent, so it cannot be assessed without the placements.',
    });
  } else {
    const airLedger = computeAirLedger({
      sources: airSources,
      capacityTPerYr: developerData.capacity_mton,
      airControlCapitalUsd: developerData.air_alloc,
      disturbedHa: wasteLedger.footprint.totalDisturbedHa,
      benefitIds: developerData.selectedBenefitIds,
      mineLifeYr: waterLedger.timing.mineLifeYr,
    });
    const town = airLedger.receptors[0];

    if (!airLedger.permitting.compliant) {
      envVerdict = 'fail';
      envDetails.push(
        `Air: REFUSED. ${airLedger.permitting.reason} EU limit values are binding, so this is not something a benefits package can offset. ` +
          (town.capitalToMeetLimitUsd === null
            ? 'No affordable amount of control equipment reaches the limit from this siting. This is not a cost to be weighed — the facilities have to move.'
            : `About $${(town.capitalToMeetLimitUsd / 1e6).toFixed(1)}M of control equipment would bring it inside the limit from here.`)
      );
      blockers.push({
        kind: 'fail',
        section: 2,
        test: 'Air quality inside the EU limit values (binding law)',
        measured: `At ${town.label}, PM10 ${town.pm10AnnualUgM3.toFixed(1)} and PM2.5 ${town.pm25AnnualUgM3.toFixed(1)} µg/m³, nearest operation ${Math.round(town.nearestSourceM)} m away`,
        threshold: 'PM10 40 and PM2.5 25 µg/m³ — Directive 2008/50/EC, not negotiable in the room',
        remedy:
          town.capitalToMeetLimitUsd === null
            ? null
            : `${usdM(town.capitalToMeetLimitUsd)} of control equipment, against the ${usdM(developerData.air_alloc)} currently allocated to air. Moving the facilities further from the town does it for nothing.`,
      });
    } else if (town.pm25Verdict !== 'within_guideline' || town.pm10Verdict !== 'within_guideline') {
      if (envVerdict === 'pass') envVerdict = 'warn';
      envDetails.push(
        `Air: lawful but not healthy. At the Old Town, PM10 ${town.pm10AnnualUgM3.toFixed(1)} and PM2.5 ${town.pm25AnnualUgM3.toFixed(1)} ug/m3 — inside the EU limits of 40 and 25, above the WHO guidelines of 15 and 5. The nearest operation is ${Math.round(town.nearestSourceM)} m away. This is the gap the community has to argue in, because the regulation will not close it for them.`
      );
      blockers.push({
        kind: 'warn',
        section: 2,
        test: 'Air quality inside the WHO health guidelines (advisory)',
        measured: `At ${town.label}, PM10 ${town.pm10AnnualUgM3.toFixed(1)} and PM2.5 ${town.pm25AnnualUgM3.toFixed(1)} µg/m³`,
        threshold: 'WHO 2021: PM10 15, PM2.5 5 µg/m³. Lawful already — the EU limits of 40 and 25 are met',
        remedy:
          town.capitalToMeetGuidelineUsd === null
            ? null
            : `${usdM(town.capitalToMeetGuidelineUsd)} of control equipment. No law requires this, which is exactly why it has to be negotiated.`,
      });
    } else {
      envDetails.push(
        `Air: within the health guidelines at the Old Town. PM10 ${town.pm10AnnualUgM3.toFixed(1)} and PM2.5 ${town.pm25AnnualUgM3.toFixed(1)} ug/m3, nearest operation ${Math.round(town.nearestSourceM)} m away.`
      );
    }

    envDetails.push(
      `Air control: $${(airLedger.obligation.capitalUsd / 1e6).toFixed(1)}M of equipment from the budget, plus about $${(airLedger.obligation.annualOmUsd / 1e6).toFixed(1)}M a year to run it — $${(airLedger.obligation.lifetimeUsd / 1e6).toFixed(0)}M over ${airLedger.obligation.mineLifeYr.toFixed(0)} years. The budget charges the equipment; the running cost recurs for as long as the mine does, and the dust returns the year it stops.`
    );
  }

  const unfundedBenefits = communityData.selectedBenefitIds.filter(
    id => !developerData.selectedBenefitIds.includes(id)
  );
  if (unfundedBenefits.length === 0) {
    envDetails.push(
      `Benefits funding: All ${communityData.selectedBenefitIds.length} requested community benefit(s) appear in the developer package.`
    );
  } else {
    if (envVerdict !== 'fail') envVerdict = 'warn';
    const names = unfundedBenefits.map(benefitLabel).join(', ');
    const scenario = {
      mineSizeKm2: developerData.size_km2,
      capacityTPerYr: developerData.capacity_mton,
    };
    const unfundedTotal = unfundedBenefits.reduce(
      (sum, id) => sum + benefitCostUsd(id, scenario),
      0
    );
    const unassigned = developerData.total_budget - developerData.water_alloc -
      developerData.air_alloc;
    envDetails.push(
      `Benefits funding: Developer did not fund ${unfundedBenefits.length} item(s): ${names}. Together they cost ${usdM(unfundedTotal)} of a ${usdM(developerData.total_budget)} budget.`
    );
    // One blocker per item, with its own price. "Did not fund the irrigation
    // system" is not an answer anyone can act on; "the irrigation system costs
    // $3.0M and you left $1.5M unassigned" is.
    unfundedBenefits.forEach(id => {
      const cost = benefitCostUsd(id, scenario);
      blockers.push({
        kind: 'warn',
        section: 2,
        test: `Community asked for: ${benefitLabel(id)}`,
        measured: 'Not in the developer package',
        threshold: `${usdM(cost)} to fund it`,
        remedy:
          unassigned >= cost
            ? `Affordable as submitted — ${usdM(unassigned)} of the budget is still unassigned. The developer chose not to, which is a bargaining position rather than a constraint.`
            : `${usdM(cost - Math.max(unassigned, 0))} short on the current budget. Something else gives — a smaller mitigation allocation, a different benefit, or the community drops this one.`,
      });
    });
  }

  const envSummary =
    envVerdict === 'pass'
      ? 'Environmental limits and benefit funding look good.'
      : envVerdict === 'warn'
        ? 'Limits are met, but not all requested benefits were funded.'
        : 'Water, waste, or benefit requirements are not met.';

  const mapDetails: string[] = [];
  let mapVerdict: SectionVerdict = 'pass';
  const facilityCount = developerData.industrialPlacements.length;

  mapDetails.push(
    'Industrial facilities must sit outside community no-go zones. See the map above: red borders = no-go zones; amber rings = conflicts.'
  );

  if (facilityCount === 0) {
    mapVerdict = 'warn';
    mapDetails.push('No facility placements found in the developer file — map siting could not be verified.');
    blockers.push({
      kind: 'warn',
      section: 3,
      test: 'Facilities sit outside the community no-go zones',
      measured: 'No placements recorded in the developer file',
      threshold: 'Every facility clear of every designated no-go zone',
      remedy: 'Place the facilities on the map and re-export. Until then neither siting nor air has been tested.',
    });
  } else if (sitingConflicts.length === 0) {
    if (communityData.consensusAreaIds.length === 0) {
      mapDetails.push(
        `All ${facilityCount} facility(ies) placed. Community selected no no-go zones, so there is nothing to conflict with.`
      );
    } else {
      const zoneNames = communityData.consensusAreaIds.map(getNoBuildAreaLabel).join(', ');
      mapDetails.push(
        `All ${facilityCount} facility(ies) are outside community no-go zones (${zoneNames}).`
      );
    }
  } else {
    mapVerdict = 'fail';
    mapDetails.push(
      `${sitingConflicts.length} facility placement(s) overlap a no-go zone — not feasible:`
    );
    sitingConflicts.forEach(c => {
      const facilityLabel = getIndustrialSymbolDef(c.placement.type as IndustrialSymbolType).label;
      const zones = c.zoneIds.map(getNoBuildAreaLabel).join(', ');
      mapDetails.push(
        `• ${facilityLabel} at (${c.placement.xPct.toFixed(0)}%, ${c.placement.yPct.toFixed(0)}%) overlaps ${zones}`
      );
      blockers.push({
        kind: 'fail',
        section: 3,
        test: `Siting: ${facilityLabel} clear of the no-go zones`,
        measured: `Placed at (${c.placement.xPct.toFixed(0)}%, ${c.placement.yPct.toFixed(0)}%), inside ${zones}`,
        threshold: 'Zero overlap. A no-go zone is the community\u2019s veto, so this is not a cost to be weighed against benefits',
        remedy: `Move the ${facilityLabel.toLowerCase()} outside ${zones}, or the community withdraws that zone in the negotiation.`,
      });
    });
  }

  const mapSummary =
    mapVerdict === 'pass'
      ? 'No facility overlaps with community no-go zones.'
      : mapVerdict === 'warn'
        ? 'Facility siting could not be fully checked.'
        : `${sitingConflicts.length} facility–no-go conflict(s) on the map.`;

  const sectionVerdicts = [sizeVerdict, envVerdict, mapVerdict];
  let status: FeasibilityResult['status'] = 'optimal';
  if (sectionVerdicts.includes('fail')) {
    status = 'infeasible';
  } else if (sectionVerdicts.includes('warn')) {
    status = 'suboptimal';
  }

  return {
    status,
    blockers,
    sections: {
      sizeAlignment: {
        title: '1. Mine size & no-go limits',
        verdict: sizeVerdict,
        summary: sizeSummary,
        details: sizeDetails,
      },
      environmentalBenefits: {
        title: '2. Environmental & community benefits',
        verdict: envVerdict,
        summary: envSummary,
        details: envDetails,
      },
      mapSiting: {
        title: '3. Map siting (facilities vs no-go zones)',
        verdict: mapVerdict,
        summary: mapSummary,
        details: mapDetails,
      },
    },
  };
}

const VERDICT_STYLES: Record<
  SectionVerdict,
  { badge: string; border: string; bg: string; label: string; Icon: typeof CheckCircle }
> = {
  pass: {
    badge: 'bg-green-100 text-green-800 border-green-300',
    border: 'border-green-200',
    bg: 'bg-white',
    label: 'Pass',
    Icon: CheckCircle,
  },
  warn: {
    badge: 'bg-yellow-100 text-yellow-900 border-yellow-300',
    border: 'border-yellow-200',
    bg: 'bg-white',
    label: 'Warning',
    Icon: AlertTriangle,
  },
  fail: {
    badge: 'bg-red-100 text-red-900 border-red-300',
    border: 'border-red-200',
    bg: 'bg-white',
    label: 'Fail',
    Icon: XCircle,
  },
};

function FeasibilitySectionCard({ section }: { section: FeasibilitySection }) {
  const style = VERDICT_STYLES[section.verdict];
  const Icon = style.Icon;

  return (
    <div
      className={clsx(
        'rounded-lg border-2 p-4 text-left',
        style.border,
        style.bg
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-lg font-bold text-gray-900">{section.title}</h3>
        <span
          className={clsx(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold border',
            style.badge
          )}
        >
          <Icon size={16} />
          {style.label}
        </span>
      </div>
      <p className="text-base font-medium text-gray-800 mb-3">{section.summary}</p>
      <ul className="space-y-1.5 text-sm text-gray-700 leading-relaxed list-none">
        {section.details.map((detail, i) => (
          <li
            key={i}
            className={detail.startsWith('•') ? 'pl-1' : 'pl-5 relative before:content-["•"] before:absolute before:left-0'}
          >
            {detail.startsWith('•') ? detail.slice(2) : detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const AdminView: React.FC = () => {
  const [communityData, setCommunityData] = useState<CommunityResult | null>(null);
  const [developerData, setDeveloperData] = useState<DeveloperResult | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<'community' | 'developer', string | null>>({
    community: null,
    developer: null,
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'community' | 'developer') => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      const text = (evt.target?.result as string) ?? '';

      const check = checkCsvForSlot(text, type);
      if (!check.ok) {
        setUploadErrors(prev => ({ ...prev, [type]: check.message ?? 'This file could not be read.' }));
        input.value = '';
        return;
      }

      const data = parseCSV(text, type);
      if (!data) {
        setUploadErrors(prev => ({
          ...prev,
          [type]: 'That file has a header row but no results row.',
        }));
        input.value = '';
        return;
      }

      setUploadErrors(prev => ({ ...prev, [type]: null }));
      if (type === 'community') setCommunityData(data as CommunityResult);
      else setDeveloperData(data as DeveloperResult);
      input.value = '';
    };
    reader.readAsText(file);
  };

  const sitingConflicts = useMemo(() => {
    if (!communityData || !developerData) return [];
    return findIndustrialNoBuildConflicts(
      developerData.industrialPlacements,
      communityData.consensusAreaIds
    );
  }, [communityData, developerData]);

  const result = useMemo(() => {
    if (!communityData || !developerData) return null;
    return buildFeasibilityAnalysis(communityData, developerData, sitingConflicts);
  }, [communityData, developerData, sitingConflicts]);

  const devBudget = developerData ? developerData.total_budget : null;
  const highlightBenefitIds = communityData?.selectedBenefitIds ?? [];

  return (
    <div className="flex-1 bg-white rounded-xl shadow-lg border border-gray-200 p-8 overflow-auto flex flex-col gap-8">
      <h2 className="text-3xl font-bold text-gray-800 border-b pb-4">Negotiation Analysis Dashboard</h2>

      {communityData && developerData && (
        <AdminNegotiationMap
          noBuildZoneIds={communityData.consensusAreaIds}
          industrialPlacements={developerData.industrialPlacements}
          className="w-full"
        />
      )}

      <div className="grid grid-cols-2 gap-12">
        <div
          className={clsx(
            'p-6 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-colors',
            communityData ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-400'
          )}
        >
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <FileText size={32} className="text-blue-600" />
          </div>
          <div className="text-center">
            <h3 className="font-bold text-lg mb-2">Community Results</h3>
            {uploadErrors.community && (
              <p className="text-sm text-red-700 font-medium mb-2 bg-red-50 border border-red-200 rounded-lg p-2 text-left">
                {uploadErrors.community}
              </p>
            )}
            {communityData ? (
              <div className="text-sm text-green-700 font-mono mb-2 text-left bg-white p-3 rounded border border-green-200">
                <div className="font-bold border-b border-green-100 pb-1 mb-1">Uploaded Data:</div>
                <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1">
                  <span className="font-semibold text-gray-600">Winner:</span>
                  <span>{SIZE_LABELS[communityData.winnerId]}</span>
                  <span className="font-semibold text-gray-600">No-go:</span>
                  <span>
                    {communityData.consensusAreaIds.length === 0
                      ? 'None'
                      : communityData.consensusAreaIds.join(', ')}
                  </span>
                  <span className="font-semibold text-gray-600">No-go count:</span>
                  <span>
                    {communityData.noGoZoneCount} / max{' '}
                    {communityData.maxNoGoZones ??
                      getMaxNoBuildZonesForCommunityWinner(communityData.winnerId)}
                  </span>
                  <span className="font-semibold text-gray-600">Benefits:</span>
                  <span>{communityData.selectedBenefitIds.length} Selected</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-2 italic">No file uploaded</p>
            )}
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm">
              <Upload size={16} />
              Choose File
              <input
                type="file"
                accept=".csv"
                onChange={e => handleFileUpload(e, 'community')}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div
          className={clsx(
            'p-6 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-colors',
            developerData ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-orange-400'
          )}
        >
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
            <FileText size={32} className="text-orange-600" />
          </div>
          <div className="text-center">
            <h3 className="font-bold text-lg mb-2">Developer Results</h3>
            {uploadErrors.developer && (
              <p className="text-sm text-red-700 font-medium mb-2 bg-red-50 border border-red-200 rounded-lg p-2 text-left">
                {uploadErrors.developer}
              </p>
            )}
            {developerData ? (
              <div className="text-sm text-orange-700 font-mono mb-2 text-left bg-white p-3 rounded border border-orange-200">
                <div className="font-bold border-b border-orange-100 pb-1 mb-1">Uploaded Data:</div>
                <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1">
                  <span className="font-semibold text-gray-600">Size:</span>
                  <span>{developerData.size_km2} km²</span>
                  <span className="font-semibold text-gray-600">Budget:</span>
                  <span>${(developerData.total_budget / 1000000).toFixed(1)}M</span>
                  <span className="font-semibold text-gray-600">Facilities:</span>
                  <span>{developerData.industrialPlacements.length} on map</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-2 italic">No file uploaded</p>
            )}
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors shadow-sm font-medium text-sm">
              <Upload size={16} />
              Choose File
              <input
                type="file"
                accept=".csv"
                onChange={e => handleFileUpload(e, 'developer')}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {result && (
        <div
          className={clsx(
            'p-8 rounded-xl border-4 animate-in fade-in zoom-in duration-500',
            result.status === 'optimal'
              ? 'bg-green-100 border-green-500 text-green-900'
              : result.status === 'suboptimal'
                ? 'bg-yellow-100 border-yellow-500 text-yellow-900'
                : 'bg-red-100 border-red-500 text-red-900'
          )}
        >
          <div className="flex flex-col items-center text-center mb-6">
            <div className="flex justify-center mb-4">
              {result.status === 'optimal' && <CheckCircle size={64} />}
              {result.status === 'suboptimal' && <AlertTriangle size={64} />}
              {result.status === 'infeasible' && <XCircle size={64} />}
            </div>

            <h1 className="text-4xl font-extrabold uppercase mb-2 tracking-widest">
              {result.status === 'optimal'
                ? 'Optimal Solution'
                : result.status === 'suboptimal'
                  ? 'Suboptimal / Warning'
                  : 'Not Feasible'}
            </h1>
            <p className="text-lg font-medium max-w-2xl">
              {result.status === 'optimal'
                ? 'All three checks passed: mine size aligns, environmental and benefit requirements are met, and facilities avoid no-go zones.'
                : result.status === 'suboptimal'
                  ? 'The deal could work, but at least one check raised a warning — review the sections below.'
                  : 'At least one check failed — this submission cannot be accepted as feasible.'}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-1 max-w-4xl mx-auto">
            <FeasibilitySectionCard section={result.sections.sizeAlignment} />
            <FeasibilitySectionCard section={result.sections.environmentalBenefits} />
            <FeasibilitySectionCard section={result.sections.mapSiting} />
            <WhyItFailedCard blockers={result.blockers} />
          </div>
        </div>
      )}

      {/*
        Moved below the feasibility read-out on 31 October 2026. It used to be
        the first thing on this screen, so the first thing a facilitator saw was
        a cloud of 31 abstract dots rather than the answer to the question they
        had just uploaded two files to ask. It is reference material, so it
        reads last.
      */}
      <div className="flex flex-col gap-2">
        <div className="h-96 w-full p-1 flex flex-col min-h-0">
          <BenefitUtilityCostChart
            developerBudget={devBudget}
            highlightBenefitIds={highlightBenefitIds}
            className="flex-1 min-h-0 h-full"
            title="Community Benefit Options Analysis"
          />
        </div>
        <p className="text-sm text-gray-600 max-w-3xl leading-snug">
          Every dot is one of the 31 possible combinations of the five community benefits, placed by
          what the package costs and by a weighted utility score built from the benefits in it. It
          is here to show whether what the community asked for was cheap or expensive next to
          everything else they could have asked for — not to pick a winner, because utility on
          this chart is a scoring convention and not a measure of anything in the ground.
        </p>
      </div>
    </div>
  );
};
