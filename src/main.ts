import './styles.css';

import { ANY_CLASS, formSupport, isClassAvailable, specsFor } from './data/classes';
import { DEFAULT_EXAMPLE, examplesFor, type Example } from './data/examples';
import { loadSpellIndex, type SpellIndex } from './data/spells';
import { describeAction, explainMacro } from './explain/explain';
import { DEFAULT_FLAVOUR, FLAVOURS, FLAVOUR_IDS, type FlavourId } from './flavours';
import { parseMacro } from './parser/parser';
import { MACRO_CHAR_LIMIT, type Issue, type MacroAst } from './parser/types';
import { evaluateMacro } from './sim/evaluate';
import { defaultSimState, type SimState } from './sim/state';
import { renderExplanation, type Outcomes } from './ui/explanation';
import { ensureWowheadTooltips } from './ui/wowhead';
import { escapeHtml, highlightHtml, nodeAtOffset } from './ui/highlight';
import { readPermalink, writePermalink } from './ui/permalink';
import { REF_TABS, renderReference, type RefTab } from './ui/reference';
import { applyControlChange, renderSimulator } from './ui/simulator';

const STORAGE_KEY = 'wowmacro101:v1';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const input = el<HTMLTextAreaElement>('input');
const highlight = el<HTMLPreElement>('highlight');
const gutter = el<HTMLDivElement>('gutter');
const meter = el<HTMLSpanElement>('meter');
const meterFill = el<HTMLDivElement>('meter-fill');
const issuesEl = el<HTMLDivElement>('issues');
const explanationEl = el<HTMLDivElement>('explanation');
const simEl = el<HTMLDivElement>('sim');
const referenceEl = el<HTMLDivElement>('reference');
const refTabsEl = el<HTMLDivElement>('ref-tabs');
const refSearch = el<HTMLInputElement>('ref-search');
const flavourSelect = el<HTMLSelectElement>('flavour');
const examplesSelect = el<HTMLSelectElement>('examples');
const flavourNote = el<HTMLParagraphElement>('flavour-note');

interface AppState {
  macro: string;
  flavour: FlavourId;
  /** ANY_CLASS means no class filtering. Persisted, unlike the Situation toggles. */
  classId: number;
  sim: SimState;
  tab: RefTab;
  query: string;
}

const state: AppState = {
  macro: DEFAULT_EXAMPLE.macro,
  flavour: DEFAULT_FLAVOUR,
  classId: ANY_CLASS,
  sim: defaultSimState(),
  tab: 'conditionals',
  query: '',
};

/** The examples currently in the dropdown; option values index into this, not EXAMPLES. */
let shownExamples: Example[] = [];
let ast: MacroAst = parseMacro('', DEFAULT_FLAVOUR);
let caretNode: string | null = null;
/** Null until the dataset loads, and for flavours we have no dataset for. */
let spells: SpellIndex | null = null;

// --- Rendering -------------------------------------------------------------

function update(): void {
  ast = parseMacro(state.macro, state.flavour, { spells, classId: state.classId });
  highlight.innerHTML = highlightHtml(ast);
  gutter.innerHTML = ast.lines.map((_, i) => `<div>${i + 1}</div>`).join('');
  renderMeter();
  renderOutputs();
  syncScroll();
  persist();
}

function renderMeter(): void {
  const n = ast.charCount;
  const pct = Math.min(100, (n / MACRO_CHAR_LIMIT) * 100);
  meter.textContent = `${n} / ${MACRO_CHAR_LIMIT}`;
  meter.classList.toggle('over', n > MACRO_CHAR_LIMIT);
  meter.classList.toggle('near', n > MACRO_CHAR_LIMIT * 0.9 && n <= MACRO_CHAR_LIMIT);
  meterFill.style.width = `${pct}%`;
  meterFill.classList.toggle('over', n > MACRO_CHAR_LIMIT);
}

