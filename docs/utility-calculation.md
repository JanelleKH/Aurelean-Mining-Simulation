# Community Benefit Utility — Technical Documentation

**Mining Stakeholder Simulation**  
*How bundle utility and cost are defined for the negotiation dashboard*

---

## 1. Purpose

The **utility–cost chart** compares every possible combination of community benefits. For each bundle it shows:

- **Cost (X-axis):** total dollars to fund all benefits in the bundle
- **Utility (Y-axis):** a weighted score of community value for that bundle

The chart supports negotiation by showing trade-offs: cheaper bundles vs higher-utility bundles, relative to the developer’s community-benefits budget (green vertical line).

Utility is **not** the same as admin “feasibility” (water/waste limits, mine size, siting conflicts). It is a **design metric** for comparing benefit packages.

---

## 2. Community benefits — base coefficients

Each benefit has a fixed **base utility** (u) and **cost** (c). These are constants in the model.

> **IDs renamed 31 October 2026.** `research` → `workforce`, `energy` →
> `energy_storage`. The old names named the wrong thing: the workforce training
> benefit was called `research` and the energy storage benefit was called
> `energy`. `LEGACY_BENEFIT_IDS` maps the old names on import.

| Benefit ID   | Label (short)              | Base utility (u) | Cost (USD)   |
|-------------|----------------------------|------------------|--------------|
| workforce   | Advanced Manufacturing Workforce Training | **0.33**         | $5,000,000   |
| energy_storage | Energy Storage Research Program        | **0.27**         | $3,000,000   |
| canoe       | Underground canoe          | **0.20**         | $2,500,000   |
| irrigation  | Irrigation upgrade         | **0.13**         | $900,000     |
| park        | Park / forestry            | **0.07**         | $700,000     |

The canoe's figure here is the **chart's** convention. Its charged price scales
with mine size (`benefitCostUsd`), and at 0.5 km² and 8 km² it cannot be
delivered at any price — see `canoeAvailability`.

**Notes:**

- Base utilities sum to **1.00** if all five benefits are selected.
- Higher base utility = higher modeled community value per benefit.
- Cost is additive: bundle cost = sum of individual costs.

---

## 3. Environmental lever linkage

Each benefit is tied to one mitigation lever. Developer spending on that lever **scales** how much that benefit contributes to utility (Joint view only; see §5).

| Benefit    | Linked lever | Rationale (conceptual)                          |
|-----------|--------------|--------------------------------------------------|
| canoe     | **Water**    | Water-dependent recreation / aquifer use         |
| irrigation| **Water**    | Agricultural water systems                       |
| energy_storage | **Waste** | Land / waste-related industrial benefit |
| workforce | **Waste** | Tied to waste / land remediation research |
| park      | **Air**      | Forestry / air-quality-related green space       |

---

## 4. Lever weight lookup tables

Developer **dollar allocations** (water, waste, air mitigation sliders) are mapped to **weights** w ∈ [0.1, 0.9].

The dollar amount is **only** used to pick the weight; it does **not** enter the utility sum directly.

**Lookup rule:** For each lever, find the table row whose spend value is **closest** to the current allocation (nearest rung). Below minimum → lowest rung; above maximum → highest rung.

### Water mitigation → weight

| Spend (USD)   | Weight (w_water) |
|---------------|------------------|
| $300,000      | 0.10             |
| $2,300,000    | 0.37             |
| $4,300,000    | 0.63             |
| $6,300,000    | 0.90             |

### Waste mitigation → weight

| Spend (USD)   | Weight (w_waste) |
|---------------|------------------|
| $300,000      | 0.10             |
| $2,300,000    | 0.30             |
| $4,300,000    | 0.50             |
| $6,300,000    | 0.70             |
| $8,300,000    | 0.90             |

### Air mitigation → weight

| Spend (USD)   | Weight (w_air) |
|---------------|----------------|
| $0            | 0.10           |
| $2,000,000    | 0.37           |
| $4,000,000    | 0.63           |
| $6,000,000    | 0.90           |

**Interpretation:** More mitigation spend on a lever increases the weight for benefits linked to that lever, so their contribution to total utility rises. Low spend reduces their apparent value on the chart.

---

## 5. Core formulas

### Bundle cost

```
Cost = Σ (cost of each selected benefit)
```

### Bundle utility (general)

```
Utility = Σ (base utility_i × weight_lever(i))
```

where:

- `base utility_i` = base utility from Table §2
- `weight_lever(i)` = weight for the lever linked to benefit *i* (Table §3 + §4)

### Default weights (Admin dashboard)

When water/waste/air allocations are **not** supplied, all lever weights default to **1.0**:

```
Utility_admin = Σ base utility_i
```

### Empty bundle

No benefits selected → Cost = **$0**, Utility = **0**.

---

## 6. Worked examples

### Example A — Admin view (weights = 1.0)

**Bundle:** canoe + irrigation

| Component   | Calculation        | Value  |
|------------|--------------------|--------|
| Cost       | $2.5M + $0.9M      | **$3.4M** |
| Utility    | 0.20 + 0.13        | **0.33**  |

**Bundle:** all five benefits

