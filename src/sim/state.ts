// The "situation" the simulator evaluates a macro against.
//
// Deliberately models only what a user can meaningfully toggle. Anything we cannot
// know from these toggles (which spells you know, what you have equipped, which bonus
// bar is up) is reported as 'unknown' by the evaluator rather than guessed at.

export type UnitSlot = 'target' | 'focus' | 'mouseover' | 'pet' | 'player';

export const UNIT_SLOTS: UnitSlot[] = ['target', 'focus', 'mouseover', 'pet', 'player'];

export type Reaction = 'friendly' | 'hostile' | 'neutral';

export interface UnitState {
  exists: boolean;
  reaction: Reaction;
  dead: boolean;
  inParty: boolean;
  inRaid: boolean;
}

export interface SimState {
  modifiers: { shift: boolean; ctrl: boolean; alt: boolean };
  button: 1 | 2 | 3 | 4 | 5;

  combat: boolean;
  stealth: boolean;
  mounted: boolean;
  swimming: boolean;
  flying: boolean;
  flyable: boolean;
  advflyable: boolean;
  indoors: boolean;
  resting: boolean;
  petbattle: boolean;
  channeling: boolean;

  /** 0 = no form / caster form. */
  form: number;
  spec: number;
  actionbar: number;

  group: 'none' | 'party' | 'raid';

  hasPet: boolean;
  /** Pet family or name, for [pet:Voidwalker]. */
  petName: string;

  units: Record<UnitSlot, UnitState>;
}

function unit(partial: Partial<UnitState> = {}): UnitState {
  return {
    exists: true,
    reaction: 'hostile',
    dead: false,
    inParty: false,
    inRaid: false,
    ...partial,
  };
}

export function defaultSimState(): SimState {
  return {
    modifiers: { shift: false, ctrl: false, alt: false },
    button: 1,
    combat: true,
    stealth: false,
    mounted: false,
    swimming: false,
    flying: false,
    flyable: false,
    advflyable: false,
    indoors: false,
    resting: false,
    petbattle: false,
    channeling: false,
    form: 0,
    spec: 1,
    actionbar: 1,
    group: 'none',
    hasPet: false,
    petName: '',
    units: {
      target: unit({ reaction: 'hostile' }),
      focus: unit({ exists: false }),
      mouseover: unit({ exists: false }),
      pet: unit({ exists: false, reaction: 'friendly' }),
      player: unit({ exists: true, reaction: 'friendly' }),
    },
  };
}

/** Units the simulator can model. Anything else (raid7, arena2, ...) is 'unknown'. */
export function resolveUnitSlot(unitToken: string | null): UnitSlot | null {
  if (!unitToken) return 'target';
  const u = unitToken.toLowerCase();
  if (u === 'none') return null;
  return (UNIT_SLOTS as string[]).includes(u) ? (u as UnitSlot) : null;
}