function renderOutputs(): void {
  const result = evaluateMacro(ast, state.sim);
  const outcomes: Outcomes = new Map();
  for (const line of ast.lines) {
    for (const clause of line.clauses) {
      const verdict = result.byClause.get(clause.id);
      if (!verdict || (verdict.verdict !== 'fires' && verdict.verdict !== 'maybe')) continue;
      const action = describeAction(line, clause, verdict.unit);
      const prefix = verdict.verdict === 'maybe' ? 'If it runs: ' : '';
      outcomes.set(clause.id, capitalise(`${prefix}${action}`));
    }
  }
  const explanation = explainMacro(ast, { spells, classId: state.classId, spec: state.sim.spec });
  explanationEl.innerHTML = renderExplanation(explanation, result, state.flavour, outcomes);
  // Only once a render has actually produced a spell link: an empty editor, or a macro
  // naming nothing we recognise, never contacts Wowhead at all.
  if (explanationEl.querySelector('.chip-spell')) ensureWowheadTooltips();
  renderIssues();
  applyCaretHighlight();
}

function capitalise(text: string): string {
  const out = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(out) ? out : `${out}.`;
}

function renderIssues(): void {
  if (!ast.issues.length) {
    issuesEl.innerHTML = '<p class="empty ok">Nothing wrong with this macro.</p>';
    return;
  }
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...ast.issues].sort((a, b) => order[a.severity] - order[b.severity] || a.start - b.start);
  issuesEl.innerHTML = `<ul class="issues">${sorted.map(issueHtml).join('')}</ul>`;
}

function issueHtml(issue: Issue): string {
  const hint = issue.suggestion
    ? ` <span class="hint">Did you mean <code>${escapeHtml(issue.suggestion)}</code>?</span>`
    : '';
  return `<li class="issue sev-${issue.severity}" data-start="${issue.start}" data-end="${issue.end}">`
    + `<span class="badge">${issue.severity}</span>`
    + `<span class="issue-body">line ${issue.line}: ${escapeHtml(issue.message)}${hint}</span></li>`;
}

function renderRef(): void {
  refTabsEl.innerHTML = REF_TABS
    .map(([id, label]) => `<button type="button" class="ref-tab${id === state.tab ? ' active' : ''}" `
      + `data-tab="${id}">${label}</button>`)
    .join('');
  referenceEl.innerHTML = renderReference(state.tab, state.query, state.flavour);
}

function renderSimPanel(): void {
  simEl.innerHTML = renderSimulator(state.sim, state.flavour, state.classId);
}

/**
 * Druid has four specialisations, everyone else three. Leaving spec on 4 after
 * switching away from Druid would show "1 — Arms" while the simulator still evaluated
 * [spec:4].
 */
function clampSpec(): void {
  const count = specsFor(state.classId).length;
  if (count && state.sim.spec > count) state.sim.spec = count;
}

/**
 * Re-renders the Situation panel, keeping focus on whichever control triggered it.
 *
 * Needed whenever one control changes another's shape: class names the specialisations
 * and gates the pet section, spec gates the forms, and a unit going absent disables its
 * dead and party checkboxes. update() deliberately leaves the panel alone -- rebuilding
 * it on every keystroke would fight the controls -- so this is explicit.
 */
function rerenderSituation(): void {
  const focused = document.activeElement?.getAttribute('data-path');
  renderSimPanel();
  if (focused) {
    document.querySelector<HTMLElement>(`[data-path="${CSS.escape(focused)}"]`)?.focus();
  }
}

function renderFlavourNote(): void {
  const flavour = FLAVOURS[state.flavour];
  flavourNote.hidden = !flavour.note;
  flavourNote.textContent = flavour.note ?? '';
  // Provisional flavours get the louder treatment; a plain note is informational.
  flavourNote.classList.toggle('provisional', flavour.provisional);
}

// --- Editor plumbing -------------------------------------------------------

function syncScroll(): void {
  highlight.scrollTop = input.scrollTop;
  highlight.scrollLeft = input.scrollLeft;
  gutter.style.transform = `translateY(${-input.scrollTop}px)`;
}

