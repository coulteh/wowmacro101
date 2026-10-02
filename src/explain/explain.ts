// Turns an AST into the nested token -> English rows shown in the explanation pane.
// Pure: no DOM, no formatting decisions beyond the wording itself.

import type { SpellIndex, SpellRecord } from '../data/spells';
import { describeUnit } from '../data/units';
import { SPELL_NAME_COMMANDS } from '../parser/parser';
import { FLAVOURS } from '../flavours';
import type { DescContext } from '../data/types';
import type { Clause, CondGroup, Line, MacroAst, NodeId, Severity } from '../parser/types';
import {
  describeCondition, describeGroups, describeGroupTests, groupUnit, joinList,
  hasAnyTests, sharedExplicitUnit, unitLabelFor, unitsDiffer,
} from './phrases';

/** Commands whose action lands on a unit, so naming that unit adds something. */
const UNIT_TARGETING = new Set([
  '/cast', '/spell', '/use', '/castsequence', '/castrandom', '/userandom',
  '/target', '/tar', '/focus', '/assist', '/a', '/petattack', '/startattack',
]);

export type RowKind = 'line' | 'clause' | 'condition' | 'step' | 'note';

export interface ExplRow {
  id: NodeId;
  kind: RowKind;
  /** Monospace source token shown on the left. */
  chip: string;
  /** Plain-English description shown on the right. */
  text: string;
  severity?: Severity;
  /** Resolved spell, when this row names one. Drives the icon and tooltip. */
  spell?: SpellRecord;
  children: ExplRow[];
}

export interface ExplainOptions {
  /** Bundled spell data. Absent means no icons or tooltips, same as today. */
  spells?: SpellIndex | null;
  /** Selected class, which lets [spec:N] be named rather than numbered. */
  classId?: number;
  /** Selected specialisation, which gates which shapeshift forms exist. */
  spec?: number;
}

export interface Explanation {
  summary: string;
  rows: ExplRow[];
}

let rowSeq = 0;
function row(
  id: NodeId, kind: RowKind, chip: string, text: string,
  children: ExplRow[] = [], severity?: Severity, spell?: SpellRecord,
): ExplRow {
  return {
    id: id || `r${++rowSeq}`, kind, chip, text, children,
    ...(severity ? { severity } : {}),
    ...(spell ? { spell } : {}),
  };
}

/** A single, un-negated [spec:N] in a group tells us the spec for that whole branch. */
function specInGroup(group: CondGroup, ctx: DescContext): DescContext {
  const spec = group.conditions.find(
    (c) => c.kind === 'test' && c.name === 'spec' && !c.negated && c.values.length === 1,
  );
  if (!spec) return ctx;
  const value = Number(spec.values[0].text);
  return Number.isFinite(value) ? { ...ctx, spec: value } : ctx;
}

/** The description context, assembled from the macro's flavour and the chosen character. */
function descContext(ast: MacroAst, options: ExplainOptions): DescContext {
  return { classId: options.classId, flavour: ast.flavour, spec: options.spec };
}

export function explainMacro(ast: MacroAst, options: ExplainOptions = {}): Explanation {
  const rows: ExplRow[] = [];
  for (const line of ast.lines) {
    const r = explainLine(ast, line, options);
    if (r) rows.push(r);
  }
  return { summary: summarise(ast, options), rows };
}

/**
 * The spell a row names, when the command actually takes a spell name.
 *
 * `rank` carries `/cast Fireball(Rank 3)` through: on the Classic lines each rank is a
 * separate spell id, so it decides which icon and which Wowhead tooltip the chip gets.
 */
function spellFor(
  line: Line, text: string, options: ExplainOptions, rank?: number,
): SpellRecord | undefined {
  if (!options.spells || !text) return undefined;
  const command = line.command?.name.toLowerCase();
  const takesSpell = line.kind === 'meta' || (command !== undefined && SPELL_NAME_COMMANDS.has(command));
  if (!takesSpell) return undefined;
  return options.spells.lookup(text, rank) ?? undefined;
}

function explainLine(ast: MacroAst, line: Line, options: ExplainOptions): ExplRow | null {
  switch (line.kind) {
    case 'blank':
      return null;

    case 'comment':
      return row(line.id, 'line', line.raw.trim(), 'A comment. The game ignores this line entirely.');

    case 'invalid':
      return row(
        line.id, 'line', line.raw.trim(),
        'Not a valid macro line — it must start with a slash command, or # for a comment.',
        [], 'error',
      );

    case 'meta': {
      const name = line.meta?.name ?? '#showtooltip';
      const def = line.meta?.def;
      const children = line.clauses
        .map((c) => explainClause(ast, line, c, 'show', options))
        .filter((c): c is ExplRow => c !== null);
      const text = line.clauses.some((c) => c.arg?.text)
        ? def?.short ?? 'Chooses what the button displays.'
        : 'Shows the icon, tooltip and cooldown of the first spell or item this macro uses.';
      return row(line.id, 'line', name, text, children);
    }

    case 'command': {
      const name = line.command?.name ?? '';
      const def = line.command?.def;
      if (!def) {
        return row(line.id, 'line', name, 'Not a slash command the game recognises.', [], 'error');
      }

      if (def.args === 'lua' || def.args === 'text' || def.args === 'none') {
        const arg = line.rawArg?.text ?? '';
        const children = arg
          ? [row(`${line.id}-arg`, 'step', arg, capitalise(def.action(arg)))]
          : [];
        return row(line.id, 'line', name, def.short, children);
      }

      const children = line.clauses
        .map((c) => explainClause(ast, line, c, 'do', options))
        .filter((c): c is ExplRow => c !== null);
      return row(line.id, 'line', name, def.short, children);
    }
  }
}

