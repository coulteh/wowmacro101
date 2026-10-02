import type { Truth } from '../data/types';
import { iconUrl, wowheadUrl } from '../data/spells';
import type { FlavourId } from '../flavours';
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
  explanation: Explanation, sim: SimResult | null, flavour: FlavourId,
  outcomes: Outcomes = new Map(),
): string {
  if (explanation.rows.length === 0) {
    return `<p class="empty">${escapeHtml(explanation.summary)}</p>`;
  }
  const rows = explanation.rows.map((r) => renderRow(r, sim, flavour, outcomes)).join('');
  return `<p class="summary">${escapeHtml(explanation.summary)}</p>`
    + `<ul class="expl">${rows}</ul>`;
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

function renderRow(
  row: ExplRow, sim: SimResult | null, flavour: FlavourId, outcomes: Outcomes,
): string {
  const verdict = sim?.byClause.get(row.id)?.verdict;
  const classes = ['expl-row', `kind-${row.kind}`];
  if (row.severity) classes.push(`sev-${row.severity}`);
  if (verdict) classes.push(`verdict-${verdict}`);

  const badge = verdict
    ? `<span class="verdict v-${verdict}">${VERDICT_LABEL[verdict]}</span>`
    : '';

  const marker = row.kind === 'condition' ? conditionMarker(sim?.byCondition.get(row.id)) : '';

  // Explicit dimensions so a slow or failed icon load never shifts the layout.
  //
  // Deliberately NOT loading="lazy": lazy images inserted via innerHTML into an
  // already-laid-out container do not reliably trigger their intersection check, so
  // they sit pending until some later layout pass and the icons just never appear.
  // There is nothing to gain anyway -- only the few spells in the current macro are
  // ever rendered, at 1-2 kB each.
  // The 56px source, not 36px: a 20px box on a 2x display needs 40 real pixels, so the
  // 36px file was being upscaled very slightly.
  const icon = row.spell?.icon
    ? `<img class="spell-icon" src="${iconUrl(row.spell.icon, 56)}" alt="" width="20" height="20"
         onerror="this.style.visibility='hidden'">`
    : '';

  // A spell chip is a real link to the flavour-correct Wowhead page. That is both the
  // right thing to click and the only way to get Wowhead's live tooltip: their embed
  // attaches to <a>/<area> and to nothing else. No tabindex -- a link is already
  // focusable, and the href carries the game version (see wowheadUrl).
  const chip = row.spell
    ? `<a class="chip chip-spell" href="${wowheadUrl(row.spell.id, flavour)}"`
      + ` target="_blank" rel="noopener noreferrer">${icon}${escapeHtml(row.chip)}</a>`
    : `<code class="chip">${escapeHtml(row.chip)}</code>`;

  const outcome = outcomes.get(row.id);
  const outcomeRow = outcome
    ? `<li class="expl-row kind-outcome"><div class="expl-head">`
      + `<code class="chip">&rarr;</code><span class="expl-text">${escapeHtml(outcome)}</span>`
      + `</div></li>`
    : '';

  const children = row.children.length || outcomeRow
    ? `<ul class="expl">${outcomeRow}`
      + `${row.children.map((c) => renderRow(c, sim, flavour, outcomes)).join('')}</ul>`
    : '';

  return `<li class="${classes.join(' ')}" data-node="${row.id}">`
    + `<div class="expl-head">${marker}${chip}`
    + `<span class="expl-text">${escapeHtml(row.text)}</span>${badge}`
    + `</div>${children}</li>`;
}
