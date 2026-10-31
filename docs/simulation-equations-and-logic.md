# Mining Stakeholder Simulation — Equations & Logic Summary

Consolidated reference for the equations, rules, and data flow used across Community, Developer, Joint, and Admin views.

Related detail:

- [utility-calculation.md](utility-calculation.md) — utility chart deep dive
- [facility-siting-rules.md](facility-siting-rules.md) — industrial placement + spread penalty
- [admin-feasibility.md](admin-feasibility.md) — CSV feasibility verdicts
- [regional-map-no-go-zones.md](regional-map-no-go-zones.md) — map zone geometry

---

## 1. Stakeholder views

| View | PIN | Role |
|------|-----|------|
| Community | 1234 | Vote on mine size, select benefits and no-go zones |
| Developer | 5678 | Lock scenario → site facilities → mitigation → benefits |
| Joint | 9999 | Same gated flow + community map + live utility chart |
| Admin | 5555 | Upload CSVs, feasibility checks, overlap map |

---

## 2. Community voting

**Rewritten 31 October 2026.** Previously: five groups scored six options
(8, 4, 2, 1, 0.5 km² and Oppose) 0–5, and the winner was `argmax(Σ scores)`.
Two faults, both structural.

*Opposition was scored as a size.* Whether to mine and how big to mine were
added on one scale, so a group could score 4 km² a five and Oppose a five in
the same breath and the tally took both.

*A group's weight depended on how generously it scored.* An emphatic group
putting a 5 on one size contributed five points; a hedging group spreading
3, 2 and 1 contributed six. Two groups scoring 8 km² a five could beat three
groups whose first choice was 1 km² and who had all scored 8 km² zero.

### 2.1 Stage one — is there a mine at all?

Each group answers **accept / refuse / no view**. With `G` groups,
`majority = floor(G/2) + 1` (three of five).

```
approved = accepts >= majority
refused  = !approved && (rejects >= majority || abstains == 0)
decided  = approved || refused
```

Abstaining counts toward **neither** side: silence is not consent. The question
can therefore sit unsettled rather than being decided by whoever spoke. Stage
two is locked until `approved`. A refusal exports `winnerId = 'oppose'`.

### 2.2 Stage two — which size, by instant-runoff

Each group scores the five real sizes 0–5. **The scores set the group's order,
not its weight**, and a size scored 0 is *unacceptable* — never a transfer
target.

```
order(group)   = sizes scored > 0, descending; ties break toward the smaller mine
count(size, r) = number of groups whose best surviving size is `size`
active(r)      = groups with any surviving acceptable size
needed(r)      = floor(active(r)/2) + 1

each round: if some size has count >= needed  -> winner
            else eliminate the weakest surviving size and transfer
```

A group whose every acceptable size is eliminated becomes **exhausted** and
leaves the count; `needed` is recomputed against the groups still active. The
raw score sum is still displayed, labelled as *not* what decides the outcome,
and the elimination rounds are shown so a facilitator can point at the transfer
that decided it.

Zeros are also counted and reported per size as refusals, because a zero adds
nothing to a sum and was previously indistinguishable from an unfilled row.

**No group holds a veto.** A size can win while groups call it unacceptable;
those objections are material for the negotiation, not something the vote
resolves.

Implementation and 17 pre-registered checks: `src/data/communityVote.ts`.

### Winner → benefits & no-go limits

| Winner | Benefits allowed | Max no-go zones |
|--------|------------------|-----------------|
| 0.5 km² | 1 | 4 |
| 1 km² | 2 | 3 |
| 2 km² | 3 | 2 |
| 4 km² | 4 | 1 |
| 8 km² | 5 | 0 |
| Oppose | 0 | 4 |

When the winning mine size changes, no-go selections reset if the new limit is lower (e.g. 8 km² → 0 zones).

---

## 3. Mitigation budget (Developer & Joint)

### 3.1 Scenario indices

- **Mine size** → `mineIdx` ∈ {0…4} for {0.5, 1, 2, 4, 8} km²
- **Capacity** → `capacityIdx` ∈ {0…3} for {0.5, 1.5, 3, 5} Mton/yr
- **Facility tier** → air budget add: $0 / $2M / $4M / $6M

### 3.2 Environmental baselines (unmitigated)

**Waste S₀ (tons)** by mine size:

| Mine size | S₀ |
|-----------|-----|
| 0.5 km² | 1,500,000 |
| 1 km² | 4,500,000 |
| 2 km² | 9,000,000 |
| 4 km² | 15,000,000 |
| 8 km² | 25,000,000 |

**Water W₀ (m³)** by capacity:

| Capacity | W₀ |
|----------|-----|
| 0.5 Mton/yr | 250,000 |
| 1.5 Mton/yr | 750,000 |
| 3.0 Mton/yr | 1,500,000 |
| 5.0 Mton/yr | 2,500,000 |

### 3.3 Total mitigation budget

Constants: `MITIGATION_SPEND_MIN_USD = $300,000`,
`MITIGATION_STEP_USD = $2,000,000`, baseline water+waste floors = $600,000.

**Split 31 October 2026.** `MITIGATION_STEP_USD` is the **budget tier** — what
each step up in mine size or production rate adds, and what the ceilings are
built from. It used to double as the slider's step, so the only reachable water
allocations were $0.3M, $2.3M, $4.3M… and a drag to $1M snapped back to $0.3M.
Slider granularity is now `MITIGATION_SLIDER_STEP_USD = $250,000`, which
divides the tier exactly so every tier-aligned figure stays reachable. **No
budget figure changed** — verified against a full 5×4×4 table.

The **air** slider deliberately keeps the $2M step: control equipment is bought
in packages, and `clampAirSpend` snaps to those tiers whatever the slider
offers.

```
scenarioSteps = (mineIdx + capacityIdx) × $2,000,000

totalBudget = $600,000 + scenarioSteps + scenarioSteps + airAlloc
            = $600,000 + 2 × (mineIdx + capacityIdx) × $2,000,000 + airAlloc
```

On **scenario lock**, `totalBudget` is frozen.

### 3.4 Required slider floors (before / at lock)

```
waterFloor = $300,000 + capacityIdx × $2,000,000
wasteFloor = $300,000 + mineIdx × $2,000,000
airFloor   = facility tier budget add (0 / 2M / 4M / 6M)
```

After lock, water/waste/air sliders cannot go below their locked floors.

### 3.5 Water & waste outcome equations

Constants: `α_W = α_S = 0.05`, `K_W = K_S = 0.5`.

```
W_min = α_W × W₀
S_min = α_S × S₀

W_final = W_min + (W₀ − W_min) × exp(−K_W × allocWater / 1,000,000)
S_final = S_min + (S₀ − S_min) × exp(−K_S × allocWaste / 1,000,000)
```

**UI reduction percentages:**

```
waterReduction = (W₀ − W_final) / W₀ × 100%
wasteReduction = (S₀ − S_final) / S₀ × 100%
```

### 3.6 Budget balance

```
communitySpend = Σ cost of selected community benefits  (only after lock)

totalAllocated = allocWater + allocWaste + allocAir + communitySpend

sitingPenaltyUsd = facility spread penalty (§5)

unassignedBudget = totalBudget − totalAllocated − sitingPenaltyUsd

budgetOverrun ⇔ totalAllocated + sitingPenaltyUsd > totalBudget
```

Community benefits can only be added when `unassignedBudget ≥ benefit.cost`. Slider moves are capped so total spend (including spread penalty) does not exceed `totalBudget`.

---

## 4. Community benefit utility (Joint & Admin chart)

### 4.1 Base coefficients

**IDs renamed 31 October 2026.** `research` → `workforce` and `energy` →
`energy_storage`. The old names were actively misleading — the workforce
training benefit was called `research` and the energy storage benefit was
called `energy` — and that is what caused `ELECTRIFICATION_REQUIRES` to be
written as `['workforce', 'research']`, naming a benefit that did not exist, so
the haul fleet could not be electrified for the whole beta. `LEGACY_BENEFIT_IDS`
maps the old names on import.

| Benefit ID | Label (short) | Base utility u | Cost (USD) |
|------------|---------------|----------------|------------|
| workforce | Advanced Manufacturing Workforce Training | 0.33 | 5,000,000 |
| energy_storage | Energy Storage Research Program | 0.27 | 3,000,000 |
| canoe | Underground Canoe System | 0.20 | 425,000 at 1 km², scaling with size |
| irrigation | Irrigation upgrade | 0.13 | 900,000 |
| park | Park / forestry | 0.07 | 700,000 |