function setMacro(text: string, moveCaret = true): void {
  state.macro = text;
  input.value = text;
  if (moveCaret) input.setSelectionRange(text.length, text.length);
  update();
}

function insertAtCaret(text: string): void {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const next = input.value.slice(0, start) + text + input.value.slice(end);
  state.macro = next;
  input.value = next;
  const caret = start + text.length;
  input.setSelectionRange(caret, caret);
  input.focus();
  update();
  syncCaret();
}

function syncCaret(): void {
  const node = nodeAtOffset(ast, input.selectionStart);
  if (node === caretNode) return;
  caretNode = node;
  applyCaretHighlight();
}

function applyCaretHighlight(): void {
  for (const node of document.querySelectorAll('.caret-active')) {
    node.classList.remove('caret-active');
  }
  if (!caretNode) return;
  const row = explanationEl.querySelector(`[data-node="${caretNode}"]`);
  row?.classList.add('caret-active');
}

function highlightNode(nodeId: string | null): void {
  for (const node of highlight.querySelectorAll('.token-active')) {
    node.classList.remove('token-active');
  }
  if (!nodeId) return;
  for (const span of highlight.querySelectorAll(`[data-node="${nodeId}"]`)) {
    span.classList.add('token-active');
  }
}

// --- Persistence -----------------------------------------------------------

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      macro: state.macro, flavour: state.flavour, classId: state.classId,
    }));
  } catch {
    // Private browsing and the like — not worth bothering the user about.
  }
}

function restore(): void {
  const fromUrl = readPermalink(location.hash);
  if (fromUrl) {
    state.macro = fromUrl.macro;
    state.flavour = fromUrl.flavour;
    state.classId = fromUrl.classId;
    return;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved) as Partial<AppState>;
    if (typeof parsed.macro === 'string') state.macro = parsed.macro;
    if (parsed.flavour && parsed.flavour in FLAVOURS) state.flavour = parsed.flavour;
    if (typeof parsed.classId === 'number' && isClassAvailable(state.flavour, parsed.classId)) {
      state.classId = parsed.classId;
    }
  } catch {
    // Corrupt saved state is not worth recovering from.
  }
}

async function copy(text: string, button: HTMLButtonElement, done: string): Promise<void> {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = done;
  } catch {
    button.textContent = 'Press Ctrl+C';
  }
  setTimeout(() => { button.textContent = label; }, 1400);
}

// --- Wiring ----------------------------------------------------------------

