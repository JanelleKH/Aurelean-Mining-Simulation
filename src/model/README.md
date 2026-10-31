# `src/model` — the physical layer

> **Current as of 31 October 2026.** Illustrative figures in this file may lag the
> parameters; the code is the reference. Run `npm run model` for the live scenario
> space, `node scripts/worked-example.ts` for a line-by-line worked example, and
> `npm run check:fixes` for the pre-registered checks — around seventy of them,
> each stating in advance which way a result would have to fall to go against the
> claim it tests.
>
> Prose reference: **"The Aurelean model layer: equations, parameters and
> provenance"** in the project folder. It predates the 31 October revisions
> (production-rate-dependent dewatering, facility siting rules, benefit ID
> rename) and needs regenerating against `docs/simulation-equations-and-logic.md`,
> which *is* current.

Pure functions. Physical inputs in, physical quantities out. No React, no
budgets, no scores, no UI. Run `npm run model` to print the whole scenario
space and the pre-registered checks.

## Why it is separate

**Commensuration.** The equitable resilience framework's objection to
cost-benefit analysis is an objection to summing unlike things into one number.
That summing is exactly what the current `utility` score does. Keeping the
physics in its own layer, denominated in cubic metres, tonnes and metres, makes
aggregation an explicit and optional step rather than something buried in a
component. Each dimension gets a ledger. There is no total.

**The twin.** The digital twin needs the same relations driven by real site
data. Relations that live inside components cannot be reused, and the twin and
the teaching instrument would drift apart within a semester.

## What is here

| file | contents |
|---|---|
| `params.ts` | every physical prior, with provenance, and nothing else |
| `hydrology.ts` | Thiem drawdown, dewatering, mitigation response, rebound |
| `water.ts` | the water ledger: volumes, drawdown, threshold verdicts, cost to avert |
| `postClosure.ts` | the canoe benefit, backfill, subsidence index, cost structure |

## The water ledger

Water is reported as four different kinds of fact, deliberately not collapsed:

1. **Volumes moved** — dewatering withdrawal, process makeup, return, consumption (m³/yr).
2. **A field consequence** — drawdown at each receptor (m).
3. **Threshold verdicts** — whether each receptor survives.
4. **What it would take** — the mitigation spend that would change the verdict, or `null` if nothing can.

(4) is what makes the ledger negotiable rather than merely reported. A community
told "the cistern is lost" can only object. A community told "the cistern is
lost unless $1.8M goes to reinjection" has something to trade.

### The division of the ledger

Dewatering scales with the **aquifer captured** by the excavation and, since
31 October 2026, with the **rate of advance**; process consumption scales with
**throughput**. The community chooses area, the developer chooses throughput, so
each side owns part of the water ledger — and for an underground mine in a karst
aquifer the part the community owns is both the larger volume and the part that
threatens the cistern. The community's own size vote is what endangers the
monument it is trying to protect.

### Production rate cuts both ways

```
inflow = capture(area) × outcropArea × specificInflow × advanceIntensity(rate)

advanceIntensity(rate) = (1 − β) + β × rate / NOMINAL_THROUGHPUT_T_PER_YR
β = DEWATERING_ADVANCE_FRACTION = 0.35,  floored at 0.1
```

Mining **slowly** keeps the pumps running longer, and a transient cone of
depression widens with time. Mining **quickly** means pre-draining ahead of a
face that is advancing faster, so the pumps run harder. Neither is a way out:
across the available rates the two effects roughly cancel, and the drawdown
curve is a shallow U rather than a slope.

`advanceIntensity` is exactly 1.0 at nominal throughput, so every figure
published for a 3.0 Mt/yr plan is unaffected by this term. β is calibrated, not
observed: it sits inside the range reported for open pits, where pre-drainage is
a large minority of total pumping, and it is set so that production rate is not
an exploitable lever on the receptors.

### Dewatering is withdrawal without consumption

Dewatering moves a very large volume, consumes almost none of it, and causes
nearly all the drawdown. Process water is the reverse. A single "water" number
cannot represent this, and the two harms have different remedies: recycling
reduces consumption and does nothing for drawdown; reinjection and grouting
reduce drawdown and do nothing for consumption. This is the clearest argument in
the model for why ledgers beat scores.