The canoe's chart cost is a fixed convention; its **charged** price scales with
mine size (`benefitCostUsd`), and it cannot be delivered at all at 0.5 km² or
8 km² — see `canoeAvailability`.

Base utilities sum to **1.00** when all five benefits are selected.

### 4.2 Lever linkage

| Benefit | Linked lever |
|---------|--------------|
| canoe, irrigation | Water |
| energy_storage, workforce | Waste |
| park | Air |

### 4.2a What benefits do to the physical ledgers

Mostly nothing, and the interface now says so. Two reach the model:

- **workforce + energy_storage together, and only together**, electrify the
  haul fleet: `ELECTRIFICATION_DIESEL_REMOVED_FRACTION = 0.9` of diesel
  particulate removed, and **no** effect on the dust raised by the wheels. At
  the Old Town this reads as roughly a 38% cut in PM2.5 against 6% in PM10.
- **canoe** changes nothing, but is *gated* by the physical model: it needs a
  navigable gallery and enough water held back after closure.

The rest are real commitments with real costs that move no physical figure.

### 4.3 Lever weights (Joint view)

Developer dollar allocations map to weights **w ∈ [0.1, 0.9]** via nearest-neighbor lookup tables in `src/data/benefitLeverWeights.ts`. Dollar amounts pick the weight; they do **not** enter the utility sum directly.

**Admin view:** all lever weights default to **1.0** (no mitigation sliders).

### 4.4 Bundle formulas

```
Cost(bundle)    = Σ cost_i

Utility(bundle) = Σ (baseUtility_i × w_lever(i))
```

Empty bundle → Cost = $0, Utility = 0.

The chart plots all **31 non-empty subsets** of the five benefits.

**Colour changed 31 October 2026.** It used to rank utility red / orange /
green, which moralised (red said a cheap low-utility bundle was a *bad*
bundle, in a model built to refuse an overall score), duplicated the y-axis,
and failed contrast — the green measured 2.22:1 and the orange 2.73:1 against
the panel where a mark needs 3:1, with red-against-green the worst pair for a
colour-blind reader. The budget reference line was *also* green.

Colour now carries affordability, which neither axis shows: one hue at two
prominences, solid for bundles inside the developer's budget and faded for
those above it. This does not depend on hue perception at all. The budget line
is orange at 3.1:1. A black ring marks the current selection.

---

## 5. Industrial facility siting

Rules apply on **Developer** and **Joint** maps in the **siting** phase after scenario lock. See [facility-siting-rules.md](facility-siting-rules.md).

**Workflow phases:** `scenario` → `siting` → `mitigation` → `benefits` (forward-only; Unlock resets). Industrial map placement only in `siting`. Continue from siting requires `validateIndustrialPlacements` to pass.

### 5.1 Required facility counts

**Extraction** (by mine size km²):

| Mine size | Required extraction sites |
|-----------|---------------------------|
| Below 4 (0.5, 1, 2) | 1 |
| 4 | 2 |
| 8 | 3 |

**Refining** (by capacity):

**Revised 31 October 2026** (was 1 / 1 / 2 / 3). A refinery is a large fixed
plant; one train serves a mine up to about 3 Mt/yr.

| Capacity (Mton/yr) | Required refining sites |
|--------------------|-------------------------|
| 0.5, 1.5 or 3.0 | 1 |
| 5.0 | 2 |

**Processing** (facility tier ≥ Processing): exactly **1** site (**revised**;
was one per refining train — a mine has a mill, not a mill per train).

**Advanced manufacturing** (tier = Advanced Manufacturing): exactly **1** additional site.

Maximum pins on the map: **7** at 8 km² / 5 Mt/yr / Advanced Manufacturing
(3 + 2 + 1 + 1). Previously 10.

Total emissions do **not** change with the count: the air model divides each
kind's emission across however many sites of that kind exist, so fewer sites
concentrate the same mass rather than reducing it.

### 5.1a Location rules

Three, where until 31 October 2026 there was only the first:

1. **Extraction within 1 km of the ore body** (`ORE_BODY_REGION`). You cannot
   mine ore you are not standing on.
2. **Nothing but extraction on the ore body.** It was the one piece of ground
   with no rule against building on it, and it is the piece the mine exists to
   remove.
3. **No two facilities within `MIN_FACILITY_SEPARATION_KM` = 0.5 km.** The
   spread penalty rewards clustering with no floor, so the cheapest play was to
   stack the whole chain on one pixel: no cost, every emission source at a
   point, and no siting decision taken at all.