function bind(): void {
  input.addEventListener('input', () => {
    state.macro = input.value;
    update();
    syncCaret();
  });
  input.addEventListener('scroll', syncScroll);
  for (const event of ['click', 'keyup', 'select', 'focus']) {
    input.addEventListener(event, syncCaret);
  }

  simEl.addEventListener('change', onSimChange);
  simEl.addEventListener('input', onSimChange);

  el<HTMLButtonElement>('sim-reset').addEventListener('click', () => {
    state.sim = defaultSimState();
    renderSimPanel();
    renderOutputs();
  });

  flavourSelect.addEventListener('change', () => {
    state.flavour = flavourSelect.value as FlavourId;
    // A class the new flavour does not have would leave the dropdown showing a value
    // it no longer offers.
    if (!isClassAvailable(state.flavour, state.classId)) state.classId = ANY_CLASS;
    clampSpec();
    clampForm();
    renderFlavourNote();
    renderRef();
    renderSimPanel();
    populateExamples();
    update();
    void loadSpells();
  });

  examplesSelect.addEventListener('change', () => {
    const index = Number(examplesSelect.value);
    if (Number.isNaN(index) || index < 0 || !shownExamples[index]) return;
    const example = shownExamples[index];
    // Match the example's class, so the app does not warn about its own examples.
    const wanted = example.classId ?? ANY_CLASS;
    state.classId = isClassAvailable(state.flavour, wanted) ? wanted : ANY_CLASS;
    clampSpec();
    clampForm();
    renderSimPanel();
    setMacro(example.macro);
    examplesSelect.value = '-1';
    input.focus();
  });

  refTabsEl.addEventListener('click', (event) => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (!tab) return;
    state.tab = tab.dataset.tab as RefTab;
    renderRef();
  });

  refSearch.addEventListener('input', () => {
    state.query = refSearch.value;
    renderRef();
  });

  referenceEl.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-insert]');
    if (!button) return;
    insertAtCaret(button.dataset.insert ?? '');
  });

  explanationEl.addEventListener('mouseover', (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-node]');
    highlightNode(row?.dataset.node ?? null);
  });
  explanationEl.addEventListener('mouseleave', () => highlightNode(null));

  issuesEl.addEventListener('click', (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>('.issue');
    if (!item) return;
    input.focus();
    input.setSelectionRange(Number(item.dataset.start), Number(item.dataset.end));
    syncCaret();
  });

  el<HTMLButtonElement>('copy').addEventListener('click', (event) => {
    void copy(state.macro, event.currentTarget as HTMLButtonElement, 'Copied');
  });

  el<HTMLButtonElement>('share').addEventListener('click', (event) => {
    const hash = writePermalink({
      macro: state.macro, flavour: state.flavour, classId: state.classId,
    });
    history.replaceState(null, '', hash);
    void copy(location.href, event.currentTarget as HTMLButtonElement, 'Link copied');
  });

  el<HTMLButtonElement>('clear').addEventListener('click', () => {
    setMacro('');
    input.focus();
  });

  window.addEventListener('hashchange', () => {
    const link = readPermalink(location.hash);
    if (!link) return;
    state.flavour = link.flavour;
    state.classId = link.classId;
    flavourSelect.value = link.flavour;
    renderFlavourNote();
    renderRef();
    renderSimPanel();
    setMacro(link.macro);
  });
}

function onSimChange(event: Event): void {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  const path = target.dataset.path;
  if (!path) return;
  // Class is app state, not simulated state -- see renderCharacter.
  if (path === 'class') {
    state.classId = Number(target.value) || ANY_CLASS;
    clampSpec();
    clampForm();
    rerenderSituation();
    update();
    return;
  }
  const raw = target instanceof HTMLInputElement && target.type === 'checkbox'
    ? target.checked
    : target.value;
  applyControlChange(state.sim, path, target.dataset.type ?? 'string', raw);
  if (path === 'spec') {
    // Spec gates which forms exist (Moonkin is Balance-only).
    clampForm();
    rerenderSituation();
  } else if (path.endsWith('.reaction')) {
    // A unit going absent disables its dead and party checkboxes.
    rerenderSituation();
  }
  renderOutputs();
}

/** A form that the new spec cannot reach would leave the select and the simulator disagreeing. */
function clampForm(): void {
  const support = formSupport(state.flavour, state.classId, state.sim.spec);
  if (support === 'none') {
    state.sim.form = 0;
    return;
  }
  if (support === 'unnamed') return;
  if (state.sim.form !== 0 && !support.some((f) => f.index === state.sim.form)) {
    state.sim.form = 0;
  }
}

function populateSelects(): void {
  flavourSelect.innerHTML = FLAVOUR_IDS
    .map((id) => `<option value="${id}">${escapeHtml(FLAVOURS[id].label)}</option>`)
    .join('');
  flavourSelect.value = state.flavour;

  populateExamples();
}

/** Only the examples that work on the current flavour -- see examplesFor. */
function populateExamples(): void {
  shownExamples = examplesFor(state.flavour);
  examplesSelect.innerHTML = '<option value="-1">Load an example…</option>'
    + shownExamples.map((ex, i) => `<option value="${i}" title="${escapeHtml(ex.blurb)}">`
      + `${escapeHtml(ex.title)}</option>`).join('');
  examplesSelect.value = '-1';
}

async function loadSpells(): Promise<void> {
  spells = await loadSpellIndex(state.flavour);
  update();
}

function init(): void {
  restore();
  populateSelects();
  renderFlavourNote();
  renderSimPanel();
  renderRef();
  input.value = state.macro;
  bind();
  update();
  syncCaret();
  void loadSpells();
}

init();
