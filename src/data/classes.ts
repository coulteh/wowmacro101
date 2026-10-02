// Player classes.
//
// Ids are the game's own (ChrClasses). The per-flavour availability is hardcoded rather
// than derived from the data on purpose: Classic-line builds carry a Death Knight bit in
// their ClassMask values even though vanilla has no Death Knights, so the data cannot be
// trusted to say which classes are playable.

import type { FlavourId } from '../flavours';

export interface WowClass {
  id: number;
  name: string;
  /** The game's own class colour, from ChrClasses.ClassColorR/G/B. Not guessed. */
  color: string;
  /** Icon file name for the render CDN, from ChrClasses.IconFileDataID. */
  icon: string;
}

export const WOW_CLASSES: WowClass[] = [
  { id: 1, name: 'Warrior', color: '#C69B6D', icon: 'classicon_warrior' },
  { id: 2, name: 'Paladin', color: '#F48CBA', icon: 'classicon_paladin' },
  { id: 3, name: 'Hunter', color: '#AAD372', icon: 'classicon_hunter' },
  { id: 4, name: 'Rogue', color: '#FFF468', icon: 'classicon_rogue' },
  { id: 5, name: 'Priest', color: '#FFFFFF', icon: 'classicon_priest' },
  { id: 6, name: 'Death Knight', color: '#C41E3A', icon: 'spell_deathknight_classicon' },
  { id: 7, name: 'Shaman', color: '#0070DD', icon: 'classicon_shaman' },
  { id: 8, name: 'Mage', color: '#3FC7EB', icon: 'classicon_mage' },
  { id: 9, name: 'Warlock', color: '#8788EE', icon: 'classicon_warlock' },
  { id: 10, name: 'Monk', color: '#00FF98', icon: 'classicon_monk' },
  { id: 11, name: 'Druid', color: '#FF7C0A', icon: 'classicon_druid' },
  { id: 12, name: 'Demon Hunter', color: '#A330C9', icon: 'classicon_demonhunter' },
  { id: 13, name: 'Evoker', color: '#33937F', icon: 'classicon_evoker' },
];

/** No class selected: nothing is class-checked, which is the default. */
export const ANY_CLASS = 0;

const VANILLA_CLASSES = [1, 2, 3, 4, 5, 7, 8, 9, 11];

/**
 * Vanilla-line flavours have nine classes — no Death Knight, Monk, Demon Hunter or
 * Evoker. Forever is assumed to match: a new race was announced, not a new class.
 * Worth re-checking at launch.
 */
export const CLASSES_BY_FLAVOUR: Record<FlavourId, number[]> = {
  retail: WOW_CLASSES.map((c) => c.id),
  forever: VANILLA_CLASSES,
  era: VANILLA_CLASSES,
};

/**
 * Specialisations in `[spec:N]` order, read from ChrSpecialization (ClassID +
 * OrderIndex) on build 12.1.0.69933. The "Initial" starter spec at OrderIndex 4 is
 * excluded — it is not something you can be.
 */
export const SPECS_BY_CLASS: Record<number, string[]> = {
  1: ['Arms', 'Fury', 'Protection'],
  2: ['Holy', 'Protection', 'Retribution'],
  3: ['Beast Mastery', 'Marksmanship', 'Survival'],
  4: ['Assassination', 'Outlaw', 'Subtlety'],
  5: ['Discipline', 'Holy', 'Shadow'],
  6: ['Blood', 'Frost', 'Unholy'],
  7: ['Elemental', 'Enhancement', 'Restoration'],
  8: ['Arcane', 'Fire', 'Frost'],
  9: ['Affliction', 'Demonology', 'Destruction'],
  10: ['Brewmaster', 'Mistweaver', 'Windwalker'],
  11: ['Balance', 'Feral', 'Guardian', 'Restoration'],
  12: ['Havoc', 'Vengeance', 'Devourer'],
  13: ['Devastation', 'Preservation', 'Augmentation'],
};

/**
 * Classes with a pet you can actually command with /petattack and test with [pet].
 * Temporary, uncontrollable summons — Shadowfiend, treants, totems — do not count.
 */
const PET_CLASSES = new Set([3, 6, 8, 9]);        // Hunter, Death Knight, Mage, Warlock
const VANILLA_PET_CLASSES = new Set([3, 9]);      // no Death Knights, and no Mage pet yet

export function hasPet(flavour: FlavourId, classId: number): boolean {
  if (classId === ANY_CLASS) return true;          // unknown: show the controls
  return flavour === 'retail' ? PET_CLASSES.has(classId) : VANILLA_PET_CLASSES.has(classId);
}

export function specsFor(classId: number): string[] {
  return SPECS_BY_CLASS[classId] ?? [];
}

export interface FormOption {
  /** The number [form:N] / [stance:N] uses. */
  index: number;
  name: string;
  /** Only reachable by this specialisation, when set. */
  spec?: number;
}