| Component   | Calculation                          | Value    |
|------------|--------------------------------------|----------|
| Cost       | $5.0 + $3.0 + $2.5 + $0.9 + $0.7 M   | **$12.1M** |
| Utility    | 0.33 + 0.27 + 0.20 + 0.13 + 0.07     | **1.00**   |

### Example B — Joint view (mitigation affects weights)

Suppose developer allocations map to:

- w_water = **0.90** (high water spend, e.g. ~$6.3M)
- w_waste = **0.50** (mid waste spend, e.g. ~$4.3M)
- w_air = **0.10** (low air spend, e.g. ~$0)

**Bundle:** canoe + irrigation + park

| Benefit    | Lever | Base u | Weight | Contribution |
|-----------|-------|--------|--------|--------------|
| canoe     | water | 0.20   | 0.90   | 0.180        |
| irrigation| water | 0.13   | 0.90   | 0.117        |
| park      | air   | 0.07   | 0.10   | 0.007        |
| **Total** |       |        |        | **Utility = 0.304** |

Cost (unchanged by weights): $2.5M + $0.9M + $0.7M = **$4.1M**

Water-linked benefits dominate utility; park contributes little when air mitigation is low.

---

## 7. Chart UI (Admin & Joint)

- **Description** under the chart title explains how utility and cost are computed.
- **Hover any dot** for a 3–4 sentence tooltip: benefits included, per-benefit calculation, totals, percentile band, and whether it is the current selection.
- **Dot colour** shows **affordability**, not utility rank: solid = inside the developer's budget, faded = above it. **Black ring** = current team selection.

---

## 8. Chart construction

The scatter plot includes:

| Element | Count / rule |
|--------|----------------|
| Benefit bundles plotted | **31** (every non-empty subset of 5 benefits) |
| Optional empty point | 1 (cost 0, utility 0) |
| X-axis | Community benefit cost ($0–$20M scale) |
| Y-axis | Weighted utility (auto-scaled) |
| Orange dashed vertical line | Developer’s allocated community-benefits budget |
| Black ring on a dot | Current selection (community CSV on Admin; funded benefits on Joint) |

---

## 9. Dot colour (affordability)

Dot colour is **visual only**; it does not change the utility number.

| Appearance | Meaning |
|------------|---------|
| Solid blue | The developer's budget covers this bundle |
| Faded blue | This bundle costs more than the budget |
| Gray | The empty bundle — no benefits selected |
| Black ring | The current selection, whatever its colour |

**Changed 31 October 2026.** Colour used to rank utility red / orange / green.
That was wrong three ways:

1. **It moralised.** Red said a cheap low-utility bundle was a *bad* bundle — a
   verdict, in an instrument built specifically to refuse an overall score.
2. **It was redundant.** Utility is already the y-axis, so colour repeated the
   vertical position and said nothing new.
3. **It failed contrast.** The green measured 2.22:1 and the orange 2.73:1
   against the panel background, where a mark needs 3:1; and red-against-green
   is the worst possible pair for a colour-blind reader. The budget reference
   line was *also* green, which is why it was invisible among the green dots.

Colour now carries the one thing neither axis shows — whether the bundle fits
the budget — as a single hue at two prominences, which does not depend on hue
perception at all. The budget line is orange at 3.1:1.

Utility rank survives as words in the hover tooltip, where a rank belongs.

---

## 10. Where this applies in the app

| View | PIN | Lever weights | Highlighted bundle |
|------|-----|---------------|-------------------|
| **Admin** | 5555 | Fixed at 1.0 (no mitigation sliders) | Benefits from uploaded community CSV |
| **Joint** | 9999 | Live from water / waste / air sliders | Benefits funded in developer panel |

Admin focuses on **static** comparison of community choices vs developer budget.

Joint shows how **mitigation investment** reshapes the value of different benefit packages in real time.

---

## 11. What utility does *not* include

Utility **does not** incorporate:

- Community voting matrix or winning mine size
- No-go zone selections or facility siting conflicts
- Hard feasibility checks (e.g. water ≤ 800k m³, waste ≤ 5M tons)
- Whether the developer actually funded all requested benefits

Those are handled elsewhere (Admin negotiation logic, CSV checks, overlap map).

---

## 12. Brief explanation (for slides or verbal context)

> **Utility** measures how valuable a *package* of community benefits is. Each benefit has a fixed base score (workforce training highest at 0.33, park lowest at 0.07). Bundle utility is the sum of those scores, optionally scaled by how much the developer invests in water, waste and air mitigation—because canoe and irrigation depend on water outcomes, energy storage and workforce training on waste, and park on air. **Cost** is simply the sum of benefit price tags. The chart plots all 31 possible bundles so teams can see efficient against expensive choices. Solid dots are bundles the developer's budget covers and faded dots cost more than it; the orange line is that budget, and the black ring is the team's current pick. Utility is the vertical axis, so colour is not used to repeat it.
>
> Utility here is a **scoring convention for ranking packages against one another**, not a measurement of anything in the ground. The water, waste and air ledgers are the physical model, and they are never summed.

---

## Implementation reference

Coefficients and tables are defined in:

- `src/components/BenefitUtilityCostChart.tsx` — base utilities, costs, chart logic
- `src/data/benefitLeverWeights.ts` — lever linkage and weight lookup tables
