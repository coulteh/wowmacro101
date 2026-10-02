// Macro conditional dictionary.
//
// Each entry does triple duty: it documents the conditional, it produces the
// plain-English explanation, and it evaluates itself against a simulated situation.
// Keeping those together is what stops the explainer and the simulator drifting apart.

import type { ConditionalDef, EvalContext, Truth } from './types';

const no = (n: boolean) => (n ? 'not ' : '');
const U = (unit?: string) => unit ?? 'the unit';

/** Modifier keys read better named properly than shouted. */
const MOD_LABELS: Record<string, string> = {
  shift: 'Shift', ctrl: 'Ctrl', alt: 'Alt',
  lshift: 'Left Shift', rshift: 'Right Shift',
  lctrl: 'Left Ctrl', rctrl: 'Right Ctrl',
  lalt: 'Left Alt', ralt: 'Right Alt',
};
const modLabel = (v: string) => MOD_LABELS[v.toLowerCase()] ?? v;
const or = (vals: string[], fallback = '') => (vals.length ? vals.join(' or ') : fallback);

/** Does the resolved unit satisfy a predicate? Unmodellable unit -> 'unknown'. */
function onUnit(ctx: EvalContext, fn: (u: NonNullable<EvalContext['unit']>) => boolean): Truth {
  return ctx.unit ? fn(ctx.unit) : 'unknown';
}

const MODELLED_MODIFIERS = new Set(['shift', 'ctrl', 'alt']);

