// Macro parser.
//
// Line-oriented and hand-written. Every node carries absolute offsets into the source
// string: those offsets drive the highlight overlay, the hover-sync between the
// explanation pane and the editor, and the squiggles, so they are load-bearing.
//
// There is no separate lexer pass. The grammar is small enough that scanning directly
// into the AST is clearer, and the highlight tokens fall out of the same walk.

import { lookupCommand, allCommandNames, METACOMMANDS } from '../data/commands';
import { ANY_CLASS, className } from '../data/classes';
import { belongsToClass, type SpellIndex } from '../data/spells';
import { lookupConditional, allConditionalNames, suggest } from '../data/conditionals';
import { isValidUnit, UNIT_TOKENS } from '../data/units';
import { DEFAULT_FLAVOUR, FLAVOURS, availabilityOf, type FlavourId } from '../flavours';
import {
  MACRO_CHAR_LIMIT,
  type Clause, type CondGroup, type Condition, type Issue, type Line,
  type MacroAst, type SequenceInfo, type Severity, type Span, type SpellArg,
  type TextSpan, type Token, type TokenType,
} from './types';

const RESET_KEYWORDS = new Set(['combat', 'target', 'shift', 'ctrl', 'alt']);
/** Classic downranking: `/cast Fireball(Rank 3)`. */
const RANK_SUFFIX = /\s*\(\s*rank\s*(\d+)\s*\)\s*$/i;
/** Commands whose argument is a spell or aura name worth checking against the dataset. */
export const SPELL_NAME_COMMANDS = new Set([
  '/cast', '/spell', '/castsequence', '/castrandom', '/cancelaura',
]);
/** Commands that actually cast a spell, for the "one cast per press" check. */
const CASTING_COMMANDS = new Set(['/cast', '/spell', '/castsequence', '/castrandom']);

export interface ParseOptions {
  /** Optional bundled spell list. Absent means no spell-name hints at all. */
  spells?: SpellIndex | null;
  /** Selected class. ANY_CLASS (0) or omitted means no class checking. */
  classId?: number;
}

class Ctx {
  idc = 0;
  issues: Issue[] = [];
  constructor(
    readonly source: string,
    readonly flavour: FlavourId,
    readonly spells: SpellIndex | null = null,
    readonly classId: number = ANY_CLASS,
  ) {}

  id(prefix: string): string {
    return `${prefix}${++this.idc}`;
  }

  issue(
    severity: Severity, message: string, span: Span, line: number,
    extra: { suggestion?: string; nodeId?: string } = {},
  ): void {
    this.issues.push({ severity, message, line, start: span.start, end: span.end, ...extra });
  }
}

function trimSpan(text: string, start: number): TextSpan {
  const lead = text.length - text.replace(/^\s+/, '').length;
  const trimmed = text.trim();
  return { text: trimmed, start: start + lead, end: start + lead + trimmed.length };
}

function splitWithOffsets(text: string, start: number, sep: string): TextSpan[] {
  const out: TextSpan[] = [];
  let from = 0;
  for (;;) {
    const idx = text.indexOf(sep, from);
    const chunk = idx === -1 ? text.slice(from) : text.slice(from, idx);
    out.push(trimSpan(chunk, start + from));
    if (idx === -1) break;
    from = idx + sep.length;
  }
  return out;
}

export function parseMacro(
  source: string,
  flavour: FlavourId = DEFAULT_FLAVOUR,
  options: ParseOptions = {},
): MacroAst {
  const ctx = new Ctx(source, flavour, options.spells ?? null, options.classId ?? ANY_CLASS);
  const lines: Line[] = [];

  let offset = 0;
  const rawLines = source.split('\n');
  rawLines.forEach((raw, i) => {
    lines.push(parseLine(ctx, raw, offset, i + 1));
    offset += raw.length + 1;
  });

  validateMacro(ctx, lines, source);

  for (const line of lines) line.tokens.sort((a, b) => a.start - b.start);
  ctx.issues.sort((a, b) => a.start - b.start);

  return {
    source,
    flavour,
    lines,
    issues: ctx.issues,
    charCount: source.length,
  };
}

