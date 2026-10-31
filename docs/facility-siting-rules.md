# Industrial Facility Siting Rules

**Mining Stakeholder Simulation — Technical Developer View (PIN 5678)**

After locking the scenario, technical teams follow a **gated sequence**: site facilities → allocate mitigation → select community benefits. Placement counts must match mine size, capacity, and facility tier before continuing past siting or exporting.

---

## 1. When rules apply

Workflow phases (Developer PIN `5678` and Joint PIN `9999`):

1. **Scenario** — choose mine size, capacity, facility; **Lock scenario**
2. **Siting** — place industrial icons on the map (only phase where industrial drag/drop is enabled). **Continue** stays disabled until all required facilities are valid.
3. **Mitigation** — water / waste / air sliders only
4. **Benefits** — community benefit selection (and Joint map benefit pins); export / submit

Unlock scenario resets to phase 1 and clears placements and benefits.

- **Export** / Joint Submit is blocked until phase **Benefits**.
- Extraction must be within 1 km of the ore body; out-of-range drops show an alert.
- **Nothing but extraction may stand on the ore body** (revised 31 Oct 2026).
- **No two facilities within 0.5 km of each other** (revised 31 Oct 2026).

---

## 2. Extraction (by mine size)

| Mine size (km²) | Required extraction sites |
|-----------------|---------------------------|
| Below 4 (0.5, 1, 2) | **1** |
| 4 | **2** |
| 8 | **3** |

*Note: There is no 6 km² option; 4 km² uses the 2-site rule.*

**Location rule:** Each extraction site must be within **1 km** of the ore body region (Euclidean distance to the ore rectangle). Invalid drops show an alert with the distance.

Extraction is the **only** facility permitted on the ore body itself. Everything else must be clear of it: that ground is going to be excavated, so a plant built there would have to be demolished to reach the ore.

---

## 3. Refining (by capacity)

Refining requirements follow **capacity** regardless of facility tier.

**Revised 31 October 2026** (was 1 / 1 / 2 / 3). A refinery is a large fixed plant and one train serves a mine up to about 3 Mt/yr; a second is added only at the largest rate. The old table put ten pins on the map at the top scenario, which beta testers found tedious rather than instructive, and which no operator would build.

| Capacity (Mton/yr) | Required refining sites |
|--------------------|-------------------------|
| 0.5, 1.5 or 3.0 | **1** |
| 5.0 | **2** |

---

## 4. Processing (facility tier ≥ Processing)

When **Facility** is **Processing** or **Advanced Manufacturing**:

- Place **exactly 1** processing site (**revised 31 October 2026**; was one per refining site). A mine has a mill, not a mill per refining train.
- Processing may be placed anywhere off the ore body, subject to the 0.5 km separation rule. Spread from refining is discouraged via the **facility spread budget penalty** (§9), not a hard distance limit.

---

## 5. Advanced manufacturing (facility tier = Advanced Manufacturing)

- Place **exactly 1** advanced manufacturing site in addition to extraction, refining, and processing requirements above.

---

## 6. Facility tier summary

| Facility tier | Extraction | Refining | Processing | Advanced mfg |
|---------------|------------|----------|------------|--------------|
| Extraction | ✓ (by mine) | ✓ (by capacity) | — | — |
| Refining | ✓ | ✓ | — | — |
| Processing | ✓ | ✓ | ✓ (1 site) | — |
| Advanced Manufacturing | ✓ | ✓ | ✓ (1 site) | ✓ (1 site) |

**Maximum pins on the map:** 7, at 8 km² / 5 Mt/yr / Advanced Manufacturing (3 + 2 + 1 + 1). Previously 10.

Total emissions do not change with the count. The air model divides each kind's emission across however many sites of that kind exist, so fewer sites concentrate the same mass rather than reducing it — fewer pins changes the geography of the plume, not its size.

---

## 7. Map UI feedback

- **1 km scale bar** in the bottom-left: width is **10% of the map image** (10 km × 10 km extent), measured against the image overlay box. Rendered as a bordered white plaque since 31 October 2026 — the previous version was legible in principle and invisible in practice against a dark aerial photograph. Its width must stay a percentage of the map: the bar's length *is* the distance, so a fixed pixel width would be wrong at every size but one.
- Footer shows progress, e.g. `extraction 1/1 · refining 2/2`.
- Dropping over the limit, more than 1 km from the ore body (extraction), on the ore body (anything else), or within 0.5 km of another facility shows an alert.
- Spreading facilities apart increases the **facility spread cost** on unassigned budget (§9).

---

## 8. Admin validation

After export, the Administrator upload checks facility coordinates against community no-go zones:

- Developer CSV field: `industrial_placements` (type + x/y percent)
- Overlap detection: `findIndustrialNoBuildConflicts` in `src/data/mapOverlap.ts`
- Visualized on **AdminNegotiationMap**; failures block feasibility (Section 3)

See [admin-feasibility.md](admin-feasibility.md).

---

## 9. Facility spread budget penalty

After scenario lock, each placed facility is scored by **map distance** to a linked reference. Penalties **sum** across all pins (capped at 100%) and reduce **unassigned budget** only (Potential Investment is unchanged).

### Linked references

| Facility type | Linked to | Free zone |
|---------------|-----------|-----------|
| Extraction | **Ore Body** region (map rectangle) | ≤ 1 km |
| Refining | Nearest **extraction** pin | ≤ 1 km |
| Processing | Nearest **refining** pin | ≤ 1 km |
| Advanced manufacturing | Nearest **processing** pin | ≤ 1 km |

If distance ≤ 1 km → **0%** penalty for that pin. If farther → penalty rate = **distance %** on the 10 km map (e.g. 2.5 km → 25% penalty rate for that pin). There is **no upper distance cap** — penalty scales with distance above 1 km.

If the upstream reference is not placed yet (e.g. refining before extraction), that pin contributes 0% until the reference exists.

### Dollar impact

```
gross_unassigned = total_budget − water − waste − air − community_benefits
total_penalty_pct = min(100, sum of per-pin penalty rates)
siting_penalty_usd = gross_unassigned × total_penalty_pct / 100
displayed_unassigned = gross_unassigned − siting_penalty_usd
```

### Why there is now a floor as well as a penalty

The penalty rewards clustering with no lower bound, so before 31 October 2026 the cheapest play was to stack the whole chain on a single pixel of the ore body: no penalty, every emission source at one point, and no siting decision taken at all. The 0.5 km separation rule and the ore-body exclusion put a floor under it. The trade-off the exercise wants — cluster for cost, spread for air quality at the Old Town — is unaffected.

Constants: `SITING_FREE_DISTANCE_PCT = 10` (1 km) in `src/data/facilitySpreadPenalty.ts`; `MIN_FACILITY_SEPARATION_KM = 0.5` and `EXTRACTION_MAX_KM_FROM_ORE_BODY = 1` in `src/data/mapScale.ts`. UI shows **Facility spread cost** when penalty &gt; 0. CSV export adds `facility_spread_pct` (mean link distance), `siting_penalty_pct`, and `siting_penalty_usd`.

---

## Implementation

Logic lives in `src/data/industrialPlacementRules.ts` and `src/data/facilitySpreadPenalty.ts`, enforced in `DraggableRegionalMap.tsx` and `useMitigationBudgetV2.ts`.
