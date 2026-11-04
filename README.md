# Mining Stakeholder Simulation

A multi-role decision support tool for simulating negotiations between a **Mining Developer** and a **Community Group**, overseen by an **Administrator**.

## 🚀 Live Access
**URL**: [https://aurelean-mining-simulation.vercel.app/](https://aurelean-mining-simulation.vercel.app/)

Also live, and serving the same build: `https://caceres-mining-simulation.vercel.app/`

> ### ⚠️ One letter separates a working address from the wrong application
>
> | Hostname | Serves |
> |---|---|
> | `aurelean-mining-simulation.vercel.app` | **this repo** — *Aurelean Mountain — Mining Simulation* |
> | `ca`**`c`**`eres-mining-simulation.vercel.app` | **this repo** — same build (note the **C**) |
> | `ca`**`s`**`eres-mining-simulation.vercel.app` | a **different, older project** titled *community-benefit-unlocker* (note the **S**) |
>
> The `cas`‑ spelling is not a stale copy of this app. It is a different
> application that loads without complaint, so anyone opening it has no signal
> that they are in the wrong place. Verified 31 October 2026 by comparing
> deployed bundle hashes and page titles.
>
> **Prefer the `aurelean-` address everywhere.** It matches the project, the
> repository and the simulation, and it has no near-miss twin.
>
> **Why the near-miss exists.** This project descends from an earlier one, and
> the lineage is visible in the names: an original built elsewhere, then
> `Caceres-Mining-Simulation` under this account, then the rename to
> `Aurelean-Mining-Simulation`. The `cac`‑ hostname is this project's own
> earlier name and still points here. The `cas`‑ hostname belongs to the
> predecessor and is not under this account's control — it cannot be taken
> down from here, only stopped from being quoted. Older slide decks still
> carry it; the 25 October briefings do not.

---

## 🔑 Access Codes (PINs)
To ensure role separation, each interface is protected by a PIN code.

| Role | PIN | Description |
|---|---|---|
| **Community Group** | `1234` | Selects mine size preference, no-go zones, and community benefits. |
| **Mining Developer** | `5678` | Configures mine size/capacity, mitigation budget, and facility siting. |
| **Joint Negotiation** | `9999` | Combined community + developer view for live negotiation. |
| **Administrator** | `5555` | Uploads both CSVs to assess feasibility, map conflicts, and benefit fit. |

> **How to Change PINs:**
> 1. Open `src/App.tsx`.
> 2. Locate the `handlePinSubmit` function (~line 18).
> 3. Edit the code to set your own secure PINs.
> 4. Commit and push changes to update the live site.

---

## 🎮 Simulation Workflow

### 1. Community Group (`1234`)
*   **Goal**: Maximize unlocked benefits while protecting critical areas.
*   **Step 1 — Is there a mine?** Each of the five groups answers accept / refuse / no view. **Three of five must accept.** Abstaining counts toward neither side — silence is not consent — so the question can sit openly unsettled. A refusal ends the vote and exports `oppose`.
*   **Step 2 — How big?** Each group scores the five sizes 0–5. **The scores set the group's order, not its weight**: the winner is decided by instant-runoff over each group's best *acceptable* size, so one group cannot outweigh another by writing larger numbers. A size scored **0 is unacceptable** and is never a transfer target. The elimination rounds are shown.
*   **Step 3 — Benefits**: Larger mines unlock more. Costs are **not** shown to social teams — only how many are selected.
*   **Step 4 — No-go zones**: Five regions; how many may be named depends on the winning size (see [regional-map-no-go-zones.md](docs/regional-map-no-go-zones.md)).
*   **Output**: Downloads `community_results.csv`.

### 2. Mining Developer (`5678`)
*   **Goal**: Maximize production while meeting environmental standards.
*   **Step 1 — Scenario**: Select **Mine Size**, **Capacity** and **Facility tier**, then lock. Locking fixes the budget and the minimum that must be spent on water and waste.
    *   *Budget*: `$600,000 + 2 × (mineIdx + capacityIdx) × $2,000,000 + airAlloc`
*   **Step 2 — Siting**: Place every required facility on the map. Where they sit decides air quality at the Old Town and whether a community no-go zone has been trespassed. **Air is reported live while placing** — in a panel under the map and as badges over the receptors themselves. Extraction must be within 1 km of the ore body; nothing else may stand on it; no two facilities within 0.5 km.
*   **Step 3 — Mitigation**: Spend above the locked minimums on water, waste and air. A **Show the mathematics** switch reveals the curve with the current numbers substituted.
    *   *Water and waste*: `final = floor + (baseline − floor) × e^(−0.5 × $M)`, floor = 5% of baseline.
    *   *Air*: no curve — equipment in packages, plus three years of operating assurance at 15% of capital a year. Where the facilities sit matters more than what is spent.
*   **Step 4 — Benefits**: Commit from what is left. Going back to Step 3 to free up budget is a normal move.
*   **Impact ledgers**: water, waste and air in physical units, **never summed**. Collapsed by default behind a switch; three verdicts stay on show.
*   **Output**: Downloads `mining_simulation_results.csv`.

### 3. Joint Negotiation (`9999`)
*   **Goal**: Negotiate in a single session with live utility chart and shared controls.
*   **Features**: No-go zone toolbar, draggable regional map (industrial + community benefit symbols), community benefit selection, developer mitigation sliders (water / waste / air), utility–cost chart with **live lever weights** (see [utility-calculation.md](docs/utility-calculation.md)).
*   **Community UI**: Benefit costs are hidden from the social-teams view; only benefit count is shown.
*   **Size-to-benefits link**: the benefits panel states how many benefits the chosen mine size unlocks on the community dashboard, and how many are selected here. It is shown, not enforced — in the joint phase the budget is the real constraint, and a count cap on top of it would stop a group funding something both sides want and can afford. Going past the figure is meant to read as a negotiated concession rather than a gap in the rules. See `benefitsUnlockedForAreaKm2` in `src/data/communityVote.ts`.
*   **Submit**: **Submit Negotiation** (enabled after scenario lock) downloads `joint_negotiation_results.csv` — same mitigation fields as the developer export, plus `no_build_zones` and `benefit_placements` columns. A confetti celebration runs via the [`canvas-confetti`](https://www.npmjs.com/package/canvas-confetti) library.
*   **No-go zones**: Five selectable regions — Mountain Trails, Old Town, Aquifer Systems, University Campus and Agriculture Lands. See [regional-map-no-go-zones.md](docs/regional-map-no-go-zones.md).

### 4. Administrator (`5555`)
*   **Action**: Upload both CSV files (community + developer).
*   **Load the community file first** — it carries the no-go zones and the agreed size, which are what the developer's submission is judged against.
*   **Feasibility panel** (three sections, each Pass / Warning / Fail):
    1.  **Mine size** — alignment between the community's winner and the developer's mine. A community that *refused* a mine is its own failure, not a size gap.
    2.  **Environmental & community benefits** — read from the physical ledgers in `src/model`: water balance against recharge, drawdown at the Old Cistern and the farm wells, waste tonnages and whether disturbed ground fits the licence, PM10 and PM2.5 at the Old Town and campus against the EU limit values and WHO guidelines, and whether every requested benefit was funded.
    3.  **Map siting** — whether any facility overlaps a community no-go zone.
*   **"Why it came out this way"** — a closing card listing every failure and warning with **what the plan measures, what it had to measure, and what would change it**. Where nothing would change it at any price, it says so rather than quoting a figure that would not work.
*   **Negotiation Dashboard** (below the verdict, as reference):
    *   **Scatter Plot**: all **31** non-empty benefit bundles, cost against a weighted utility score.
    *   **Dot colour**: solid = inside the developer's budget, faded = above it. Utility is the y-axis; colour does not repeat it. **Black ring** = the community's selection.
    *   **Developer Budget**: orange dashed vertical line.
    *   **Overlap Map**: red borders = no-go zones; amber rings = facility conflicts.
*   **Result**: **Optimal** (green), **Suboptimal** (yellow), or **Not Feasible** (red).

See **[Admin feasibility analysis](docs/admin-feasibility.md)** for full rules.

---

## 🛠️ Technical Maintenance

### Documentation

- **[Model handover note](docs/model-handover.md)** — what the physical model calculates, the core trade-offs, which parameters are observed and which are calibrated, and the known gaps. Start here if you are porting the model into a digital twin.
- **[Simulation equations & logic](docs/simulation-equations-and-logic.md)** — consolidated equations for budget, utility, siting, no-go zones, and admin feasibility.
- **[Admin feasibility analysis](docs/admin-feasibility.md)** — three-section feasibility panel, map siting conflicts, overall verdict rules (PIN 5555).
- **[Community benefit utility calculation](docs/utility-calculation.md)** — coefficients, lever weights, formulas, hover tooltips, and chart interpretation (Admin & Joint).
- **[Regional map & no-go zones](docs/regional-map-no-go-zones.md)** — five selectable regions, bordered overlays, mine-size limits.
- **[Industrial facility siting rules](docs/facility-siting-rules.md)** — extraction, refining, processing, and manufacturing placement rules (Developer view).

### Running Locally
```bash
git clone https://github.com/JanelleKH/Aurelean-Mining-Simulation.git
cd Aurelean-Mining-Simulation
npm install
npm run dev
```

### Updating the Site
The site is hosted on **Vercel** and connected to the GitHub repository.
1.  Make changes to the code locally.
2.  Push to the `main` branch:
    ```bash
    git add .
    git commit -m "Description of change"
    git push origin main
    ```
3.  Vercel will automatically detect the push and redeploy the site within 1-2 minutes.

### Troubleshooting
*   **"Not Feasible" result?** Read the **"Why it came out this way"** card at the foot of the verdict. It names each failure with the figure the plan produced, the figure it had to produce, and what would move it.
*   **`npm run dev` slow or no URL?** First launch on Desktop/iCloud can take 30–60s; wait for `Local: http://127.0.0.1:5173/`. See vite config for startup hints.
*   **CSV error?** Ensure users do not rename or modify the CSV files before uploading.

---

## Future work

The three items that stood here — air as a core lever, benefits linked to
physical impacts, and spatial logic connecting production to impact — are done.
Air is a full ledger driven by a Gaussian plume from actual facility positions;
workforce training and energy storage together electrify the haul fleet; and
where facilities sit decides both air quality and no-go trespass. What is left:

1. **Map zoom and pan.** Queued for the revision round after 5 November. One
   trap: `DraggableRegionalMap` computes the image rectangle from the
   container's *layout* size while reading the pointer against
   `getBoundingClientRect`, which is the *transformed* size. A zoom makes those
   disagree and every placement lands in the wrong spot. The fix is two
   rectangles — one for layout, one for hit-testing.
2. **Receptor distances from the map.** The water ledger still uses fixed
   constants for the distance to the cistern and the farm wells. The air ledger
   already measures from real placements; water should too.
3. **Process makeup water in the drawdown.** It is withdrawn and counted as
   consumed, but only dewatering drives the Theis calculation. Small — 2% of
   dewatering at 0.5 Mt/yr, 25% at 5 Mt/yr — and correcting it moves the
   nominal case, so it is deliberate and recorded rather than overlooked.
4. **Site analogues for the calibrated parameters.** Every parameter in
   `src/model/params.ts` is marked *observed* or *calibrated*. The calibrated
   ones — specific inflow above all — are what the digital twin must replace
   first.

## For the digital twin team

`src/model/` is the physical layer and it is the part that transfers: pure
functions, physical units in and out, no React and no scoring. See
[`src/model/README.md`](src/model/README.md). Two conventions worth knowing
before reading the code:

- **There is no total, deliberately.** Each dimension has its own ledger in its
  own units. If the twin needs an aggregate, make the aggregation an explicit
  and arguable step rather than burying it.
- **Checks are pre-registered.** `npm run check:fixes` runs around seventy
  assertions, each stating in advance which way a result would have to fall to
  go against the claim it tests. Several have caught real defects, including two
  that had previously passed only because the test and the code shared the same
  mistake.