function parseLine(ctx: Ctx, raw: string, lineStart: number, number: number): Line {
  const line: Line = {
    id: ctx.id('L'),
    number,
    kind: 'blank',
    raw,
    start: lineStart,
    end: lineStart + raw.length,
    clauses: [],
    tokens: [],
  };

  const lead = raw.length - raw.replace(/^\s+/, '').length;
  // Trailing whitespace is tolerated everywhere: the game hands macro bodies back with it.
  const body = raw.slice(lead);
  const bodyStart = lineStart + lead;

  if (body.trim() === '') return line;

  if (body.startsWith('#')) return parseMetaOrComment(ctx, line, body, bodyStart);
  if (body.startsWith('/')) return parseCommandLine(ctx, line, body, bodyStart);

  line.kind = 'invalid';
  const span = trimSpan(body, bodyStart);
  line.tokens.push({ ...span, type: 'unknown', severity: 'error', nodeId: line.id });
  ctx.issue(
    'error',
    'Macro lines must start with a slash command (or # for a comment).',
    span, number, { nodeId: line.id },
  );
  return line;
}

function parseMetaOrComment(ctx: Ctx, line: Line, body: string, bodyStart: number): Line {
  const m = /^#show(tooltip)?\b/i.exec(body);
  if (!m) {
    line.kind = 'comment';
    const span = trimSpan(body, bodyStart);
    line.tokens.push({ ...span, type: 'comment', nodeId: line.id });
    return line;
  }

  line.kind = 'meta';
  const name = m[0];
  const span = { start: bodyStart, end: bodyStart + name.length };
  const def = METACOMMANDS.find((mc) => mc.names.includes(name.toLowerCase())) ?? null;
  line.meta = { name, span, def };
  line.tokens.push({ ...span, type: 'meta', nodeId: line.id });

  // #showtooltip takes the same conditional clauses as /cast.
  const rest = body.slice(name.length);
  line.clauses = parseClauses(ctx, line, rest, bodyStart + name.length, true);
  return line;
}

function parseCommandLine(ctx: Ctx, line: Line, body: string, bodyStart: number): Line {
  line.kind = 'command';
  const m = /^\/[A-Za-z0-9_]+/.exec(body)!;
  const name = m[0];
  const span = { start: bodyStart, end: bodyStart + name.length };
  const def = lookupCommand(name);
  line.command = { name, span, def };
  line.tokens.push({
    ...span, type: 'command', nodeId: line.id, ...(def ? {} : { severity: 'error' as const }),
  });

  if (!def) {
    const hint = suggest(name, allCommandNames());
    ctx.issue('error', `Unknown slash command "${name}".`, span, line.number, {
      ...(hint ? { suggestion: hint } : {}),
      nodeId: line.id,
    });
  } else if (availabilityOf(def, ctx.flavour) !== 'yes') {
    noteFlavour(ctx, def, span, line);
  }

  const argText = body.slice(name.length);
  const argStart = bodyStart + name.length;
  const kind = def?.args ?? 'conditional';

  if (kind === 'lua' || kind === 'text') {
    const arg = trimSpan(argText, argStart);
    line.rawArg = arg;
    if (arg.text) {
      line.tokens.push({ ...arg, type: kind === 'lua' ? 'lua' : 'text', nodeId: line.id });
      if (/\[[^\]]*\]/.test(arg.text)) {
        ctx.issue(
          'warning',
          `${name} does not support [conditions] — the brackets are sent as literal text.`,
          arg, line.number, { nodeId: line.id },
        );
      }
    } else if (def?.requiresArg) {
      ctx.issue('error', `${name} needs something after it.`, span, line.number, { nodeId: line.id });
    }
    return line;
  }

  if (kind === 'none') {
    const arg = trimSpan(argText, argStart);
    if (arg.text) {
      line.tokens.push({ ...arg, type: 'unknown', severity: 'warning', nodeId: line.id });
      ctx.issue('warning', `${name} takes no arguments; "${arg.text}" is ignored.`, arg, line.number);
    }
    return line;
  }

  line.clauses = parseClauses(ctx, line, argText, argStart, false);
  return line;
}

/** Split on `;` at bracket depth 0, then parse each clause. */
function parseClauses(
  ctx: Ctx, line: Line, text: string, start: number, isMeta: boolean,
): Clause[] {
  const clauses: Clause[] = [];
  let depth = 0;
  let from = 0;

  const flush = (endIdx: number) => {
    clauses.push(parseClause(ctx, line, text.slice(from, endIdx), start + from, clauses.length));
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ';' && depth === 0) {
      flush(i);
      line.tokens.push({ start: start + i, end: start + i + 1, type: 'sep', nodeId: line.id });
      from = i + 1;
    }
  }
  flush(text.length);

  validateClauses(ctx, line, clauses, isMeta);
  return clauses;
}

