// Evaluates a parsed macro against a simulated situation.
//
// Three-valued throughout. Plenty of conditionals cannot be modelled from a panel of
// toggles -- [known:X], [equipped:X], [bonusbar:2] -- and the honest answer there is
// "I don't know", not a guess. Those propagate to 'maybe' verdicts so the UI can say
// "this might fire" instead of inventing a result.

import type { Truth } from '../data/types';
import type { Clause, CondGroup, Condition, MacroAst, NodeId } from '../parser/types';
import { resolveUnitSlot, type SimState, type UnitState } from './state';

export type Verdict = 'fires' | 'skipped' | 'maybe' | 'unreachable';

export interface ClauseResult {
  id: NodeId;
  index: number;
  truth: Truth;
  verdict: Verdict;
  /** The group that decided it, when one did. */
  firedGroupId: NodeId | null;
  /** The unit that group acts on, for describing the outcome. */
  unit: string | null;
  /** Every condition in the clause and how it came out, so the UI can show why. */
  conditions: Map<NodeId, Truth>;
}

export interface LineResult {
  id: NodeId;
  number: number;
  /** False when an earlier /stopmacro definitely aborted the macro. */
  executed: boolean;
  /** True when an earlier /stopmacro *might* have aborted it. */
  conditional: boolean;
  clauses: ClauseResult[];
  firedClauseId: NodeId | null;
}

export interface SimResult {
  lines: LineResult[];
  byClause: Map<NodeId, ClauseResult>;
  /** Flattened per-condition results: this is what turns "skipped" into "why". */
  byCondition: Map<NodeId, Truth>;
  /** Clause ids that definitely fire, in execution order. */
  firing: NodeId[];
  stopped: boolean;
}

function and(values: Truth[]): Truth {
  if (values.some((v) => v === false)) return false;
  if (values.some((v) => v === 'unknown')) return 'unknown';
  return true;
}

function or(values: Truth[]): Truth {
  if (values.some((v) => v === true)) return true;
  if (values.some((v) => v === 'unknown')) return 'unknown';
  return false;
}

function negate(truth: Truth): Truth {
  return truth === 'unknown' ? 'unknown' : !truth;
}

function unitFor(group: CondGroup, state: SimState): UnitState | null {
  for (let i = group.conditions.length - 1; i >= 0; i--) {
    const c = group.conditions[i];
    if (c.kind === 'unit' && c.unit) {
      const slot = resolveUnitSlot(c.unit);
      return slot ? state.units[slot] : null;
    }
  }
  return state.units.target;
}

function groupUnitToken(group: CondGroup): string | null {
  for (let i = group.conditions.length - 1; i >= 0; i--) {
    const c = group.conditions[i];
    if (c.kind === 'unit' && c.unit) return c.unit;
  }
  return null;
}

export function evaluateCondition(cond: Condition, state: SimState, unit: UnitState | null): Truth {
  // Unit redirects are not tests -- they only choose who the other tests apply to.
  if (cond.kind === 'unit') return true;
  if (cond.kind === 'invalid' || !cond.def || !cond.def.test) return 'unknown';
  const raw = cond.def.test({ values: cond.values.map((v) => v.text), state, unit });
  return cond.negated ? negate(raw) : raw;
}

export interface GroupEvaluation {
  truth: Truth;
  conditions: Map<NodeId, Truth>;
}

/**
 * Note this does not short-circuit: every condition is evaluated so the UI can show
 * which one failed. `and()` would be the same answer either way.
 */
export function evaluateGroup(group: CondGroup, state: SimState): GroupEvaluation {
  const conditions = new Map<NodeId, Truth>();
  if (group.empty || group.conditions.length === 0) return { truth: true, conditions };
  const unit = unitFor(group, state);
  const results = group.conditions.map((c) => {
    const truth = evaluateCondition(c, state, unit);
    // Unit redirects are not tests -- they choose who the tests apply to -- so they
    // get no pass/fail marker. A tick beside [@mouseover] implies a check that is not
    // happening.
    if (c.kind !== 'unit') conditions.set(c.id, truth);
    return truth;
  });
  return { truth: and(results), conditions };
}

export function evaluateClause(clause: Clause, state: SimState): {
  truth: Truth; firedGroupId: NodeId | null; unit: string | null; conditions: Map<NodeId, Truth>;
} {
  const conditions = new Map<NodeId, Truth>();
  if (clause.groups.length === 0) {
    return { truth: true, firedGroupId: null, unit: null, conditions };
  }
  const results = clause.groups.map((group) => {
    const evaluation = evaluateGroup(group, state);
    for (const [id, truth] of evaluation.conditions) conditions.set(id, truth);
    return { group, truth: evaluation.truth };
  });
  const winner = results.find((r) => r.truth === true) ?? results.find((r) => r.truth === 'unknown');
  return {
    truth: or(results.map((r) => r.truth)),
    firedGroupId: winner ? winner.group.id : null,
    unit: winner ? groupUnitToken(winner.group) : null,
    conditions,
  };
}

export function evaluateMacro(ast: MacroAst, state: SimState): SimResult {
  const lines: LineResult[] = [];
  const byClause = new Map<NodeId, ClauseResult>();
  const byCondition = new Map<NodeId, Truth>();
  const firing: NodeId[] = [];

  let stopped = false;
  let maybeStopped = false;

  for (const line of ast.lines) {
    if (line.kind !== 'command' && line.kind !== 'meta') continue;

    const result: LineResult = {
      id: line.id,
      number: line.number,
      executed: !stopped,
      conditional: maybeStopped,
      clauses: [],
      firedClauseId: null,
    };

    // A line the macro never reaches still gets listed, just marked unreachable.
    let settled = false;
    let uncertain = false;

    for (const clause of line.clauses) {
      const { truth, firedGroupId, unit, conditions } = evaluateClause(clause, state);
      for (const [id, value] of conditions) byCondition.set(id, value);
      let verdict: Verdict;

      if (!result.executed || settled) {
        verdict = 'unreachable';
      } else if (truth === true) {
        verdict = uncertain || result.conditional ? 'maybe' : 'fires';
        settled = true;
      } else if (truth === 'unknown') {
        verdict = 'maybe';
        uncertain = true;
      } else {
        verdict = 'skipped';
      }

      const cr: ClauseResult = {
        id: clause.id, index: clause.index, truth, verdict, firedGroupId, unit, conditions,
      };
      result.clauses.push(cr);
      byClause.set(clause.id, cr);

      if (verdict === 'fires' && !result.firedClauseId) {
        result.firedClauseId = clause.id;
        firing.push(clause.id);
      }
    }

    lines.push(result);

    // /stopmacro aborts everything below it.
    if (line.kind === 'command' && line.command?.name.toLowerCase() === '/stopmacro') {
      const fired = result.clauses.find((c) => c.verdict === 'fires');
      const might = result.clauses.find((c) => c.verdict === 'maybe');
      if (fired) stopped = true;
      else if (might) maybeStopped = true;
    }
  }

  return { lines, byClause, byCondition, firing, stopped };
}