function explainClause(
  ast: MacroAst, line: Line, clause: Clause, mode: 'do' | 'show', options: ExplainOptions,
): ExplRow | null {
  const hasGroups = clause.groups.length > 0;
  const hasArg = Boolean(clause.arg?.text);
  if (!hasGroups && !hasArg) {
    return clause.index > 0
      ? row(clause.id, 'clause', '(empty)', 'Otherwise, do nothing at all.')
      : null;
  }

  const chip = ast.source.slice(clause.start, clause.end).trim() || '(empty)';

  let text: string;
  if (!hasGroups || !hasAnyTests(clause.groups)) {
    // Nothing is actually being tested, so there is no "if" to state.
    const action = clauseAction(line, clause, mode, sharedExplicitUnit(clause.groups));
    text = clause.index === 0 ? capitalise(action) : `Otherwise, ${action}.`;
  } else if (unitsDiffer(clause.groups)) {
    text = `${describeGroupOutcomes(line, clause, mode, descContext(ast, options))}.`;
  } else {
    const action = clauseAction(line, clause, mode, sharedExplicitUnit(clause.groups));
    const conds = describeGroups(clause.groups, descContext(ast, options));
    const lead = clause.index === 0 ? 'If' : 'Otherwise, if';
    text = `${lead} ${conds}, ${action}.`;
  }

  const children: ExplRow[] = [];
  for (const group of clause.groups) {
    if (group.empty) {
      children.push(row(group.id, 'condition', '[]', 'An empty condition is always true — this is the fallback.'));
      continue;
    }
    const label = unitLabelFor(group);
    // Same rule as the clause sentence: a [spec:N] in this group describes this branch.
    const groupCtx = specInGroup(group, descContext(ast, options));
    for (const cond of group.conditions) {
      const phrase = describeCondition(cond, label, groupCtx);
      // Frame a test as a condition, not a fact. "You are holding Shift" next to a red
      // cross reads as a contradiction; "Only if you are holding Shift" does not.
      // Unit redirects are not tests and keep their own phrasing.
      const text = cond.kind === 'unit' || !cond.def ? phrase : `only if ${phrase}`;
      children.push(row(
        cond.id, 'condition', cond.raw, capitalise(text),
        [], cond.def || cond.kind === 'unit' ? undefined : 'error',
      ));
    }
  }

  if (clause.bang) {
    children.push(row(
      `${clause.id}-bang`, 'note', '!',
      'The leading "!" stops the macro toggling the aura back off if it is already active.',
    ));
  }

  if (clause.sequence) {
    const seq = clause.sequence;
    if (seq.reset) {
      children.push(row(
        `${clause.id}-reset`, 'note', `reset=${seq.reset.text}`,
        `The sequence restarts from step 1 ${describeReset(seq.reset.parts)}.`,
      ));
    }
    seq.spells.forEach((s, i) => {
      const rank = s.rank ? ` Cast at rank ${s.rank}.` : '';
      children.push(row(
        `${clause.id}-step${i}`, 'step', s.rank ? `${s.text} (rank ${s.rank})` : s.text,
        `Step ${i + 1} of ${seq.spells.length}.${rank} `
        + 'Only a successful cast advances the sequence.',
        [], undefined, spellFor(line, s.text, options, s.rank),
      ));
    });
  }

  return row(
    clause.id, 'clause', chip, text, children, undefined,
    clause.arg ? spellFor(line, clause.arg.text, options, clause.arg.rank) : undefined,
  );
}

/**
 * Renders one outcome per group: "If A, cast X on your focus; otherwise cast X on
 * your target". Used when the groups redirect to different units, where the compact
 * "A or B" form would describe two different behaviours as if they were one.
 */
function describeGroupOutcomes(
  line: Line, clause: Clause, mode: 'do' | 'show', ctx?: DescContext,
): string {
  const segments = clause.groups.map((group, gi) => {
    const tests = describeGroupTests(group, ctx);
    const action = clauseAction(line, clause, mode, groupUnit(group) ?? 'target');
    if (!tests) return gi === 0 ? capitaliseFragment(action) : `otherwise ${action}`;
    const lead = gi === 0 ? (clause.index === 0 ? 'If' : 'Otherwise, if') : 'otherwise if';
    return `${lead} ${tests}, ${action}`;
  });
  return segments.join('; ');
}

