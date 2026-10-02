import { describeUnit } from '../data/units';
import type { CondGroup, Condition } from '../parser/types';

export function joinList(parts: string[], conjunction: 'and' | 'or'): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} ${conjunction} ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} ${conjunction} ${parts[parts.length - 1]}`;
}

/** The unit a group redirects to, if any. */
export function groupUnit(group: CondGroup): string | null {
  for (let i = group.conditions.length - 1; i >= 0; i--) {
    const c = group.conditions[i];
    if (c.kind === 'unit' && c.unit) return c.unit;
  }
  return null;
}

/**
 * Conditionals default to testing your current target, so naming the unit explicitly
 * is what stops [@mouseover,help] and [help] reading identically.
 */
export function unitLabelFor(group: CondGroup): string {
  return describeUnit(groupUnit(group) ?? 'target');
}

export function describeCondition(
  cond: Condition, unitLabel?: string, classId?: number,
): string {
  if (cond.kind === 'unit') {
    return `act on ${describeUnit(cond.unit ?? '')} instead of your current target`;
  }
  if (!cond.def) return `"${cond.name}" is not a condition the game understands`;
  return cond.def.desc(cond.values.map((v) => v.text), cond.negated, unitLabel, classId);
}

/**
 * AND-ed tests within a group, excluding the unit redirect.
 *
 * The unit is named once and then elided, so three tests on the same unit read
 * "your mouseover is friendly, is not dead and exists" rather than repeating the
 * whole noun phrase each time.
 */
export function describeGroupTests(group: CondGroup, classId?: number): string {
  const label = unitLabelFor(group);
  let labelUsed = false;
  const tests = group.conditions
    .filter((c) => c.kind !== 'unit')
    .map((c) => {
      const phrase = describeCondition(c, label, classId);
      if (phrase.startsWith(`${label} `)) {
        if (labelUsed) return phrase.slice(label.length + 1);
        labelUsed = true;
      }
      return phrase;
    });
  return joinList(tests, 'and');
}

/** The unit each group resolves to, defaulting to the implicit current target. */
function unitKeys(groups: CondGroup[]): string[] {
  return groups.map((g) => (groupUnit(g) ?? 'target').toLowerCase());
}

/**
 * True when the groups act on different units, so each needs spelling out separately.
 * `[mod:shift,@focus][]` qualifies: the fallback casts on your target, not your focus.
 */
export function unitsDiffer(groups: CondGroup[]): boolean {
  return new Set(unitKeys(groups)).size > 1;
}

/** The one unit every group shares, but only if the author actually wrote one. */
export function sharedExplicitUnit(groups: CondGroup[]): string | null {
  const keys = new Set(unitKeys(groups));
  if (keys.size !== 1) return null;
  return groups.some((g) => groupUnit(g)) ? [...keys][0] : null;
}

/**
 * True if any group actually tests something. `[@focus]` and `[]` do not: they only
 * redirect the unit, so there is no condition to state and the clause always fires.
 */
export function hasAnyTests(groups: CondGroup[]): boolean {
  return groups.some((g) => g.conditions.some((c) => c.kind !== 'unit'));
}

/** OR-ed groups for the compact form: "(A and B) or C". */
export function describeGroups(groups: CondGroup[], classId?: number): string {
  const parts = groups.map((g) => {
    const tests = describeGroupTests(g, classId);
    if (!tests) return 'unconditionally';
    const multi = g.conditions.filter((c) => c.kind !== 'unit').length > 1;
    return groups.length > 1 && multi ? `(${tests})` : tests;
  });
  return joinList(parts, 'or');
}