function parseClause(
  ctx: Ctx, line: Line, text: string, start: number, index: number,
): Clause {
  const clause: Clause = {
    id: ctx.id('C'),
    index,
    groups: [],
    arg: null,
    bang: false,
    start,
    end: start + text.length,
  };

  let i = 0;
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] !== '[') break;
    const group = parseGroup(ctx, line, text, i, start, clause);
    clause.groups.push(group);
    i = group.end - start;
  }

  const rest = text.slice(i);
  const arg = trimSpan(rest, start + i);
  if (arg.text) {
    let argText = arg.text;
    let argStart = arg.start;
    if (argText.startsWith('!')) {
      clause.bang = true;
      line.tokens.push({ start: argStart, end: argStart + 1, type: 'bang', nodeId: clause.id });
      argText = argText.slice(1).trim();
      argStart = arg.end - argText.length;
    }
    const raw: TextSpan = { text: argText, start: argStart, end: argStart + argText.length };

    const cmd = line.command?.name.toLowerCase();
    if (cmd === '/castsequence') {
      clause.arg = raw;
      clause.sequence = parseSequence(ctx, line, clause, raw);
    } else {
      clause.arg = splitRank(ctx, line, clause.id, raw);
      const checkable = line.kind === 'meta' || (cmd && SPELL_NAME_COMMANDS.has(cmd));
      if (checkable) {
        checkSpellName(ctx, line, clause.arg);
        checkSpellClass(ctx, line, clause.arg);
        checkSpellRank(ctx, line, clause.arg);
      }
    }
  }

  return clause;
}

function parseGroup(
  ctx: Ctx, line: Line, text: string, openRel: number, base: number, clause: Clause,
): CondGroup {
  const openAbs = base + openRel;
  const closeRel = text.indexOf(']', openRel + 1);
  const closed = closeRel !== -1;
  const contentRel = openRel + 1;
  const contentEndRel = closed ? closeRel : text.length;
  const content = text.slice(contentRel, contentEndRel);

  const group: CondGroup = {
    id: ctx.id('G'),
    conditions: [],
    closed,
    empty: content.trim() === '',
    start: openAbs,
    end: base + (closed ? closeRel + 1 : text.length),
  };

  line.tokens.push({ start: openAbs, end: openAbs + 1, type: 'bracket', nodeId: group.id });
  if (closed) {
    line.tokens.push({
      start: base + closeRel, end: base + closeRel + 1, type: 'bracket', nodeId: group.id,
    });
  } else {
    ctx.issue('error', 'Unclosed "[" — this condition group has no matching "]".',
      { start: openAbs, end: group.end }, line.number, { nodeId: group.id });
  }

  if (!group.empty) {
    for (const part of splitWithOffsets(content, base + contentRel, ',')) {
      const cond = parseCondition(ctx, line, part, clause);
      if (cond) group.conditions.push(cond);
    }
  }

  return group;
}