function clauseAction(
  line: Line, clause: Clause, mode: 'do' | 'show', unit: string | null,
): string {
  const arg = clause.arg?.text ?? '';

  if (mode === 'show') {
    return arg
      ? `the button shows ${arg}`
      : 'the button shows the first spell or item this macro uses';
  }

  const def = line.command?.def;
  if (!def) return arg ? `use ${arg}` : 'do nothing';

  const name = line.command?.name.toLowerCase() ?? '';
  const target = unit && UNIT_TARGETING.has(name) ? ` on ${describeUnit(unit)}` : '';

  if (clause.sequence) {
    const names = clause.sequence.spells.map((s) => s.text);
    return names.length
      ? `step through ${joinList(names, 'and')}${target}`
      : 'advance the sequence';
  }

  // Commands like /target and /petattack take their object from [@unit], not an argument.
  if (!arg) {
    return unit && def.unitAction ? def.unitAction(describeUnit(unit)) : def.action('');
  }
  const rank = clause.arg?.rank ? ` (rank ${clause.arg.rank})` : '';
  return def.action(arg) + rank + target;
}

function describeReset(parts: string[]): string {
  const phrases = parts.map((p) => {
    if (/^\d+$/.test(p)) return `after ${p} second${p === '1' ? '' : 's'} of not pressing it`;
    switch (p.toLowerCase()) {
      case 'combat': return 'when you leave combat';
      case 'target': return 'when you change target';
      case 'shift': return 'if you hold Shift';
      case 'ctrl': return 'if you hold Ctrl';
      case 'alt': return 'if you hold Alt';
      default: return `on "${p}"`;
    }
  });
  return joinList(phrases, 'or');
}

// --- Summary ---------------------------------------------------------------

function summarise(ast: MacroAst, options: ExplainOptions = {}): string {
  const parts: string[] = [];
  const flavour = FLAVOURS[ast.flavour];

  const meta = ast.lines.find((l) => l.kind === 'meta');
  if (meta) {
    const shown = meta.clauses.map((c) => c.arg?.text).filter(Boolean);
    parts.push(shown.length
      ? `The button shows ${joinList(shown as string[], 'or')}.`
      : 'The button shows whatever this macro casts first.');
  }

  const steps = ast.lines
    .filter((l) => l.kind === 'command' && l.command?.def)
    .map((l) => summariseLine(l, ast, options))
    .filter(Boolean) as string[];

  if (steps.length === 0) {
    return parts.length ? parts.join(' ') : 'Start typing a macro and it will be explained here, line by line.';
  }

  parts.push(`When you press it: ${steps.join(', then ')}.`);

  const errorCount = ast.issues.filter((i) => i.severity === 'error').length;
  if (errorCount) {
    const plural = errorCount === 1 ? '' : 's';
    parts.push(
      `${errorCount} problem${plural} need${errorCount === 1 ? 's' : ''} fixing before this will work.`,
    );
  }
  if (flavour.provisional) {
    parts.push(`${flavour.shortLabel} rules are provisional.`);
  }
  return parts.join(' ');
}

function summariseLine(line: Line, ast: MacroAst, options: ExplainOptions = {}): string | null {
  const def = line.command?.def;
  if (!def) return null;

  if (def.args !== 'conditional') {
    const arg = line.rawArg?.text ?? '';
    return arg ? def.action(arg) : null;
  }

  const bits = line.clauses
    .map((clause, i) => {
      if (!clause.groups.length || !hasAnyTests(clause.groups)) {
        const action = clauseAction(line, clause, 'do', sharedExplicitUnit(clause.groups));
        if (!clause.arg?.text && i > 0) return 'otherwise do nothing';
        return i === 0 ? action : `otherwise ${action}`;
      }
      if (unitsDiffer(clause.groups)) {
        return lowerFirst(describeGroupOutcomes(line, clause, 'do', descContext(ast, options)));
      }
      const action = clauseAction(line, clause, 'do', sharedExplicitUnit(clause.groups));
      const conds = describeGroups(clause.groups, descContext(ast, options));
      return `${i === 0 ? 'if' : 'otherwise if'} ${conds}, ${action}`;
    })
    .filter(Boolean);

  return bits.length ? bits.join('; ') : null;
}

/** Capitalise without forcing a full stop — the caller is still building the sentence. */
function capitaliseFragment(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function capitalise(s: string): string {
  if (!s) return s;
  const text = s.charAt(0).toUpperCase() + s.slice(1);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * The action a clause performs, given the unit it resolved to. Used by the simulator
 * to state the concrete outcome once a group has actually won.
 */
export function describeAction(line: Line, clause: Clause, unit: string | null): string {
  return clauseAction(line, clause, 'do', unit);
}

export { groupUnit };
