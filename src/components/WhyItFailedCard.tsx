/**
 * The closing read-out: every failure and every warning, with the number the
 * plan produced, the number it had to produce, and what would move it.
 *
 * Beta testers could read the three section cards on the admin dashboard and
 * still not answer "why did we fail, and by how much". The section cards
 * narrate, and a narration does not give you a threshold. This card is the part
 * a team can negotiate from. Failures come first, because a warning is
 * survivable and a failure is not.
 */

import clsx from 'clsx';
import { AlertTriangle, XCircle } from 'lucide-react';

/**
 * One thing that went wrong, stated as a test rather than a complaint.
 *
 * A detail line saying the developer did not fund the irrigation system does
 * not tell anyone what funding it would have cost. So every fail and every
 * warning records four things: what was tested, what this plan measures, what
 * it had to measure instead, and what would change it.
 *
 * `remedy: null` means nothing in the negotiation changes this outcome — the
 * Old Cistern past its drawdown tolerance is the standing case. That is a
 * different kind of answer from an expensive one, and the read-out says so.
 */
export interface Blocker {
  kind: 'fail' | 'warn';
  /** Which section raised it, so the closing card can be traced back. */
  section: 1 | 2 | 3;
  /** The test, named in the terms the model tests it in. */
  test: string;
  /** What this plan does. */
  measured: string;
  /** What it has to do to pass. */
  threshold: string;
  /** What would change it, or null where nothing would. */
  remedy: string | null;
}

export function WhyItFailedCard({ blockers }: { blockers: Blocker[] }) {
  const fails = blockers.filter(b => b.kind === 'fail');
  const warns = blockers.filter(b => b.kind === 'warn');

  if (blockers.length === 0) {
    return (
      <div className="rounded-lg border-2 border-green-300 bg-white p-4 text-left">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Why it came out this way</h3>
        <p className="text-sm text-gray-700">
          Nothing failed and nothing came close enough to warn about. Every threshold in the model
          was met with room to spare: the cistern and the wells hold, the footprint fits the licence
          area, air sits inside the limits, the sizes agree, and no facility touches a no-go zone.
        </p>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'rounded-lg border-2 bg-white p-4 text-left',
        fails.length > 0 ? 'border-red-300' : 'border-yellow-300'
      )}
    >
      <h3 className="text-lg font-bold text-gray-900 mb-1">Why it came out this way</h3>
      <p className="text-xs text-gray-600 mb-3">
        {fails.length > 0
          ? `${fails.length} failure${fails.length === 1 ? '' : 's'}${
              warns.length
                ? ` and ${warns.length} warning${warns.length === 1 ? '' : 's'}`
                : ''
            }, each with the figure the plan produced and the figure it had to produce.`
          : `${warns.length} warning${
              warns.length === 1 ? '' : 's'
            }. Nothing here refuses the plan — each one is a margin worth knowing about.`}
      </p>

      <div className="flex flex-col gap-3">
        {[...fails, ...warns].map((b, i) => (
          <BlockerRow key={i} blocker={b} />
        ))}
      </div>

      {fails.some(b => b.remedy === null) && (
        <p className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-700">
          At least one failure above has no remedy at any price. That is a real answer rather than a
          gap in the model: some harms are not purchasable, and the only paths are a smaller mine, a
          different location, or the community declining. The read-out says so instead of quoting a
          figure that would not work.
        </p>
      )}
    </div>
  );
}

function BlockerRow({ blocker }: { blocker: Blocker }) {
  const isFail = blocker.kind === 'fail';
  return (
    <div
      className={clsx(
        'rounded border-l-4 pl-3 pr-2 py-2',
        isFail ? 'border-red-500 bg-red-50' : 'border-yellow-500 bg-yellow-50'
      )}
    >
      <div className="flex items-start gap-2">
        {isFail ? (
          <XCircle size={16} className="text-red-700 mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle size={16} className="text-yellow-700 mt-0.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">
            {blocker.test}
            <span className="ml-2 font-normal text-[10px] uppercase tracking-wide text-gray-500">
              {isFail ? 'failed' : 'warning'} &middot; section {blocker.section}
            </span>
          </p>
          <dl className="mt-1 text-xs text-gray-800 space-y-0.5">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 font-semibold text-gray-600">This plan</dt>
              <dd className="flex-1">{blocker.measured}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 font-semibold text-gray-600">Threshold</dt>
              <dd className="flex-1">{blocker.threshold}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 font-semibold text-gray-600">To change it</dt>
              <dd
                className={clsx('flex-1', blocker.remedy === null && 'font-semibold text-red-800')}
              >
                {blocker.remedy ?? 'Nothing. No amount of money or mitigation reaches this one.'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