function parseCondition(
  ctx: Ctx, line: Line, part: TextSpan, clause: Clause,
): Condition | null {
  if (!part.text) return null;

  const cond: Condition = {
    id: ctx.id('K'),
    kind: 'test',
    raw: part.text,
    negated: false,
    name: '',
    nameSpan: null,
    values: [],
    unit: null,
    def: null,
    start: part.start,
    end: part.end,
  };

  // Unit assignment: [@focus] or the legacy [target=focus].
  const at = /^@(.*)$/.exec(part.text);
  const legacy = /^target\s*=\s*(.*)$/i.exec(part.text);
  if (at || legacy) {
    const unitText = (at ? at[1] : legacy![1]).trim();
    const unitStart = part.end - unitText.length;
    cond.kind = 'unit';
    cond.unit = unitText;
    line.tokens.push({
      start: part.start, end: unitStart, type: 'punct', nodeId: cond.id,
    });
    line.tokens.push({
      ...{ start: unitStart, end: part.end }, type: 'unit', nodeId: cond.id,
      ...(isValidUnit(unitText) ? {} : { severity: 'error' as const }),
    });
    if (!unitText) {
      ctx.issue('error', 'Expected a unit after "@".', part, line.number, { nodeId: cond.id });
    } else if (!isValidUnit(unitText)) {
      const hint = suggest(unitText, UNIT_TOKENS.map((u) => u.name));
      ctx.issue('error', `"${unitText}" is not a valid unit token.`, part, line.number, {
        ...(hint ? { suggestion: hint } : {}), nodeId: cond.id,
      });
    }
    void clause;
    return cond;
  }

  const m = /^([A-Za-z]+)(?::([\s\S]*))?$/.exec(part.text);
  if (!m) {
    cond.kind = 'invalid';
    line.tokens.push({ ...part, type: 'unknown', severity: 'error', nodeId: cond.id });
    ctx.issue('error', `"${part.text}" is not valid condition syntax.`, part, line.number, {
      nodeId: cond.id,
    });
    return cond;
  }

  const [, word, valueText] = m;
  // Prefer an exact match so a real conditional starting with "no" is never mis-split.
  let name = word.toLowerCase();
  let def = lookupConditional(name);
  let nameStart = part.start;
  if (!def && name.startsWith('no') && name.length > 2) {
    const stripped = name.slice(2);
    const strippedDef = lookupConditional(stripped);
    if (strippedDef) {
      cond.negated = true;
      def = strippedDef;
      name = stripped;
      line.tokens.push({ start: part.start, end: part.start + 2, type: 'cond-neg', nodeId: cond.id });
      nameStart = part.start + 2;
    }
  }

  cond.name = name;
  cond.def = def;
  cond.nameSpan = { start: nameStart, end: nameStart + name.length };
  line.tokens.push({
    ...cond.nameSpan, type: 'cond-name', nodeId: cond.id,
    ...(def ? {} : { severity: 'error' as const }),
  });

  if (valueText !== undefined) {
    const colonAt = part.start + word.length;
    line.tokens.push({ start: colonAt, end: colonAt + 1, type: 'punct', nodeId: cond.id });
    const valueStart = colonAt + 1;
    for (const v of splitWithOffsets(valueText, valueStart, '/')) {
      if (!v.text) continue;
      cond.values.push(v);
      line.tokens.push({ ...v, type: 'cond-value', nodeId: cond.id });
    }
  }

  validateCondition(ctx, line, cond);
  return cond;
}

function parseSequence(ctx: Ctx, line: Line, clause: Clause, arg: TextSpan): SequenceInfo {
  const seq: SequenceInfo = { reset: null, spells: [] };
  let rest = arg.text;
  let restStart = arg.start;

  const m = /^reset\s*=\s*(\S+)\s*/i.exec(rest);
  if (m) {
    const resetText = m[1];
    const resetStart = restStart + m[0].indexOf(resetText);
    const parts = resetText.split('/').filter(Boolean);
    seq.reset = {
      text: resetText, parts,
      start: restStart, end: restStart + m[0].trimEnd().length,
    };
    line.tokens.push({ start: seq.reset.start, end: seq.reset.end, type: 'reset', nodeId: clause.id });

    for (const p of parts) {
      if (!RESET_KEYWORDS.has(p.toLowerCase()) && !/^\d+$/.test(p)) {
        ctx.issue(
          'warning',
          `"${p}" is not a valid reset condition. Use a number of seconds, or combat/target/shift/ctrl/alt.`,
          { start: resetStart, end: resetStart + resetText.length }, line.number,
          { nodeId: clause.id },
        );
      }
    }
    rest = rest.slice(m[0].length);
    restStart += m[0].length;
  }

  for (const spell of splitWithOffsets(rest, restStart, ',')) {
    if (!spell.text) continue;
    const step = splitRank(ctx, line, clause.id, spell);
    seq.spells.push(step);
    checkSpellName(ctx, line, step);
    checkSpellClass(ctx, line, step);
    checkSpellRank(ctx, line, step);
  }
  return seq;
}

/**
 * Splits a trailing `(Rank N)` off a spell argument. Returns the base name as the
 * argument so validation and tooltips work on the real spell, with the rank recorded
 * separately and its own token so it highlights distinctly.
 */
