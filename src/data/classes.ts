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