### Thresholds, and the one that money cannot cross

With the current calibration (capacity 3.0 Mt/yr, minimum water spend):

| size | cistern drawdown | verdict | cost to avert |
|---|---|---|---|
| 0.5 km² | 0.18 m | safe | — |
| 1.0 km² | 0.37 m | safe | — |
| 2.0 km² | 0.74 m | safe | — |
| 4.0 km² | 1.47 m | **lost** | $1.82M |
| 8.0 km² | 2.94 m | **lost** | **impossible** |

The agricultural wells are the deliberate contrast: harmed only at 8 km², and
recoverable for under $1M. One receptor is a replaceable harm that money
answers; the other is an irreplaceable one that it does not. That asymmetry is
the framework's irreplaceability claim expressed as arithmetic rather than
rhetoric, and it is what gives a no-go zone or a size cap something to do that a
larger benefits package cannot.

`CISTERN_AVAILABLE_COLUMN_M` is the dial. Raise it and the threshold softens;
lower it and the loss arrives at a smaller mine.

## The canoe

The canoe route is the mine's own dewatering galleries, kept rather than filled
and opened after closure. It carries three properties no other benefit does.

- **It cannot be delivered inside the negotiation.** Rebound runs 1.5 years at
  0.5 km² to 13.4 years at 8 km², and follows drawdown, so the larger the mine
  the longer the wait.
- **Cheap to promise, expensive to keep.** At 4 km² with no backfill: $0.94M
  capital against $0.55M a year, a 50-year present value of $14.1M — fifteen
  times the capital. Every other benefit in the app is priced as a single
  payment, which cannot represent this at all.
- **It sets the community against itself.** Cemented paste backfill protects the
  Old Town and the cistern from subsidence; backfilled galleries are not
  navigable. The heritage interest and the tourism interest inside the same
  community want opposite values of `backfillFraction`.

It also requires scale: at 0.5 km² the navigable length falls below the minimum
and the benefit cannot be delivered at all.

## Known gaps

- **Receptor distances are fixed constants** for the water ledger. They should
  come from the map once siting is expressed in kilometres rather than map
  percentage. The *air* ledger already measures from actual placements.
- **Size and capacity are not mutually consistent.** Some size/capacity pairs are
  not real mine plans; `isPlausibleMinePlan` flags them against Taylor's Rule and
  the interface reports it, but nothing prevents choosing one.
- **The specific-inflow constant is a calibration, not an observation.** It
  remains the most load-bearing number here and the one most in need of a real
  site analogue. `DEWATERING_ADVANCE_FRACTION` is likewise calibrated.
- **Process makeup water does not contribute to receptor drawdown.** It is
  withdrawn, reported, and counted as consumed, but only dewatering drives the
  Theis calculation. The omission is small — process makeup runs from about 2%
  of dewatering at 0.5 Mt/yr to about 25% at 5 Mt/yr — and correcting it would
  move the nominal case, so it is recorded here rather than silently absorbed.
- **`REBOUND_YR_PER_M_DRAWDOWN` is unused.** Post-closure recovery is reported
  through the horizon constant instead; the rebound rate is retained for the
  twin, where it will matter.
- **The two mitigation curves are a convention.** `finalForAlloc` says money has
  diminishing returns and cannot reach zero, which is true of real remediation,
  but the particular coefficients are chosen to make the trade-off playable.
  They are not part of the physical layer and the interface says so.

## For the digital twin team

The whole point of this directory is that these relations can be driven by real
site data instead of the teaching scenario. Three things to know:

1. **Everything here is a pure function.** No React, no budget, no score, no UI.
   Replace the parameters in `params.ts` and the relations hold.
2. **Each parameter carries its provenance** in a comment, and is marked
   *observed* or *calibrated*. Calibrated means chosen to make the exercise
   behave; those are the ones that need site analogues first.
3. **There is no total, and that is deliberate.** Each dimension gets a ledger in
   its own units. A cubic metre of water and a tonne of tailings are not the same
   kind of thing, and the framework this instrument serves objects specifically to
   summing unlike things into one number. If the twin needs an aggregate, make
   the aggregation an explicit, visible, arguable step.