The drag-to-move path excludes the pin being moved from its own separation
check, or a facility collides with itself and cannot be nudged.

Invalid placements are rejected with an alert naming the rule and the distance.

### 5.1b Air shown at siting

Since 31 October 2026 the siting step reports PM10 and PM2.5 at both receptors
live — in a panel beneath the map and as badges over the receptors themselves —
recomputed as pins move, uncontrolled (nothing has been spent yet).

This is the counterweight to clustering, and it is deliberately **not** another
penalty. The counter-force already existed and is physically real; it was
simply invisible at the moment of decision, while the cost of spreading was
immediate and in dollars. Measured at 4 km² / 3.0 Mt/yr, moving the plant off
the ore body takes Old Town PM2.5 from 8.1 to 3.7 µg/m³ and changes the verdict
from *lawful, not healthy* to *healthy*.

### 5.2 Map distance

The regional map represents a **10 km × 10 km** area. Facilities use map coordinates as percent of image width/height:

```
distance_pct(a, b) = √((x_a − x_b)² + (y_a − y_b)²)
distance_km        = distance_pct × (10 / 100)    // 10% = 1 km
```

### 5.3 Facility spread budget penalty

After lock, each placed facility pin is scored by distance to a linked reference (extraction→ore body, refining→extraction, processing→refining, advanced mfg→processing):

```
Per pin: if distance ≤ 1 km (10% map) → penalty rate 0
         else → penalty rate = distance_pct

totalPenaltyPct = min(100, sum of per-pin penalty rates)
sitingPenaltyUsd = grossUnassigned × totalPenaltyPct / 100
grossUnassigned = totalBudget − water − waste − air − community_benefits
```

There is **no distance cap** above 1 km — penalty scales with map distance %. Constants: `src/data/facilitySpreadPenalty.ts`.

---

## 6. No-go zones & map geometry

### 6.1 Max zones by technical mine size (km²)

| Mine size (km²) | Max no-go zones |
|-----------------|-----------------|
| < 0.8 | 4 |
| ≥ 0.8, < 1.5 | 3 |
| ≥ 1.5, < 3.5 | 2 |
| ≥ 3.5, < 6 | 1 |
| ≥ 6 (8 km²) | 0 |

Community limits use the **voting winner** table (§2). See [regional-map-no-go-zones.md](regional-map-no-go-zones.md) for overlay coordinates.

### 6.2 Point-in-zone test

```
In no-go zone ⇔ (xPct, yPct) lies inside any selected zone rectangle
```

Industrial and community-benefit symbols cannot be dropped inside selected no-go areas.

### 6.3 Admin overlap check

```
Conflict ⇔ industrial facility (x, y) lies inside any community no-go rectangle
```

Implemented in `src/data/mapOverlap.ts` (`findIndustrialNoBuildConflicts`).

---

## 7. Admin feasibility verdict

After uploading **community_results.csv** and **mining_simulation_results.csv**,
three sections are evaluated, then a closing read-out. Any **Fail** → **Not
Feasible**; warnings only → **Suboptimal / Warning**; all pass → **Optimal**.

### Section 1 — Mine size

**Opposition is no longer a size.** A community voting against a mine used to be
scored as a five-step gap on the size ladder, which read as *"you wanted
different sizes"* when what happened was a refusal. It is now its own failure,
with the remedy stated plainly: no benefits package buys consent withheld in
principle, and a smaller mine does not answer a vote about whether to mine.

Otherwise, sizes are ordered 8 → 4 → 2 → 1 → 0.5 km² and

```
sizeGap = |index(community winner) − index(developer size_km2)|
```

| sizeGap | Verdict |
|---------|---------|
| 0 | Pass |
| 1–2 | Warning |
| ≥ 3 | Fail |

**No-go zones are not judged here.** This section used to fail a plan whenever
the community had designated more zones than the *developer's* chosen size
allowed, which is backwards — a no-go zone is the community's veto and the
developer choosing a larger mine cannot delete it. Counts are reported as
context; the verdict lives with the overlap, in Section 3. The only failure this
section raises about zones is a genuinely inconsistent community file.

### Section 2 — Environmental & community benefits

**Rewritten in October 2026.** This section used to apply two hard-coded limits
(`final_water ≤ 800,000 m³`, `final_waste ≤ 5,000,000 tons`) that had no source
and — worse — were applied only when the community happened to request a
related benefit, so the same physical plan passed or failed depending on what
was asked for. Both are gone.

