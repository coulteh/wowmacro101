import type { AvailabilityMap, FlavourId } from '../flavours';
import type { SimState, UnitState } from '../sim/state';

/** Tri-state: the simulator never guesses at things it cannot model. */
export type Truth = boolean | 'unknown';

export interface EvalContext {
  values: string[];
  state: SimState;
  /** The clause's resolved unit, or null if we cannot model it (e.g. raid7). */
  unit: UnitState | null;
}

export interface ConditionalDef {
  name: string;
  aliases?: string[];
  category: string;
  value: 'none' | 'optional' | 'required';
  values?: string[];
  /** True when `values` is a closed enum, so unknown values are worth warning about. */
  strictValues?: boolean;
  short: string;
  /**
   * Plain-English phrase. Negation is handled here so wording stays natural.
   * `unit` is how to name the unit under test, e.g. 'the unit under your mouse cursor'.
   * `classId` is the selected class, which lets [spec:N] name the specialisation.
   */
  desc: (values: string[], negated: boolean, unit?: string, classId?: number) => string;
  note?: string;
  availability?: AvailabilityMap;
  flavourNotes?: Partial<Record<FlavourId, string>>;
  /** Un-negated truth. The caller applies negation; negating 'unknown' stays 'unknown'. */
  test?: (ctx: EvalContext) => Truth;
}

export type CommandArgKind = 'conditional' | 'text' | 'lua' | 'none';

export interface CommandDef {
  names: string[];
  category: string;
  args: CommandArgKind;
  requiresArg: boolean;
  short: string;
  long: string;
  syntax: string;
  action: (arg: string) => string;
  /** For commands that take their object from [@unit] rather than an argument. */
  unitAction?: (unitDescription: string) => string;
  availability?: AvailabilityMap;
  flavourNotes?: Partial<Record<FlavourId, string>>;
}

export interface MetaCommandDef {
  names: string[];
  short: string;
  long: string;
  syntax: string;
}
