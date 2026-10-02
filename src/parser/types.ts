import type { CommandDef, ConditionalDef, MetaCommandDef } from '../data/types';
import type { FlavourId } from '../flavours';

export type NodeId = string;

export interface Span {
  start: number;
  end: number;
}

export interface TextSpan extends Span {
  text: string;
}

export type TokenType =
  | 'comment' | 'meta' | 'command' | 'bracket' | 'cond-name' | 'cond-neg'
  | 'cond-value' | 'punct' | 'unit' | 'sep' | 'arg' | 'reset' | 'rank'
  | 'lua' | 'text' | 'bang' | 'unknown';

export type Severity = 'error' | 'warning' | 'info';

/**
 * A highlightable run of source. Tokens never span a newline, which is what lets the
 * overlay render line-by-line and stay aligned with the textarea.
 */
export interface Token extends Span {
  type: TokenType;
  nodeId?: NodeId;
  severity?: Severity;
}

export interface Issue extends Span {
  severity: Severity;
  message: string;
  suggestion?: string;
  line: number;
  nodeId?: NodeId;
}

export type ConditionKind = 'test' | 'unit' | 'invalid';

export interface ConditionValue extends TextSpan {}

export interface Condition extends Span {
  id: NodeId;
  kind: ConditionKind;
  raw: string;
  negated: boolean;
  /** Lowercased conditional name; empty for unit assignments. */
  name: string;
  nameSpan: Span | null;
  values: ConditionValue[];
  /** For [@unit] and the legacy [target=unit] form. */
  unit: string | null;
  def: ConditionalDef | null;
}

export interface CondGroup extends Span {
  id: NodeId;
  conditions: Condition[];
  closed: boolean;
  /** `[]` — an always-true group. */
  empty: boolean;
}

/**
 * A spell name argument. `rank` is only ever set on flavours whose features include
 * spellRanks -- on Midnight the "(Rank 3)" stays part of the name, which is exactly
 * what the game does with it.
 */
export interface SpellArg extends TextSpan {
  rank?: number;
}

export interface SequenceInfo {
  reset: (TextSpan & { parts: string[] }) | null;
  spells: SpellArg[];
}

export interface Clause extends Span {
  id: NodeId;
  index: number;
  /** OR-ed together; each group's conditions are AND-ed. */
  groups: CondGroup[];
  arg: SpellArg | null;
  /** `/cast !Spell` — do not toggle the aura off. */
  bang: boolean;
  sequence?: SequenceInfo;
}

export type LineKind = 'blank' | 'comment' | 'meta' | 'command' | 'invalid';

export interface Line extends Span {
  id: NodeId;
  /** 1-based. */
  number: number;
  kind: LineKind;
  raw: string;
  command?: { name: string; span: Span; def: CommandDef | null };
  meta?: { name: string; span: Span; def: MetaCommandDef | null };
  clauses: Clause[];
  /** Whole-argument span for `text` and `lua` commands, which take no conditionals. */
  rawArg?: TextSpan;
  tokens: Token[];
}

export interface MacroAst {
  source: string;
  flavour: FlavourId;
  lines: Line[];
  issues: Issue[];
  charCount: number;
}

export const MACRO_CHAR_LIMIT = 255;
