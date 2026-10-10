# `src/model` — the physical layer

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

Dewatering scales with **licence area**; process consumption scales with
**throughput**. The community chooses area, the developer chooses throughput, so
each side owns one half of the water ledger — and for an underground mine in a
karst aquifer the half the community owns is both the larger volume and the half
that threatens the cistern. The community's own size vote is what endangers the
monument it is trying to protect.

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

- **Capacity does not affect drawdown.** Defensible — a higher throughput empties
  the same reserve faster rather than opening a larger void — but the rate of
  development plausibly matters, and at present the developer's choice cannot
  threaten the cistern at all. A decision, not an oversight.
- **Receptor distances are fixed constants.** They should come from the map once
  siting is expressed in kilometres instead of map percentage.
- **Size and capacity are not mutually consistent.** 8 km² at 3.0 Mt/yr gives a
  40-year life; Taylor's Rule puts a 120 Mt reserve nearer 21 years. Some
  size/capacity pairs are not real mine plans and could be flagged as such.
- **`DEWATERING_M3_PER_D_PER_KM2` is a calibration, not an observation.** It is
  the single most load-bearing number here and the one most in need of a real
  site analogue.
- **Waste and air ledgers are not written yet.** Waste should come from strip
  ratio and mass yield rather than from licence area, which is what the current
  `MINE_SIZES` table does.
