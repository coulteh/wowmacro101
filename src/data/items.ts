// Item types `[equipped:X]` can name.
//
// Read out of ItemClass and ItemSubClass on wago.tools -- Classic Era 1.15.9.70003,
// Forever 1.60.1.70205, Midnight 12.1.0.69933 -- and then curated, because the name
// tables alone are not trustworthy. Several subclasses exist in name only, the same
// leftover-table hazard that leaves 5783 dead rank subtexts in Retail's Spell table.
// Every value below was corroborated against real rows in Item.db2 and their names in
// ItemSearchName; the ones that did not survive are listed below, with why.
//
// Hardcoded rather than generated for the same reason as classes.ts: the curation *is*
// the value. An algorithmic filter was tried and was worse -- gating on presence in
// ItemSearchName cleanly removed the test and NPC debris but also removed Librams,
// Idols and Totems, which are real vanilla relic items. Era's ItemSearchName export
// covers only 13k of its 25k items, so absence from it proves nothing.
//
// Two things to know before editing:
//
// 1. ItemSubClass has TWO name columns and BOTH are addressable. DisplayName_lang is
//    singular ('Bow', 'Shield', 'Dagger'); VerboseName_lang is plural or qualified
//    ('Bows', 'Shields', 'One-Handed Swords'). The game answers the singular-or-plural
//    question twice, so we accept both rather than picking a side. Note that the
//    singular form is ambiguous where the verbose one is not: 'Axe', 'Mace' and 'Sword'
//    each cover both the one- and two-handed subclass.
//
// 2. Only ClassID 2 (Weapon) and 4 (Armor) can be equipped. Consumables, containers,
//    gems and reagents have subclasses too -- including noise like 'RESERVED 13' and
//    'Agility' -- and none of them belong here.

import type { FlavourId } from '../flavours';

// Deliberately left out, so nobody puts them back:
//
// - `Exotic`, `One-Handed Exotics`, `Two-Handed Exotics` -- subclass 2.11/2.12. The two
//   items on the Classic lines (9376, 9377) are absent from ItemSearchName and carry
//   InventoryType 17 (two-hand) under a subclass named *One-Handed*. 2.12 is empty in
//   every build. A dead slot.
// - `Warglaives` on Forever -- its only two items (270428, 270429) are named
//   "Monster - Glaive - Demonhunter Illidan" and "... Offhand": NPC display models, not
//   player gear. Kept on Midnight, where warglaives are real Demon Hunter weapons.
// - `Bear Claws`, `Cat Claws`, `CatClaws` -- Midnight 2.11/2.12, zero player items.
//   Druid form internals. (`CatClaws` unspaced is a typo in the game's own data.)
// - `Spear`, `Spears` -- all three items are "Test Spear", "Fast Test Spear" and
//   "Monster - Spear, Broad Notched". Real polearms are subclass 2.6.
// - `Obsolete`, `NewItem`, `RESERVED *` -- named as such, no items.
// - `Sigil`, `Sigils`, `Relic` -- Midnight death-knight sigil and relic subclasses,
//   emptied when Legion removed them. `Relic` survives below as an inventory *slot*
//   name; dropping it as an item type does not drop it as a slot.
// - `Two-Handed Weapon`, `Shield/Off-hand` -- ClassID 8 (Item Enhancement), i.e.
//   enchanting-scroll categories, never item types. "A talent needs a two-hander
//   equipped" is served by the slot name `Two-Hand` instead.

/** Weapon and armour subclasses present on every flavour, both name columns. */
const SHARED_TYPES = [
  'Weapon', 'Armor',
  'Axe', 'One-Handed Axes', 'Two-Handed Axes',
  'Mace', 'One-Handed Maces', 'Two-Handed Maces',
  'Sword', 'One-Handed Swords', 'Two-Handed Swords',
  'Dagger', 'Daggers',
  'Staff', 'Staves',
  'Polearm', 'Polearms',
  'Fist Weapon', 'Fist Weapons',
  'Bow', 'Bows',
  'Gun', 'Guns',
  'Crossbow', 'Crossbows',
  'Thrown',
  'Wand', 'Wands',
  'Shield', 'Shields',
  'Fishing Pole',
  'Cloth', 'Leather', 'Mail', 'Plate',
  'Miscellaneous',
];

/**
 * The vanilla relic slot: Paladin Librams, Druid Idols, Shaman Totems. Legion removed
 * the slot, and Midnight's rows for it carry no items, so these are Classic-only.
 */
const RELIC_TYPES = ['Libram', 'Librams', 'Idol', 'Idols', 'Totem', 'Totems'];

export const EQUIPPABLE_TYPES_BY_FLAVOUR: Record<FlavourId, string[]> = {
  // 'Fishing Poles' is the plural Midnight alone uses -- the Classic lines have only
  // the singular. 'Warglaives' is real here and nowhere else.
  retail: [...SHARED_TYPES, 'Cosmetic', 'Fishing Poles', 'Warglaives'],
  // Cosmetic armour exists on Forever (118 items) but not on Era (zero).
  forever: [...SHARED_TYPES, ...RELIC_TYPES, 'Cosmetic'],
  era: [...SHARED_TYPES, ...RELIC_TYPES],
};

/**
 * Inventory slot names, which `[equipped:X]` also matches.
 *
 * These are the client's localised INVTYPE_* Lua globals. There is no DB2 to read them
 * out of, so unlike everything above they are corroborated from one source only -- which
 * is precisely why an unrecognised [equipped:] value is reported at info level and never
 * as a warning. Under-listing a slot name must not accuse a working macro of being wrong.
 *
 * `Two-Hand` is the one people reach for: it is how a macro asks "am I holding a
 * two-hander", which no item type can answer.
 */
export const INVENTORY_SLOT_NAMES = [
  'Head', 'Neck', 'Shoulder', 'Shirt', 'Chest', 'Waist', 'Legs', 'Feet', 'Wrist', 'Hands',
  'Finger', 'Trinket', 'Back', 'Tabard',
  'One-Hand', 'Two-Hand', 'Main Hand', 'Off Hand', 'Held In Off-hand', 'Ranged', 'Relic',
];

/** Everything `[equipped:X]` can legitimately name on this flavour. */
export function equippedValues(flavour: FlavourId): string[] {
  return [...EQUIPPABLE_TYPES_BY_FLAVOUR[flavour], ...INVENTORY_SLOT_NAMES];
}