function splitRank(
  ctx: Ctx, line: Line, nodeId: string, arg: TextSpan,
): SpellArg {
  const ranksSupported = FLAVOURS[ctx.flavour].features.spellRanks;
  const match = RANK_SUFFIX.exec(arg.text);

  if (!ranksSupported) {
    // Porting a Classic macro to Midnight is a common mistake, and silently failing
    // to match any spell is a confusing way to find out.
    if (match) {
      ctx.issue(
        'info',
        `Spell ranks were removed in modern World of Warcraft, so "${arg.text}" will not `
        + `match a spell on ${FLAVOURS[ctx.flavour].shortLabel}. Drop the "(Rank ${match[1]})".`,
        arg, line.number, { nodeId },
      );
    }
    line.tokens.push({ ...arg, type: 'arg', nodeId });
    return arg;
  }

  if (!match) {
    line.tokens.push({ ...arg, type: 'arg', nodeId });
    return arg;
  }

  const baseText = arg.text.slice(0, match.index).trimEnd();
  const base: SpellArg = {
    text: baseText,
    start: arg.start,
    end: arg.start + baseText.length,
    rank: Number(match[1]),
  };
  line.tokens.push({ start: base.start, end: base.end, type: 'arg', nodeId });
  line.tokens.push({ start: arg.start + match.index, end: arg.end, type: 'rank', nodeId });
  return base;
}

/**
 * Warns when a spell definitively belongs to other classes.
 *
 * Unlike an unrecognised name this is something we know rather than guess, so it is a
 * warning rather than an info -- and it cannot false-positive, because a spell with no
 * class data returns 'unknown' and says nothing.
 */
function checkSpellClass(ctx: Ctx, line: Line, span: SpellArg): void {
  if (!ctx.spells || ctx.classId === ANY_CLASS) return;
  const spell = ctx.spells.lookup(span.text.trim(), span.rank);
  if (!spell || belongsToClass(spell, ctx.classId) !== false) return;
  const owners = spell.classes.join(' or ');
  ctx.issue(
    'warning',
    `${spell.name} is ${/^[AEIOU]/i.test(owners) ? 'an' : 'a'} ${owners} ability. `
    + `Your class is set to ${className(ctx.classId) ?? 'something else'}.`,
    span, line.number,
  );
}

/**
 * Flags `(Rank N)` for a rank the spell does not have.
 *
 * Info, never louder, for the same reason an unrecognised name is: the bundled dataset
 * lags a patch, and being confidently wrong about someone's macro is worse than silence.
 * Says nothing at all when we have no rank data for the name -- an unknown must never be
 * reported as a falsehood.
 */
function checkSpellRank(ctx: Ctx, line: Line, span: SpellArg): void {
  if (!ctx.spells || !span.rank) return;
  const name = span.text.trim();
  const ranks = ctx.spells.ranksFor(name);
  if (ranks.length === 0 || ranks.includes(span.rank)) return;
  const highest = ranks[ranks.length - 1];
  ctx.issue(
    'info',
    `${name} has ${ranks.length === 1 ? 'only rank 1' : `ranks 1 to ${highest}`} on `
    + `${FLAVOURS[ctx.flavour].shortLabel}, so "(Rank ${span.rank})" will not match `
    + `(build ${ctx.spells.build}).`,
    span, line.number,
  );
}

/** Soft check only: info level, never an error. */
function checkSpellName(ctx: Ctx, line: Line, span: TextSpan): void {
  const spells = ctx.spells;
  if (!spells) return;
  const name = span.text.trim();
  if (!name) return;
  if (/^\d+$/.test(name)) return;              // an inventory slot number
  if (/^(item|spell):/i.test(name)) return;     // an explicit id
  if (/[()]/.test(name)) return;                // rank syntax and the like
  if (spells.has(name)) return;
  ctx.issue(
    'info',
    `"${name}" is not in the bundled spell list (build ${spells.build}). `
    + 'Check the spelling, or ignore this if the spell is new, renamed, or an item.',
    span, line.number,
  );
}

// --- Validation ------------------------------------------------------------

function noteFlavour(
  ctx: Ctx,
  def: { availability?: Record<string, unknown>; flavourNotes?: Partial<Record<FlavourId, string>> },
  span: Span,
  line: Line,
): void {
  const flavour = FLAVOURS[ctx.flavour];
  const avail = availabilityOf(def as never, ctx.flavour);
  const note = def.flavourNotes?.[ctx.flavour];
  if (avail === 'no') {
    ctx.issue(
      'warning',
      `This parses, but can never be true on ${flavour.shortLabel}.${note ? ` ${note}` : ''}`,
      span, line.number,
    );
  } else if (avail === 'unknown') {
    ctx.issue(
      'info',
      `Unverified on ${flavour.shortLabel}.${note ? ` ${note}` : ''}`,
      span, line.number,
    );
  }
}

