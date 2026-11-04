# The Aurelean model: what it calculates, and what it is for

**Handover note for the digital twin engineering team**
Janelle Knox-Hayes, MIT DUSP · 31 October 2026

---

## 1. What you are inheriting

A negotiation simulation about a lithium mine, and underneath it a physical
model that is meant to outlive the simulation.

The teaching instrument is the part people see: four roles, four access codes,
a map, a budget, a verdict. The part that transfers to a digital twin is
`src/model/` — a few hundred lines of pure functions that take physical inputs
and return physical quantities. No React, no budget, no score, no interface.
Replace the parameters with site data and the relations still hold.

Everything in this document is in the code with provenance attached. Where a
number is calibrated rather than observed, the comment beside it says so. Where
the model is known to be wrong or incomplete, §7 says so.

---

## 2. The one design commitment that shapes everything

**There is no total, and this is not an oversight to be tidied up.**

Each dimension gets its own ledger in its own units: cubic metres and metres of
drawdown for water, tonnes and hectares for waste and land, micrograms per
cubic metre for air. They are reported side by side and never summed.

The reason is the framework the instrument serves. An equitable resilience
account objects specifically to commensuration — to the move that turns a
drowned cistern, a dust plume and a tailings dam into one number so they can be
traded against each other on a single scale. Summing them does not resolve the
trade-off; it hides who is paying.

So the aggregation is left to the room. The read-out tells a team *the Old
Cistern is lost, no amount of money reaches it, and the farm wells can be saved
for $7.8M* — and then the people in the room have to decide what that is worth,
out loud, to each other. That argument is the exercise.

**If the twin needs an aggregate, make the aggregation an explicit, visible,
arguable step.** Do not bury it in a scoring function.

A second convention follows from the first. Each ledger reports **four
different kinds of fact**, deliberately not collapsed:

1. **Quantities moved** — m³/yr pumped, tonnes raised, grams per second emitted.
2. **Field consequence** — what happens at a place people care about.
3. **Threshold verdict** — whether that consequence crosses a stated limit.
4. **Cost to avert** — what it would take to pull it back, or `null` where
   nothing would.

That fourth value carrying `null` is load-bearing. Some harms are not
purchasable, and a model that always returns a price is lying about the world.

---

## 3. What each ledger calculates

### 3.1 Water — `src/model/water.ts`, `src/model/hydrology.ts`

The mine sits in a karst aquifer. Water leaves by two routes with very
different meanings.

**Dewatering** is water pumped out to keep the workings dry. It is a very large
volume and it is *relocated, not consumed* — most of it goes back to surface or
is reinjected. It is also what causes the harm, because removing it lowers the
water table for kilometres around.

```
inflow = capture(area) × outcropArea × specificInflow × advanceIntensity(rate)
capture(area)          = 1 − exp(−area / AQUIFER_CAPTURE_SCALE_KM2)
advanceIntensity(rate) = (1 − β) + β × rate / NOMINAL_THROUGHPUT_T_PER_YR,  β = 0.35
net                    = inflow × (1 − mitigationEffectiveness(spend))
```

**Process makeup water** is what the mill actually consumes. It scales with
throughput, it is small beside dewatering, and it does not come back.

**Drawdown at a receptor** uses the transient Theis solution, not steady-state
Thiem — the cone of depression grows with the logarithm of pumping time, so
*how long you pump* matters as much as how hard.

```
s(r, t) = (Q / 4πT) · W(u),    u = r²S / (4Tt)
```

Two receptors, each with a tolerance: the **Old Cistern** (a historic
structure; it has a finite water column and when the column is gone it is gone)
and the **agricultural wells** (they have an available drawdown before the
pumps break suction).

> **The production-rate term matters and it is new.** Until 31 October 2026
> dewatering was a function of area and spend only, so production rate reached
> the water ledger through one channel — mine life. A faster mine finished
> sooner, transient drawdown had less time to develop, and the receptors did
> better. The way to protect the wells was to mine as fast as possible, at no
> cost anywhere.
>
> The Theis half was never wrong: pumping for less time really does draw down
> less. What was missing is that a pit advancing five times faster exposes new
> wetted face five times faster and must pre-drain ahead of it. `β` splits
> inflow between a rate-driven term and steady seepage, anchored so the factor
> is exactly 1.0 at nominal throughput. Across the available rates the two
> effects roughly cancel: mining slowly draws down for longer, mining quickly
> draws down harder, and neither is a way out.

### 3.2 Waste and land — `src/model/waste.ts`, `src/model/footprint.ts`

Waste follows the **tonnage mined**, not the licence area. That distinction is
the whole point: a community that grants a small licence does not thereby get a
small waste problem if the developer mines it hard.

```
ore mined      = area × ORE_T_PER_KM2
waste rock     = ore × stripRatio
concentrate    = ore × grade × recovery / concentrateGrade      (mass-yield identity)
tailings       = ore − concentrate
```

