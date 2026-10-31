# Admin Feasibility Analysis

**Mining Stakeholder Simulation — Administrator view (PIN 5555)**

After uploading the Community and Developer CSV exports, the dashboard runs three feasibility checks and shows an overall verdict: **Optimal**, **Suboptimal / Warning**, or **Not Feasible**.

The utility–cost scatter chart is a separate design metric; see [utility-calculation.md](utility-calculation.md).

---

## 1. Workflow

1. Open Admin view (PIN `5555`).
2. Upload **community_results.csv** (Community view, PIN `1234`).
3. Upload **mining_simulation_results.csv** (Developer view, PIN `5678`).
4. Review the **overlap map** (no-go zones vs facility placements).
5. Read the **three-section feasibility panel** below the upload cards.

---

## 2. Overall verdict

| Verdict | Meaning |
|---------|---------|
| **Optimal** | All three sections pass with no warnings. |
| **Suboptimal / Warning** | No section failed, but at least one raised a warning (e.g. mine sizes close but not identical, or unfunded benefits). |
| **Not Feasible** | At least one section failed (hard blocker). |

Any **Fail** in any section → **Not Feasible**. Warnings alone → **Suboptimal**.

---

## 3. Section 1 — Mine size

Checks that the community and the developer are negotiating the same project.

### A refusal is not a size gap

If the community voted **against a mine at all** (`winnerId = 'oppose'`, the
recorded outcome of stage one), this section **fails** on its own terms. It is a
refusal, not a disagreement about scale, and the remedy line says so: no
benefits package buys consent withheld in principle, and shrinking the mine does
not answer a vote about whether to mine.

### Mine size alignment

Otherwise the community **winner** is compared to the developer's **technical**
size (`size_km2` in the CSV):

| Size gap (steps) | Section verdict | Meaning |
|------------------|-----------------|---------|
| 0 | Pass | Both sides targeted the same mine scale. |
| 1–2 | Warning | Close but not identical; deal may still work. |
| 3+ | Fail | Sizes too far apart — not feasible. |

Mine size tiers (ordered): 8 km² → 4 km² → 2 km² → 1 km² → 0.5 km².

### No-go zones are not judged here

Only one no-go failure is raised in this section, and it is about the **file**,
not the plan: the community CSV must be internally consistent (its
`noGoZoneCount` must match the zones it lists, and must not exceed the maximum
for the winning size — see
[regional-map-no-go-zones.md](regional-map-no-go-zones.md)).

Whether the **developer respected** those zones is tested one way only, by
actual overlap, in Section 3. This section used to also fail a plan whenever the
community had designated more zones than the *developer's* chosen size allowed.
That was backwards: a no-go zone is the community's veto, and a developer
choosing a larger mine cannot delete it. The count is reported here as context —
at a larger mine the developer simply has less room to site around them.

---

## 4. Section 2 — Environmental & community benefits

Reads the physical ledgers in `src/model` and asks what actually breaks.

> **Replaced in October 2026.** This section used to apply two hard-coded
> limits — `final_water ≤ 800,000 m³` and `final_waste ≤ 5,000,000 tons` —
> that had no source behind them and, worse, were applied **only when the
> community happened to request a related benefit**. The same physical plan
> therefore passed or failed depending on what had been asked for. Both are
> gone.

### Water

- **Balance**: pumping as a multiple of natural recharge. Above 1× the shortfall
  comes out of stored water and the table keeps falling.
- **Old Cistern** and **agricultural wells**: transient (Theis) drawdown against
  the available column, with the spend that would avert it — or `null` where no
  affordable spend reaches it, which is a real answer rather than a gap.
- Dewatering scales with the aquifer captured **and with production rate**:
  mining slowly pumps for longer, mining quickly pre-drains harder.

### Waste and land

- Waste rock and tailings follow the **tonnage mined**, not the licence area.
- Disturbed ground (dumps + impoundment) against the community licence area.
  Over → **Fail**: more tailings underground, a larger licence, or the plan does
  not fit the ground it was given.

### Air

Computed from **where the facilities actually are** in the developer CSV.

- PM10 and PM2.5 annual means at the Old Town and the University Campus.
- **EU limit values** (40 and 25 µg/m³) are binding law — an exceedance is a
  **refusal**, not a warning, and no benefits package offsets it.
- **WHO guidelines** (15 and 5) are advisory and about five times stricter. An
  operation can sit lawfully between the two for its whole life; that gap is
  what the community has to argue in.

### Benefits funding

Every benefit ID in the community CSV must appear in the developer’s `selected_benefits`:

- All funded → Pass (for this sub-check).
- Any missing → **Warning**. Each missing benefit is named **with its price**
  and set against the unassigned budget, so the read-out distinguishes *could
  not afford it* from *chose not to fund it*.

---

## 5. Section 3 — Map siting (facilities vs no-go zones)

Industrial facilities from the developer CSV (`industrial_placements`) must not sit inside community no-go zones.

### Overlap map (`AdminNegotiationMap`)

Shown above the feasibility panel when both CSVs are loaded:

| Visual | Meaning |
|--------|---------|
| Red border + fill | Community no-go zone |
| Circle icon | Industrial facility (extraction, refining, etc.) |
| **Amber ring** | Facility inside a no-go zone (**conflict**) |

### Section rules

| Condition | Verdict |
|-----------|---------|
| No facility placements in CSV | Warning — siting could not be verified |
| Facilities present, none overlap no-go zones | Pass |
| One or more facilities overlap a no-go zone | **Fail** — each conflict listed with facility type and zone name |

Overlap logic: `findIndustrialNoBuildConflicts` in `src/data/mapOverlap.ts` (point-in-rectangle against `noBuildZones.ts`).

Facility placement rules on the Developer map: [facility-siting-rules.md](facility-siting-rules.md).

---

## 6. The closing read-out — "Why it came out this way"

Added 31 October 2026, below the three section cards.

The section cards narrate, and a narration does not give you a threshold: beta
testers could read all three and still not answer *why did we fail, and by how
much*. "The developer did not fund the irrigation system" does not tell anyone
what funding it would have cost.

Every fail and every warning therefore also records four things:

| Field | Meaning |
|-------|---------|
| `test` | What was tested, in the terms the model tests it in |
| `measured` | What this plan does |
| `threshold` | What it had to do to pass |
| `remedy` | What would change it, or `null` where nothing would |

`remedy: null` is a real answer rather than a gap in the model — some harms are
not purchasable, and the card says so instead of quoting a figure that would not
work. Failures are listed before warnings, and each carries the section it came
from.

---

## 7. Related dashboard elements

| Element | Purpose |
|---------|---------|
| Utility–cost chart | Compare all 31 benefit bundles vs developer budget (not feasibility) |
| Overlap map | Visual siting check |
| Three-section panel | Plain-language pass/warn/fail for each category |
| "Why it came out this way" | Every failure and warning with measurement, threshold and remedy |
| Upload summaries | Parsed winner, no-go zones, size, budget, facility count |

---

## Implementation

- `src/components/AdminView.tsx` — CSV parsing, `buildFeasibilityAnalysis`, section cards
- `src/components/WhyItFailedCard.tsx` — the `Blocker` type and the closing read-out
- `src/model/` — the water, waste and air ledgers this section reads
- `src/components/map/AdminNegotiationMap.tsx` — overlap visualization
- `src/data/noBuildAreas.ts` — zone limits and labels
- `src/data/mapOverlap.ts` — conflict detection