It now reads the physical ledgers in `src/model` and asks what actually breaks:

- **Water balance** — pumping against natural recharge; above 1× the shortfall
  comes out of storage.
- **Old Cistern** and **agricultural wells** — drawdown against available
  column, with the cost to avert each, or `null` where no spend reaches it.
- **Waste and land** — tonnages, and whether disturbed ground fits the licence.
- **Air** — PM10 and PM2.5 at the Old Town and campus against the EU limit
  values (binding) and WHO guidelines (advisory). An exceedance of a limit value
  is a **refusal**, not a warning: no benefits package offsets binding law.
- **Benefits funding** — every benefit in the community CSV must appear in the
  developer's package; each missing one is priced against the unassigned budget.

> Until 31 October 2026 the air block was nested inside the `else` of the
> footprint check, so **any plan exceeding the licence area skipped air
> entirely** — the largest plans, which are the ones most likely to breach a
> limit value, were skipping the only legally binding test in the model.

### Section 3 — Map siting

Any industrial facility inside a community no-go zone → **Fail**, listed per
facility with coordinates and the zone it overlaps.

### The closing read-out — "Why it came out this way"

Added 31 October 2026. The three section cards narrate, and a narration does not
give you a threshold: testers could read all three and still not answer *why did
we fail, and by how much*. Every fail and warn now also records four things:

```
Blocker {
  kind:      'fail' | 'warn'
  test:      what was tested, in the terms the model tests it in
  measured:  what this plan does
  threshold: what it had to do
  remedy:    what would change it, or null where nothing would
}
```

`remedy: null` is a real answer, not a gap: some harms are not purchasable, and
the card says so rather than quoting a figure that would not work. Failures are
listed before warnings.

---

## 8. CSV export fields (Developer / Joint)

Key columns in `mining_simulation_results.csv` / `joint_negotiation_results.csv`:

| Column | Meaning |
|--------|---------|
| `size_km2`, `capacity_mton` | Locked scenario |
| `total_budget` | Frozen mitigation budget |
| `water_alloc`, `waste_alloc`, `air_alloc` | Slider spend |
| `community_alloc` | Sum of funded benefit costs |
| `final_water_m3`, `final_waste_ton` | Mitigation outcomes |
| `selected_benefits` | Pipe-separated benefit IDs |
| `industrial_placements` | `type:x,y` pairs (map %) |
| `facility_spread_pct` | Avg chain spread |
| `siting_penalty_pct`, `siting_penalty_usd` | Spread penalty |
| `no_build_zones` | Joint only — pipe-separated zone IDs |

---

## 9. Implementation reference

| Topic | Primary files |
|-------|----------------|
| Budget & sliders | `src/hooks/useMitigationBudgetV2.ts`, `src/data/mitigationConstants.ts` |
| Utility chart | `src/components/BenefitUtilityCostChart.tsx`, `src/data/benefitLeverWeights.ts` |
| Community benefits | `src/data/communityBenefits.ts` |
| Facility counts | `src/data/industrialPlacementRules.ts` |
| Spread penalty | `src/data/facilitySpreadPenalty.ts` |
| No-go zones | `src/data/noBuildAreas.ts`, `src/components/map/noBuildZones.ts` |
| Map overlap | `src/data/mapOverlap.ts` |
| Admin feasibility | `src/components/AdminView.tsx` |
| Community voting | `src/components/CommunityView.tsx` |
| Map UI | `src/components/map/DraggableRegionalMap.tsx`, `src/components/map/NoBuildOverlays.tsx` |

---

## 10. Brief narrative (for slides or reports)

> Stakeholders negotiate a lithium mine by voting on scale, choosing community benefits and no-go zones, and allocating a mitigation budget across water, waste, and air. Environmental outcomes follow exponential decay curves driven by slider spend. Bundle **utility** scores community benefit packages using fixed base weights scaled by mitigation investment on linked levers; **cost** is the sum of benefit price tags. After locking the scenario, developers place an industrial chain whose site counts depend on mine size, capacity, and facility tier; spreading facilities apart triggers a graduated budget penalty. Administrators judge feasibility by aligning community and developer CSVs on mine size, environmental limits, benefit funding, and whether any facility sits inside a community no-go zone.
