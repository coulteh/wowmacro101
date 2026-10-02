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
}

export const WOW_CLASSES: WowClass[] = [
  { id: 1, name: 'Warrior' },
  { id: 2, name: 'Paladin' },
  { id: 3, name: 'Hunter' },
  { id: 4, name: 'Rogue' },
  { id: 5, name: 'Priest' },
  { id: 6, name: 'Death Knight' },
  { id: 7, name: 'Shaman' },
  { id: 8, name: 'Mage' },
  { id: 9, name: 'Warlock' },
  { id: 10, name: 'Monk' },
  { id: 11, name: 'Druid' },
  { id: 12, name: 'Demon Hunter' },
  { id: 13, name: 'Evoker' },
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

const BY_ID = new Map(WOW_CLASSES.map((c) => [c.id, c]));

export function className(id: number): string | null {
  return BY_ID.get(id)?.name ?? null;
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