Footprint is derived from tonnage and bulk density, split between a waste dump
and a tailings impoundment, and compared with the community's licence area.
Paste backfill moves tailings underground, which shrinks the impoundment and
supports the ground beneath the Old Town — **and fills the galleries the
underground canoe would use.** One decision, three consequences, which is the
kind of coupling the instrument exists to make visible.

### 3.3 Air — `src/model/air.ts`

The only ledger that depends on **where things are** rather than only on how
much is spent.

Emissions are itemised by source kind — haulage and run-of-mine handling,
wind erosion off the dumps, stack releases from refining and processing — then
dispersed to named receptors with a Gaussian plume, Briggs rural coefficients,
Pasquill class D (the class that dominates an annual mean).

```
C(x) = Q / (π · u · σy · σz) · exp(−h² / 2σz²)
σy = 0.08x (1 + 0.0001x)^−½      σz = 0.06x (1 + 0.0015x)^−½
```

Three refinements that each exist because the naive version was wrong:

- **Area sources get a virtual-source offset.** A 118 ha waste dump is 1.1 km
  across; collapsing it to a point puts its whole emission at one spot and
  overstates the near field badly.
- **Elevated releases get plume rise.** A 45 m stack is not a ground-level
  release, and treating it as one blamed the refinery for the haul road's dust.
- **Receptors are areas, not points.** See the warning below.

Two thresholds, deliberately never merged: the **EU limit values** (PM10 40,
PM2.5 25 µg/m³ annual mean) which are binding law, and the **WHO 2021
guidelines** (15 and 5) which are advisory and about five times stricter. An
operation can sit lawfully between them for its entire life. That gap is where
the community has to argue, because the regulation will not close it for them.

> **Receptors must be sampled across their area.** The model evaluated
> concentration at the *nearest edge* of a receptor. For a ground-level source
> that is the worst case and the right choice. For an elevated one it is close
> to the best case — a plume leaves a 45 m stack and touches down roughly a
> kilometre downwind. The Old Town is about 3.2 km across, so a refinery parked
> 100 m off its northern edge was evaluated where the plume was still overhead,
> and reported as contributing nothing, while its touchdown sat over the middle
> of the town.
>
> Measured at 8 km² and 5 Mt/yr: a refinery 0.1 km from the town edge gave
> PM2.5 1.6 µg/m³ — identical to having no refinery at all — and the same
> refinery 2.1 km away gave 5.4. The instrument was teaching that the way to
> protect the town's air is to build on the town's doorstep.
>
> The fix is to sample the receptor rectangle and report the worst point inside
> it, which is what an assessment does. **Check this is present in the build
> you receive**, and keep it if you re-implement dispersion: any point-receptor
> treatment of an elevated source will reproduce the exploit.

### 3.4 Post-closure — `src/model/postClosure.ts`

The underground canoe exists to make deferred liability visible. It is cheap to
promise — second cheapest thing on the list — and its real cost is everything
that is not charged: the backfill not placed, treatment when the workings
rebound, pumping and access in perpetuity, and the liability of leaving voids
open beneath a historic town.

It is also **gated by physics rather than by price**. It needs a navigable
gallery, which the workings only leave above a certain size, and it needs water
held back after closure, which a large mine's recovery call does not leave.
At 0.5 km² there is not enough gallery; at 8 km² there is not enough water. It
cannot be bought at either end, and the refusal message says which constraint
bound.

---

## 4. The core trade-offs

These are the things the exercise is built to make arguable. A twin that keeps
the equations but loses these has kept the wrong half.

**Area against intensity.** The community votes the licence area; the developer
chooses the production rate. Dewatering scales with the aquifer captured, so
the community's own size vote is what endangers the monument it is trying to
protect. Neither party alone controls the water outcome.

**Duration against rate.** Mining slowly keeps the pumps running longer; mining
quickly pre-drains harder. There is no rate at which the water problem goes
away, and finding that out is the lesson.

**Distance against cost.** Clustering the industrial chain is cheap —
infrastructure is shared and the spread penalty falls. Distance is what protects
air quality at the receptors. These pull against each other, which is correct,
and a floor is needed under the clustering side or the optimum collapses to a
single point: nothing but extraction may stand on the ore body, and no two
facilities within 0.5 km.

**Lawful against healthy.** The binding limit and the advisory guideline differ
by a factor of five. A developer can be entirely compliant and the town can
still be breathing air the WHO considers harmful. No benefits package buys past
a limit value; everything between the two is negotiable.

**Purchasable against not.** The farm wells answer to money up to a point. The
Old Cistern, past its drawdown tolerance, does not — `spendToSaveUsd` returns
`null` and the read-out says *nothing reaches this one*. A model that always
returns a price would teach that everything is for sale.

