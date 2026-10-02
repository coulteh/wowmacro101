import type { Truth } from '../data/types';
import { iconUrl } from '../data/spells';
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

/** Turns "skipped" into "why": which condition actually failed. */
function conditionMarker(truth: Truth | undefined): string {
  if (truth === undefined) return '';
  const [symbol, cls, label] = truth === true
    ? ['✓', 'pass', 'true']
    : truth === false
      ? ['✗', 'fail', 'false']
      : ['?', 'unsure', 'cannot be determined'];
  return `<span class="cond-mark mark-${cls}" title="This condition is ${label}"`
    + ` aria-label="${label}">${symbol}</span>`;
}

function renderRow(row: ExplRow, sim: SimResult | null, outcomes: Outcomes): string {
  const verdict = sim?.byClause.get(row.id)?.verdict;
  const classes = ['expl-row', `kind-${row.kind}`];
  if (row.severity) classes.push(`sev-${row.severity}`);
  if (verdict) classes.push(`verdict-${verdict}`);

  const badge = verdict
    ? `<span class="verdict v-${verdict}">${VERDICT_LABEL[verdict]}</span>`
    : '';

  const marker = row.kind === 'condition' ? conditionMarker(sim?.byCondition.get(row.id)) : '';

  // Explicit dimensions so a slow or failed icon load never shifts the layout.
  const icon = row.spell?.icon
    ? `<img class="spell-icon" src="${iconUrl(row.spell.icon, 36)}" alt="" width="20" height="20"
         loading="lazy" onerror="this.style.visibility='hidden'">`
    : '';

  // Only spell-bearing chips are focusable, so the tooltip works without a mouse.
  const spellAttrs = row.spell
    ? ` data-spell="${escapeHtml(row.spell.name)}" tabindex="0"`
    : '';

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
    + `<div class="expl-head">${marker}`
    + `<code class="chip${row.spell ? ' chip-spell' : ''}"${spellAttrs}>${icon}`
    + `${escapeHtml(row.chip)}</code>`
    + `<span class="expl-text">${escapeHtml(row.text)}</span>${badge}`
    + `</div>${children}</li>`;
}