function validateCondition(ctx: Ctx, line: Line, cond: Condition): void {
  const span: Span = { start: cond.start, end: cond.end };

  if (!cond.def) {
    const hint = suggest(cond.name, allConditionalNames());
    ctx.issue('error', `Unknown condition "${cond.name}".`, span, line.number, {
      ...(hint ? { suggestion: hint } : {}), nodeId: cond.id,
    });
    return;
  }

  const def = cond.def;
  if (def.value === 'none' && cond.values.length) {
    ctx.issue('warning', `[${def.name}] takes no value; "${cond.values.map((v) => v.text).join('/')}" is ignored.`,
      span, line.number, { nodeId: cond.id });
  }
  if (def.value === 'required' && !cond.values.length) {
    const example = def.values?.length ? `[${def.name}:${def.values[0]}]` : `[${def.name}:...]`;
    ctx.issue(
      'warning', `[${def.name}] needs a value, e.g. ${example}.`,
      span, line.number, { nodeId: cond.id },
    );
  }
  if (def.strictValues && def.values) {
    const known = new Set(def.values.map((v) => v.toLowerCase()));
    for (const v of cond.values) {
      if (!known.has(v.text.toLowerCase())) {
        const hint = suggest(v.text, def.values);
        ctx.issue('warning', `"${v.text}" is not a recognised value for [${def.name}].`, v, line.number, {
          ...(hint ? { suggestion: hint } : {}), nodeId: cond.id,
        });
      }
    }
  }
  if (availabilityOf(def, ctx.flavour) !== 'yes') noteFlavour(ctx, def, span, line);
}

function validateClauses(ctx: Ctx, line: Line, clauses: Clause[], isMeta: boolean): void {
  const def = line.command?.def;
  const name = line.command?.name ?? '#showtooltip';

  clauses.forEach((clause, i) => {
    const isLast = i === clauses.length - 1;
    const hasArg = Boolean(clause.arg?.text);

    if (!hasArg && !isMeta && def?.requiresArg) {
      if (isLast && clauses.length > 1) {
        // The trailing-empty-clause idiom: deliberately do nothing.
        ctx.issue('info',
          'Empty final clause — if no earlier condition matches, this macro deliberately does nothing.',
          { start: clause.start, end: clause.end }, line.number, { nodeId: clause.id });
      } else {
        ctx.issue('error', `${name} needs something to act on.`,
          { start: clause.start, end: Math.max(clause.end, clause.start + 1) },
          line.number, { nodeId: clause.id });
      }
    }
  });
}

/** True when at least one clause both casts something and can never be skipped. */
function castsUnconditionally(line: Line): boolean {
  return line.clauses.some((clause) => {
    if (!clause.arg?.text && !clause.sequence?.spells.length) return false;
    if (clause.groups.length === 0) return true;
    // A group with no actual tests (`[]`, or only a unit redirect) always passes.
    return clause.groups.some(
      (group) => group.empty || group.conditions.every((cond) => cond.kind === 'unit'),
    );
  });
}

function validateMacro(ctx: Ctx, lines: Line[], source: string): void {
  if (source.length > MACRO_CHAR_LIMIT) {
    ctx.issue(
      'error',
      `Macros are limited to ${MACRO_CHAR_LIMIT} characters; this one is ${source.length}.`,
      { start: MACRO_CHAR_LIMIT, end: source.length }, lines.length,
    );
  }

  const meaningful = lines.filter((l) => l.kind !== 'blank');
  for (const line of meaningful) {
    if (line.kind === 'meta' && line !== meaningful[0]) {
      ctx.issue('warning',
        `${line.meta?.name} only works on the first line of a macro.`,
        line.meta ? line.meta.span : line, line.number, { nodeId: line.id });
    }
  }

  // Only one spell can actually be cast per button press. But two /cast lines with
  // mutually exclusive conditions are a perfectly good pattern, so only warn once an
  // earlier line is guaranteed to cast -- which is what makes a later one dead.
  const casts = lines.filter(
    (l) => l.kind === 'command'
      && CASTING_COMMANDS.has(l.command?.name.toLowerCase() ?? '')
      && l.clauses.some((c) => Boolean(c.arg?.text)),
  );
  let guaranteed: Line | null = null;
  for (const line of casts) {
    if (guaranteed) {
      ctx.issue('warning',
        `Only one spell can be cast per button press, and line ${guaranteed.number} always casts — `
        + 'so this line will not fire. Combine them into one /cast with conditions instead.',
        line.command ? line.command.span : line, line.number, { nodeId: line.id });
    } else if (castsUnconditionally(line)) {
      guaranteed = line;
    }
  }
}

export type { Token, TokenType };
