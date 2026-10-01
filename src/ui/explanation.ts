import type { ExplRow, Explanation } from '../explain/explain';
import type { SimResult, Verdict } from '../sim/evaluate';
import { escapeHtml } from './highlight';

const VERDICT_LABEL: Record<Verdict, string> = {
  fires: 'runs',
  skipped: 'skipped',
  maybe: 'might run',
  unreachable: 'not reached',
};

/** clause id -> what actually happens, for clauses the simulator says run. */
export type Outcomes = Map<string, string>;

export function renderExplanation(
  explanation: Explanation, sim: SimResult | null, outcomes: Outcomes = new Map(),
): string {
  if (explanation.rows.length === 0) {
    return `<p class="empty">${escapeHtml(explanation.summary)}</p>`;
  }
  return `<p class="summary">${escapeHtml(explanation.summary)}</p>`
    + `<ul class="expl">${explanation.rows.map((r) => renderRow(r, sim, outcomes)).join('')}</ul>`;
}

function renderRow(row: ExplRow, sim: SimResult | null, outcomes: Outcomes): string {
  const verdict = sim?.byClause.get(row.id)?.verdict;
  const classes = ['expl-row', `kind-${row.kind}`];
  if (row.severity) classes.push(`sev-${row.severity}`);
  if (verdict) classes.push(`verdict-${verdict}`);

  const badge = verdict
    ? `<span class="verdict v-${verdict}">${VERDICT_LABEL[verdict]}</span>`
    : '';
  // On a clause that actually runs, lead with the concrete result: with several OR
  // groups, "runs" alone does not say which one won or which unit it landed on.
  const outcome = outcomes.get(row.id);
  const outcomeRow = outcome
    ? `<li class="expl-row kind-outcome"><div class="expl-head">`
      + `<code class="chip">&rarr;</code><span class="expl-text">${escapeHtml(outcome)}</span>`
      + `</div></li>`
    : '';

  const children = row.children.length || outcomeRow
    ? `<ul class="expl">${outcomeRow}`
      + `${row.children.map((c) => renderRow(c, sim, outcomes)).join('')}</ul>`
    : '';

  return `<li class="${classes.join(' ')}" data-node="${row.id}">`
    + `<div class="expl-head">`
    + `<code class="chip">${escapeHtml(row.chip)}</code>`
    + `<span class="expl-text">${escapeHtml(row.text)}</span>${badge}`
    + `</div>${children}</li>`;
}