export const CONDITIONALS: ConditionalDef[] = [
  // --- Unit state ----------------------------------------------------------
  {
    name: 'help', category: 'Unit', value: 'none',
    short: 'Unit is friendly',
    desc: (_v, n, u) =>
      `${U(u)} ${n ? 'cannot' : 'can'} receive your helpful spells (is ${n ? 'not ' : ''}friendly)`,
    note: 'Checks "can I help this unit", not just faction. Neutral NPCs are neither [help] nor [harm].',
    test: (ctx) => onUnit(ctx, (u) => u.exists && u.reaction === 'friendly'),
  },
  {
    name: 'harm', category: 'Unit', value: 'none',
    short: 'Unit is hostile',
    desc: (_v, n, u) => `${U(u)} is ${no(n)}attackable (${n ? 'not hostile' : 'hostile'})`,
    note: 'Pair with nodead so you do not keep targeting corpses: [harm,nodead].',
    test: (ctx) => onUnit(ctx, (u) => u.exists && u.reaction === 'hostile'),
  },
  {
    name: 'exists', category: 'Unit', value: 'none',
    short: 'Unit exists',
    desc: (_v, n, u) => (n ? `${U(u)} does not exist` : `${U(u)} exists`),
    test: (ctx) => onUnit(ctx, (u) => u.exists),
  },
  {
    name: 'dead', category: 'Unit', value: 'none',
    short: 'Unit is dead',
    desc: (_v, n, u) => `${U(u)} is ${no(n)}dead`,
    test: (ctx) => onUnit(ctx, (u) => u.exists && u.dead),
  },
  {
    name: 'party', category: 'Unit', value: 'none',
    short: 'Unit is in your party',
    desc: (_v, n, u) => `${U(u)} is ${no(n)}in your party`,
    test: (ctx) => onUnit(ctx, (u) => u.exists && u.inParty),
  },
  {
    name: 'raid', category: 'Unit', value: 'none',
    short: 'Unit is in your raid',
    desc: (_v, n, u) => `${U(u)} is ${no(n)}in your raid group`,
    test: (ctx) => onUnit(ctx, (u) => u.exists && u.inRaid),
  },
  {
    name: 'group', category: 'Unit', value: 'optional', values: ['party', 'raid'],
    strictValues: true,
    short: 'You are in a group',
    desc: (v, n) => (v.length
      ? `you are ${no(n)}in a ${or(v)} group`
      : `you are ${no(n)}in a group`),
    test: (ctx) => {
      const g = ctx.state.group;
      if (!ctx.values.length) return g !== 'none';
      return ctx.values.some((v) => (v.toLowerCase() === 'raid' ? g === 'raid' : g !== 'none'));
    },
    availability: { era: 'unknown' },
    flavourNotes: { era: 'Could not confirm [group] on Classic Era against a reliable source.' },
  },

  // --- Input ---------------------------------------------------------------
  {
    name: 'mod', aliases: ['modifier'], category: 'Input', value: 'optional',
    values: ['shift', 'ctrl', 'alt', 'lshift', 'rshift', 'lctrl', 'rctrl', 'lalt', 'ralt'],
    strictValues: true,
    short: 'A modifier key is held',
    desc: (v, n) => (v.length
      ? `you are ${no(n)}holding ${or(v.map(modLabel))}`
      : `you are ${no(n)}holding any modifier key`),
    note: 'Bare [mod] means "any of Shift/Ctrl/Alt". [nomod] is the usual default clause.',
    test: (ctx) => {
      const m = ctx.state.modifiers;
      if (!ctx.values.length) return m.shift || m.ctrl || m.alt;
      // We model Shift/Ctrl/Alt but not which physical side was pressed.
      if (ctx.values.some((v) => !MODELLED_MODIFIERS.has(v.toLowerCase()))) return 'unknown';
      return ctx.values.some((v) => m[v.toLowerCase() as 'shift' | 'ctrl' | 'alt']);
    },
  },
  {
    name: 'btn', aliases: ['button'], category: 'Input', value: 'required',
    values: ['1', '2', '3', '4', '5'],
    short: 'Pressed with a specific mouse button',
    strictValues: true,
    desc: (v, n) => `the button was ${no(n)}clicked with mouse button ${or(v)} (1=left, 2=right, 3=middle)`,
    note: 'Only fires for actual mouse clicks — a keybind always reports button 1.',
    test: (ctx) => ctx.values.some((v) => Number(v) === ctx.state.button),
  },

  // --- Player state --------------------------------------------------------
  {
    name: 'combat', category: 'Player', value: 'none', short: 'You are in combat',
    desc: (_v, n) => `you are ${no(n)}in combat`,
    test: (ctx) => ctx.state.combat,
  },
  {
    name: 'stealth', category: 'Player', value: 'none', short: 'You are stealthed',
    desc: (_v, n) => `you are ${no(n)}stealthed`,
    test: (ctx) => ctx.state.stealth,
  },
  {
    name: 'mounted', category: 'Player', value: 'none', short: 'You are mounted',
    desc: (_v, n) => `you are ${no(n)}mounted`,
    test: (ctx) => ctx.state.mounted,
  },
  {
    name: 'swimming', category: 'Player', value: 'none', short: 'You are swimming',
    desc: (_v, n) => `you are ${no(n)}swimming`,
    test: (ctx) => ctx.state.swimming,
  },
  {
    name: 'flying', category: 'Player', value: 'none', short: 'You are flying right now',
    desc: (_v, n) => `you are ${no(n)}currently flying`,
    test: (ctx) => ctx.state.flying,
    availability: { forever: 'no', era: 'no' },
    flavourNotes: {
      forever: 'Blizzard has said flying will never be in Forever — it is deliberate design, not a launch omission.',
      era: 'There is no flying anywhere in vanilla Azeroth.',
    },
  },
  {
    name: 'flyable', category: 'Player', value: 'none', short: 'Flying is allowed here',
    desc: (_v, n) => `flying is ${no(n)}possible in this zone`,
    note: 'This is about the zone, not about whether you are in the air — that is [flying].',
    test: (ctx) => ctx.state.flyable,
    availability: { forever: 'no', era: 'no' },
    flavourNotes: {
      forever: 'Blizzard has said flying will never be in Forever — it is deliberate design, not a launch omission.',
      era: 'There is no flying anywhere in vanilla Azeroth.',
    },
  },
  {
    name: 'advflyable', category: 'Player', value: 'none', short: 'Skyriding is allowed here',
    desc: (_v, n) => `skyriding (dynamic flight) is ${no(n)}usable here`,
    test: (ctx) => ctx.state.advflyable,
    availability: { forever: 'no', era: 'no' },
    flavourNotes: {
      forever: 'Skyriding is a Dragonflight-era system and has no place in vanilla content.',
      era: 'Skyriding is a Dragonflight-era system.',
    },
  },
  {
    name: 'indoors', category: 'Player', value: 'none', short: 'You are indoors',
    desc: (_v, n) => `you are ${no(n)}indoors`,
    test: (ctx) => ctx.state.indoors,
  },
  {
    name: 'outdoors', category: 'Player', value: 'none', short: 'You are outdoors',
    desc: (_v, n) => `you are ${no(n)}outdoors`,
    test: (ctx) => !ctx.state.indoors,
  },
  {
    name: 'resting', category: 'Player', value: 'none', short: 'You are in a rested area',
    desc: (_v, n) => `you are ${no(n)}in a rested area (inn or city)`,
    test: (ctx) => ctx.state.resting,
  },
  {
    name: 'petbattle', category: 'Player', value: 'none', short: 'You are in a pet battle',
    desc: (_v, n) => `you are ${no(n)}in a pet battle`,
    test: (ctx) => ctx.state.petbattle,
    availability: { forever: 'no', era: 'no' },
    flavourNotes: {
      forever: 'Pet battles are a Mists-era system; vanilla content has none.',
      era: 'Pet battles are a Mists-era system.',
    },
  },
  {
    name: 'channeling', category: 'Player', value: 'optional',
    short: 'You are channeling',
    desc: (v, n) => (v.length
      ? `you are ${no(n)}channeling ${or(v)}`
      : `you are ${no(n)}channeling something`),
    // We model "channeling something" but not which spell.
    test: (ctx) => (ctx.values.length ? 'unknown' : ctx.state.channeling),
    availability: { era: 'unknown' },
    flavourNotes: { era: 'Could not confirm [channeling] on Classic Era against a reliable source.' },
  },
  {
    name: 'known', category: 'Player', value: 'required',
    short: 'You know a spell',
    desc: (v, n) => `you ${n ? 'do not know' : 'know'} ${or(v)}`,
    note: 'Takes a spell name or spell ID. Great for macros shared across specs.',
    test: () => 'unknown',
    availability: { era: 'unknown' },
    flavourNotes: { era: 'Could not confirm [known] on Classic Era against a reliable source.' },
  },
  {
    name: 'spec', category: 'Player', value: 'required', values: ['1', '2', '3', '4'],
    strictValues: true,
    short: 'Active specialisation',
    desc: (v, n) => `your active specialisation is ${no(n)}number ${or(v)}`,
    test: (ctx) => ctx.values.some((v) => Number(v) === ctx.state.spec),
    availability: { era: 'no' },
    flavourNotes: {
      forever: 'Forever does have specialisations — the beta exposes new spec IDs via the retail trait system.',
      era: 'Vanilla has no specialisations; talents are a row/column tree.',
    },
  },
  {
    name: 'talent', category: 'Player', value: 'required',
    short: 'A talent is selected (legacy)',
    desc: (v, n) => `talent ${or(v)} is ${no(n)}selected`,
    note: 'Row/column syntax from the old talent trees. On modern talent trees prefer [known:Spell Name].',
    test: () => 'unknown',
    availability: { forever: 'unknown' },
    flavourNotes: {
      forever: "Forever runs its legacy talent panel on retail's C_Traits system; whether [talent:row/col] is wired up is unverified.",
      era: 'This is the intended home for row/column talents — not legacy here.',
    },
  },
  {
    name: 'stance', aliases: ['form'], category: 'Player', value: 'optional',
    values: ['0', '1', '2', '3', '4', '5', '6'],
    short: 'Shapeshift form / stance',
    desc: (v, n) => (v.length
      ? (v.includes('0')
        ? `you are ${no(n)}in form ${or(v)} (0 = no form / caster form)`
        : `you are ${no(n)}in stance/form ${or(v)}`)
      : `you are ${no(n)}in some shapeshift form`),
    note: 'Numbers are per class and follow the order of your stance bar. [form:0] is humanoid/caster form.',
    test: (ctx) => (ctx.values.length
      ? ctx.values.some((v) => Number(v) === ctx.state.form)
      : ctx.state.form !== 0),
  },
  {
    name: 'pet', category: 'Unit', value: 'optional',
    short: 'You have a pet out',
    desc: (v, n) => (v.length
      ? `you ${n ? 'do not have' : 'have'} a ${or(v)} out`
      : `you ${n ? 'have no pet' : 'have a pet out'}`),
    note: 'Takes a pet name or creature family, e.g. [pet:Voidwalker] or [pet:Felguard].',
    test: (ctx) => {
      if (!ctx.state.hasPet) return false;
      if (!ctx.values.length) return true;
      const name = ctx.state.petName.trim().toLowerCase();
      if (!name) return 'unknown';
      return ctx.values.some((v) => v.trim().toLowerCase() === name);
    },
  },

  // --- Equipment -----------------------------------------------------------
  {
    name: 'equipped', aliases: ['worn'], category: 'Equipment', value: 'required',
    values: ['Shields', 'Daggers', 'Two-Handed Swords', 'One-Handed Maces', 'Staves', 'Bows', 'Guns', 'Wands', 'Fishing Poles', 'Thrown'],
    short: 'An item type is equipped',
    desc: (v, n) => `you ${n ? 'do not have' : 'have'} ${or(v)} equipped`,
    note: 'Matches inventory slot names, item types or subtypes — e.g. [equipped:Shields].',
    test: () => 'unknown',
  },

  // --- Action bars & vehicles ----------------------------------------------
  {
    name: 'actionbar', aliases: ['bar'], category: 'Bars', value: 'required',
    values: ['1', '2', '3', '4', '5', '6'],
    short: 'Current action bar page',
    strictValues: true,
    desc: (v, n) => `action bar page ${or(v)} is ${no(n)}active`,
    test: (ctx) => ctx.values.some((v) => Number(v) === ctx.state.actionbar),
  },
  {
    name: 'bonusbar', category: 'Bars', value: 'required', values: ['1', '2', '3', '4', '5'],
    strictValues: true,
    short: 'A temporary bonus bar is active',
    desc: (v, n) => `bonus action bar ${or(v)} is ${no(n)}active`,
    note: 'Bonus bars are swapped in by stances, stealth and some quest items.',
    test: () => 'unknown',
  },
  {
    name: 'overridebar', category: 'Bars', value: 'none', short: 'An override bar is showing',
    desc: (_v, n) => `an override action bar is ${no(n)}showing`,
    test: () => 'unknown',
    availability: { era: 'no' },
    flavourNotes: { era: 'Override bars arrived in Cataclysm.' },
  },
  {
    name: 'extrabar', category: 'Bars', value: 'none', short: 'The extra action button bar is showing',
    desc: (_v, n) => `the extra action bar is ${no(n)}showing`,
    test: () => 'unknown',
    availability: { era: 'no' },
    flavourNotes: { era: 'The extra action button arrived in Mists.' },
  },
  {
    name: 'possessbar', category: 'Bars', value: 'none', short: 'You are possessing something',
    desc: (_v, n) =>
      `the possess bar is ${no(n)}showing (you are ${no(n)}mind-controlling something)`,
    test: () => 'unknown',
    availability: { forever: 'unknown', era: 'no' },
    flavourNotes: { era: 'The possess bar arrived with Wrath-era vehicles.' },
  },
  {
    name: 'vehicleui', category: 'Bars', value: 'none', short: 'You are in a vehicle UI',
    desc: (_v, n) => `you are ${no(n)}using a vehicle UI`,
    test: () => 'unknown',
    availability: { forever: 'unknown', era: 'no' },
    flavourNotes: {
      forever: 'Vehicles are a Wrath-era system. Forever is new content, so this may yet be used.',
      era: 'Vehicles are a Wrath-era system.',
    },
  },
  {
    name: 'unithasvehicleui', category: 'Bars', value: 'none', short: 'The unit has a vehicle UI',
    desc: (_v, n, u) => `${U(u)} is ${no(n)}in a vehicle with its own UI`,
    test: () => 'unknown',
    availability: { forever: 'unknown', era: 'no' },
    flavourNotes: { era: 'Vehicles are a Wrath-era system.' },
  },
  {
    name: 'canexitvehicle', category: 'Bars', value: 'none', short: 'You can leave the vehicle',
    desc: (_v, n) => `you ${n ? 'cannot' : 'can'} exit your current vehicle`,
    test: () => 'unknown',
    availability: { forever: 'unknown', era: 'no' },
    flavourNotes: { era: 'Vehicles are a Wrath-era system.' },
  },
];

const BY_NAME = new Map<string, ConditionalDef>();
for (const c of CONDITIONALS) {
  BY_NAME.set(c.name, c);
  for (const a of c.aliases ?? []) BY_NAME.set(a, c);
}

export function lookupConditional(name: string): ConditionalDef | null {
  return BY_NAME.get(String(name).toLowerCase()) ?? null;
}

export function allConditionalNames(): string[] {
  return [...BY_NAME.keys()];
}

/** Levenshtein distance, used for "did you mean ...?" on typos. */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function suggest(name: string, candidates: string[]): string | null {
  const target = String(name).toLowerCase();
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = editDistance(target, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  const limit = target.length <= 4 ? 1 : 2;
  return bestD <= limit ? best : null;
}