**Now against later.** The capital cost is charged; the obligation is not. Air
control equipment is bought once and must be operated for the life of the mine
at about 15% of capital a year, with three years secured up front as financial
assurance. The canoe's price is a portal and a landing; its liability runs
forever.

---

## 5. Observed, calibrated, and the difference

Every parameter in `src/model/params.ts` carries a comment marking which it is.

**Observed** means taken from a published source or a legal instrument: the EU
limit values, the WHO guidelines, Briggs coefficients, Taylor's rule, aquifer
transmissivity and storativity ranges, strip ratios and recoveries for a
deposit of this type.

**Calibrated** means chosen so the exercise behaves — defensible in magnitude,
but not measured at this site because there is no site. These are the ones a
twin must replace first:

| Parameter | Role | Why it matters |
|---|---|---|
| `SPECIFIC_INFLOW_M3_PER_D_PER_KM2_CONNECTED` | Sets dewatering volume | **The most load-bearing number in the model.** Everything in the water ledger scales with it |
| `DEWATERING_ADVANCE_FRACTION` (β = 0.35) | Splits inflow between rate and geometry | Determines whether production rate is a lever or a wash |
| `AQUIFER_CAPTURE_SCALE_KM2` | How fast capture saturates with area | Sets the shape of the community's size decision |
| `CISTERN_AVAILABLE_COLUMN_M` | The cistern's tolerance | Decides at what mine size the irreplaceable thing is lost |
| mitigation curve coefficients | Money → outcome | Not part of the physical layer at all; see below |

**The two mitigation curves are a convention, not physics.**
`final = floor + (baseline − floor) · e^(−k·$M)` says money has diminishing
returns and cannot reach zero. Both claims are true of real remediation. The
particular coefficients are chosen to make the trade-off playable, the
interface says so where a team can see it, and they should not be carried into
a twin as if they were measured.

---

## 6. How to run and check it

```bash
npm run model          # the whole scenario space, printed
npm run check:fixes    # ~80 pre-registered checks
node scripts/worked-example.ts   # one scenario, line by line
```

**The checks are pre-registered**, and that convention is worth keeping. Each
one states *in advance* which way the result would have to fall to go against
the claim it tests, so a failure is informative rather than just red. Several
have caught real defects. Two caught the test rather than the code — fixtures
that had quietly stopped exercising the thing they named — and one caught a
fixture sharing the same mistake as the code it was checking, which is the
failure mode worth designing against:

> A check that hardcodes the same wrong constant as the implementation will
> pass forever while the feature does nothing. The benefit registry checks
> exist for exactly this: they assert the code against the *data*, not against
> another copy of the code.

---

## 7. Known gaps

Stated plainly, because a twin team that discovers these on their own will
reasonably wonder what else is unstated.

- **Water receptor distances are fixed constants.** The distance to the cistern
  and to the farm wells does not come from the map. The air ledger already
  measures from real placements; water should too.
- **Process makeup water does not contribute to drawdown.** It is withdrawn,
  reported, and counted as consumed, but only dewatering drives the Theis
  calculation. Small — roughly 2% of dewatering at the lowest rate, 25% at the
  highest — and correcting it moves the nominal case, so it is recorded here
  rather than quietly absorbed.
- **`REBOUND_YR_PER_M_DRAWDOWN` is unused.** Post-closure recovery is reported
  through a horizon constant instead. The rebound rate is retained because it
  is what a twin will actually need.
- **A single wind speed and stability class.** The annual mean is computed for
  Pasquill D at one speed and one sector frequency. A twin with a real wind
  rose should use it; the structure accepts one without modification.
- **Size and production rate are not mutually constrained.** Some combinations
  are not real mine plans. `isPlausibleMinePlan` flags them against Taylor's
  rule and the interface reports it, but nothing prevents choosing one.
- **No groundwater quality, no acid rock drainage, no seismicity.** The ledgers
  are quantity and dispersion only. For a real deposit, drainage chemistry is
  likely the first thing to add.

---

## 8. If you change one thing, know this

The instrument's authority with a room full of mining professionals rests on
the figures being defensible and the refusals being honest. Two habits protect
that, and both are cheap:

**Check the model against data, never against another copy of itself.** The
most expensive defects in this codebase have all had the same shape — a value
that compiled, read plausibly, and did nothing, with a test that agreed with it.

**When something cannot be done, say so and say why.** `null` where no spend
reaches the harm; a canoe refusal that names water or gallery length; an air
exceedance that reports a limit value as binding law rather than a cost. The
temptation is always to return a number. The number is what makes it wrong.

---

*Code: `src/model/` · Equations: `docs/simulation-equations-and-logic.md` ·
Siting rules: `docs/facility-siting-rules.md` · Verdict logic:
`docs/admin-feasibility.md`*
