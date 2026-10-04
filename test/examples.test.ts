import { describe, expect, it } from 'vitest';
import rawExamples from '../src/data/examples.json';
import { DEFAULT_EXAMPLE, EXAMPLES, examplesFor } from '../src/data/examples';
import { WOW_CLASSES } from '../src/data/classes';
import { equippedValues, EQUIPPABLE_TYPES_BY_FLAVOUR, INVENTORY_SLOT_NAMES } from '../src/data/items';
import { FLAVOUR_IDS, type FlavourId } from '../src/flavours';

const raw = rawExamples as Array<{
  title: string; blurb: string; macro: string[];
  class?: string; flavours?: string[]; default?: boolean;
}>;

const CLASS_NAMES = new Set(WOW_CLASSES.map((c) => c.name));

describe('bundled examples', () => {
  it('names a real class, or no class at all', () => {
    // Resolution is deliberately forgiving at runtime so a typo cannot white-screen the
    // app -- which is exactly why it has to be loud here instead.
    for (const ex of raw) {
      if (ex.class === undefined) continue;
      expect(CLASS_NAMES.has(ex.class), `${ex.title}: unknown class "${ex.class}"`).toBe(true);
    }
    expect(EXAMPLES.filter((ex) => ex.classId).length).toBe(raw.filter((ex) => ex.class).length);
  });

  it('scopes itself to real flavours', () => {
    for (const ex of raw) {
      for (const flavour of ex.flavours ?? []) {
        expect(FLAVOUR_IDS, `${ex.title}: unknown flavour "${flavour}"`).toContain(flavour);
      }
      expect(ex.flavours?.length !== 0, `${ex.title}: empty flavours hides it everywhere`).toBe(true);
    }
  });

  it('marks exactly one example as the editor default', () => {
    expect(raw.filter((ex) => ex.default).map((ex) => ex.title)).toEqual(['Shift to focus']);
    expect(DEFAULT_EXAMPLE.title).toBe('Shift to focus');
  });

  it('joins macro lines rather than storing escapes', () => {
    for (const ex of raw) {
      expect(ex.macro.length, `${ex.title}: empty macro`).toBeGreaterThan(0);
      for (const line of ex.macro) {
        expect(line, `${ex.title}: embedded newline, split the array instead`).not.toContain('\n');
      }
    }
    expect(DEFAULT_EXAMPLE.macro.split('\n').length).toBe(2);
  });

  it('offers an unscoped example on every flavour, and a scoped one only where it belongs', () => {
    const unscoped = EXAMPLES.filter((ex) => !ex.flavours).length;
    for (const flavour of FLAVOUR_IDS) {
      expect(examplesFor(flavour).length).toBeGreaterThanOrEqual(unscoped);
    }

    const titles = (flavour: FlavourId) => examplesFor(flavour).map((ex) => ex.title);

    // The two that were silently broken before the allowlist existed: [flyable] and
    // Flight Form on one, a TBC spell on the other.
    expect(titles('retail')).toContain('One-button travel');
    expect(titles('era')).not.toContain('One-button travel');
    expect(titles('forever')).not.toContain('Cast sequence');

    // Ranks only exist on the Classic lines, so downranking is offered only there.
    expect(titles('forever')).toContain('Rank 1 for the slow');
    expect(titles('era')).toContain('Rank 1 for the slow');
    expect(titles('retail')).not.toContain('Rank 1 for the slow');
  });

  it('gives every flavour a usable spread of examples', () => {
    expect(examplesFor('retail').length).toBe(11);
    expect(examplesFor('forever').length).toBe(13);
    expect(examplesFor('era').length).toBe(13);
  });
});

describe('[equipped] item types', () => {
  it('accepts both the singular and plural spellings the game carries', () => {
    // ItemSubClass has two name columns -- DisplayName_lang singular, VerboseName_lang
    // plural -- and a macro may use either, so neither may be dropped.
    for (const flavour of FLAVOUR_IDS) {
      const values = equippedValues(flavour);
      for (const pair of [['Bow', 'Bows'], ['Gun', 'Guns'], ['Crossbow', 'Crossbows'],
        ['Wand', 'Wands'], ['Shield', 'Shields'], ['Dagger', 'Daggers']]) {
        for (const spelling of pair) {
          expect(values, `${spelling} should be valid on ${flavour}`).toContain(spelling);
        }
      }
    }
  });

  it('keeps Fishing Poles to the one flavour that has the plural', () => {
    expect(equippedValues('retail')).toContain('Fishing Poles');
    expect(equippedValues('era')).not.toContain('Fishing Poles');
    expect(equippedValues('forever')).not.toContain('Fishing Poles');
    for (const flavour of FLAVOUR_IDS) expect(equippedValues(flavour)).toContain('Fishing Pole');
  });

  it('has warglaives on Midnight only', () => {
    // Forever's two "Warglaives" rows are Monster - Glaive - Demonhunter Illidan display
    // models, not player gear. This is the easiest value here to helpfully put back.
    expect(equippedValues('retail')).toContain('Warglaives');
    expect(equippedValues('forever')).not.toContain('Warglaives');
    expect(equippedValues('era')).not.toContain('Warglaives');
  });

  it('keeps the vanilla relic slot on the Classic lines only', () => {
    for (const relic of ['Libram', 'Librams', 'Idol', 'Idols', 'Totem', 'Totems']) {
      expect(equippedValues('era'), relic).toContain(relic);
      expect(equippedValues('forever'), relic).toContain(relic);
      expect(equippedValues('retail'), relic).not.toContain(relic);
    }
  });

  it('leaves out the dead slots and the internal subclasses', () => {
    // Each of these is in ItemSubClass on at least one build with no player items
    // behind it. See the DROPPED notes in items.ts before adding any of them back.
    const dead = ['Exotic', 'One-Handed Exotics', 'Two-Handed Exotics', 'Spear', 'Spears',
      'Bear Claws', 'Cat Claws', 'CatClaws', 'Obsolete', 'Sigil', 'Sigils'];
    for (const flavour of FLAVOUR_IDS) {
      for (const value of dead) {
        expect(equippedValues(flavour), `${value} should not be valid on ${flavour}`)
          .not.toContain(value);
      }
    }
  });

  it('answers "am I holding a two-hander" with the slot name, not an item type', () => {
    // 'Two-Handed Weapon' is ItemClass 8 (Item Enhancement) -- an enchanting-scroll
    // category, never something you equip. The working form is the inventory slot.
    for (const flavour of FLAVOUR_IDS) {
      expect(equippedValues(flavour)).toContain('Two-Hand');
      expect(equippedValues(flavour)).not.toContain('Two-Handed Weapon');
      expect(equippedValues(flavour)).not.toContain('Shield/Off-hand');
    }
  });

  it('offers the slot names on every flavour and keeps the lists distinct', () => {
    for (const flavour of FLAVOUR_IDS) {
      for (const slot of ['Ranged', 'Trinket', 'Main Hand', 'Off Hand']) {
        expect(equippedValues(flavour)).toContain(slot);
      }
      // Relic is dropped as an item subclass but survives as a slot; the two lists are
      // separate on purpose.
      expect(EQUIPPABLE_TYPES_BY_FLAVOUR[flavour]).not.toContain('Relic');
      expect(INVENTORY_SLOT_NAMES).toContain('Relic');
    }
  });

  it('has no duplicates within a flavour', () => {
    for (const flavour of FLAVOUR_IDS) {
      const values = equippedValues(flavour);
      expect(new Set(values).size, `${flavour} repeats a value`).toBe(values.length);
    }
  });
});