/**
 * Shapeshift bar contents, but only where two independent sources agree: the
 * StanceBarOrder column in SpellShapeshift, and the long-established macro indexes.
 *
 * Retail's StanceBarOrder maps straight to the macro index (Bear 1, Cat 2, Travel 3,
 * Moonkin 4). The Classic lines are offset by one -- the default form is absent from the
 * table, so Aquatic 1 / Cat 2 / Travel 3 means Bear 1 / Aquatic 2 / Cat 3 / Travel 4,
 * which is exactly the known vanilla ordering. Warrior stances corroborate the same
 * offset: Defensive 1 / Berserker 2 means Battle 1 / Defensive 2 / Berserker 3.
 *
 * Deliberately absent: retail Warrior stances, where the data contradicts the classic
 * order and the stances are talent-gated. Those keep a plain number, because a wrong
 * index is worse than an unlabelled one.
 */
const DRUID_RETAIL: FormOption[] = [
  { index: 1, name: 'Bear Form' },
  { index: 2, name: 'Cat Form' },
  { index: 3, name: 'Travel Form' },
  { index: 4, name: 'Moonkin Form', spec: 1 },
  { index: 5, name: 'Incarnation: Tree of Life', spec: 4 },
];

const DRUID_VANILLA: FormOption[] = [
  { index: 1, name: 'Bear Form' },
  { index: 2, name: 'Aquatic Form' },
  { index: 3, name: 'Cat Form' },
  { index: 4, name: 'Travel Form' },
  { index: 5, name: 'Moonkin Form' },
];

const WARRIOR_VANILLA: FormOption[] = [
  { index: 1, name: 'Battle Stance' },
  { index: 2, name: 'Defensive Stance' },
  { index: 3, name: 'Berserker Stance' },
];

const ROGUE: FormOption[] = [{ index: 1, name: 'Stealth' }];
const SHAMAN: FormOption[] = [{ index: 1, name: 'Ghost Wolf' }];
const PRIEST_RETAIL: FormOption[] = [{ index: 1, name: 'Shadowform', spec: 3 }];

/**
 * Per flavour, per class. An empty array means "has a stance bar but we will not name
 * the slots"; an absent entry means the class has no forms at all.
 */
const FORMS_BY_FLAVOUR: Record<FlavourId, Record<number, FormOption[]>> = {
  retail: { 1: [], 4: ROGUE, 5: PRIEST_RETAIL, 7: SHAMAN, 11: DRUID_RETAIL },
  forever: { 1: WARRIOR_VANILLA, 4: ROGUE, 7: SHAMAN, 11: DRUID_VANILLA },
  era: { 1: WARRIOR_VANILLA, 4: ROGUE, 7: SHAMAN, 11: DRUID_VANILLA },
};

/** 'none' = hide the control, 'unnamed' = plain number, otherwise a named list. */
export type FormSupport = 'none' | 'unnamed' | FormOption[];

export function formSupport(flavour: FlavourId, classId: number, spec: number): FormSupport {
  if (classId === ANY_CLASS) return 'unnamed';
  const forms = FORMS_BY_FLAVOUR[flavour][classId];
  if (forms === undefined) return 'none';
  if (forms.length === 0) return 'unnamed';
  const available = forms.filter((f) => f.spec === undefined || f.spec === spec);
  return available.length ? available : 'unnamed';
}

/** The form name for an index, when we are confident enough to give one. */
export function formName(
  flavour: FlavourId, classId: number, spec: number, index: number,
): string | null {
  const support = formSupport(flavour, classId, spec);
  if (support === 'none' || support === 'unnamed') return null;
  return support.find((f) => f.index === index)?.name ?? null;
}

const BY_ID = new Map(WOW_CLASSES.map((c) => [c.id, c]));

export function className(id: number): string | null {
  return BY_ID.get(id)?.name ?? null;
}

export function wowClass(id: number): WowClass | null {
  return BY_ID.get(id) ?? null;
}

export function classesFor(flavour: FlavourId): WowClass[] {
  return CLASSES_BY_FLAVOUR[flavour].map((id) => BY_ID.get(id)!).filter(Boolean);
}

export function classBit(id: number): number {
  return id > 0 ? 1 << (id - 1) : 0;
}

/** Class names carried by a bitmask, in class-id order. */
export function classNames(mask: number): string[] {
  if (!mask) return [];
  return WOW_CLASSES.filter((c) => mask & classBit(c.id)).map((c) => c.name);
}

export function maskHasClass(mask: number, classId: number): boolean {
  return Boolean(mask && classId && (mask & classBit(classId)));
}

/** True when this class can be selected on this flavour. */
export function isClassAvailable(flavour: FlavourId, classId: number): boolean {
  return classId === ANY_CLASS || CLASSES_BY_FLAVOUR[flavour].includes(classId);
}
