/**
 * src/model — the physical layer of the simulation.
 *
 * Everything here is pure: physical inputs in, physical quantities out. No
 * React, no budgets, no scores. Two reasons for the separation.
 *
 * First, the equitable resilience framework's objection to cost-benefit
 * analysis is an objection to commensuration, and commensuration happens when
 * impacts in different units are summed into one number. Keeping the physics
 * in its own layer, denominated in cubic metres, tonnes and metres, makes the
 * aggregation step explicit and optional rather than buried in a utility
 * function. Each dimension gets a ledger; there is no total.
 *
 * Second, the digital twin needs the same relations driven by real site data.
 * If the relations live in components they cannot be reused, and the twin and
 * the teaching instrument will drift apart.
 */

export * from './params.ts';
export * from './hydrology.ts';
export * from './water.ts';
export * from './postClosure.ts';
