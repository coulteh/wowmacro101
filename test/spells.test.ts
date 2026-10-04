import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import spellData from '../src/data/spells.retail.json';
import eraData from '../src/data/spells.era.json';
import foreverData from '../src/data/spells.forever.json';
import {
  belongsToClass, createSpellIndex, iconUrl, wowheadUrl, ICON_BASE,
  type SpellData, type SpellIndex,
} from '../src/data/spells';
import { FLAVOUR_IDS, type FlavourId } from '../src/flavours';
import { EXAMPLES } from '../src/data/examples';
import { ANY_CLASS, classesFor, WOW_CLASSES } from '../src/data/classes';
import { parseMacro } from '../src/parser/parser';

const data = spellData as unknown as SpellData;
const index = createSpellIndex(data);

const era = createSpellIndex(eraData as unknown as SpellData);
const forever = createSpellIndex(foreverData as unknown as SpellData);
const ALL = [
  ['retail', data, index],
  ['era', eraData as unknown as SpellData, era],
  ['forever', foreverData as unknown as SpellData, forever],
] as const;

const INDEX_BY_FLAVOUR: Record<FlavourId, SpellIndex> = { retail: index, era, forever };

/**
 * Every (example, flavour) pair the app will actually offer.
 *
 * Parsing an example only against 'retail' is how [flyable] on Classic Era and a TBC
 * spell on a vanilla dataset went unnoticed -- the two cases that prompted the flavour
 * allowlist in examples.json.
 */
const EXAMPLE_CASES = EXAMPLES.flatMap((example) =>
  (example.flavours ?? FLAVOUR_IDS).map((flavour) => ({ example, flavour })));

describe('bundled spell dataset', () => {
  it('is populated and labelled with its build', () => {
    expect(index.count).toBeGreaterThan(10_000);
    expect(data.build).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(data.sources).toContain('TraitDefinition');
  });

  it('knows the modern class kit, not just professions', () => {
    // SkillLineAbility alone misses all of these -- retail class spells come from the
    // trait system, so the dataset has to join TraitDefinition/SpecializationSpells too.
    for (const spell of ['Fireball', 'Mortal Strike', 'Pyroblast', 'Rejuvenation', 'Ice Block']) {
      expect(index.has(spell), `${spell} should be in the dataset`).toBe(true);
    }
  });

  it('still rejects typos', () => {
    for (const typo of ['Firebal', 'Flsh Heal', 'Totally Made Up Spell']) {
      expect(index.has(typo), `${typo} should not be in the dataset`).toBe(false);
    }
  });

  // Real values verified against wago.tools build 12.1.0.69933 while planning. If the
  // multi-table join breaks, these change -- which is the point of asserting them.
  it.each([
    ['Fireball', 133, 'spell_fire_flamebolt', 1750, 40],
    ['Flash Heal', 2061, 'spell_holy_flashheal', 1500, 40],
    ['Counterspell', 2139, 'spell_frost_iceshock', 0, 40],
  ])('resolves %s to its real spell id, icon and metadata', (name, id, icon, castMs, rangeYd) => {
    const spell = index.lookup(name as string)!;
    expect(spell).toBeTruthy();
    expect(spell.id).toBe(id);
    expect(spell.icon).toBe(icon);
    expect(spell.castMs).toBe(castMs);
    expect(spell.rangeYd).toBe(rangeYd);
  });

  it('picks the castable spell when a name is ambiguous', () => {
    // Avenging Wrath has four player-facing ids; 31884 is the real ability.
    const spell = index.lookup('Avenging Wrath')!;
    expect(spell.id).toBe(31884);
    expect(spell.ambiguous).toBe(true);
    expect(index.lookup('Flash Heal')!.ambiguous).toBe(false);
  });

  it('is case-insensitive and trims', () => {
    expect(index.lookup('  fIREBALL ')!.id).toBe(133);
  });

  it('recognises every spell used in the bundled examples', () => {
    // Otherwise the app contradicts its own examples the moment you load one.
    const complaints: string[] = [];
    for (const { example, flavour } of EXAMPLE_CASES) {
      const ast = parseMacro(example.macro, flavour, {
        spells: INDEX_BY_FLAVOUR[flavour],
        classId: example.classId ?? ANY_CLASS,
      });
      for (const issue of ast.issues) {
        if (/not in the bundled spell list/.test(issue.message)) {
          complaints.push(`${example.title} on ${flavour}: ${issue.message}`);
        }
      }
    }
    expect(complaints).toEqual([]);
  });

  it('has an icon for almost everything, including every example spell', () => {
    const withIcon = data.spells.filter((row) => row[2] >= 0).length;
    expect(withIcon / data.spells.length).toBeGreaterThan(0.95);

    for (const name of ['Fireball', 'Flash Heal', 'Counterspell', 'Travel Form', 'Shadow Bolt']) {
      expect(index.lookup(name)!.icon, `${name} should have an icon`).toBeTruthy();
    }
  });

  it('leaves the examples clean of errors and warnings too', () => {
    // Passing classId is the point: it is what exercises the class-ownership check
    // against the examples, which selecting the example's class makes a real promise.
    for (const { example, flavour } of EXAMPLE_CASES) {
      const ast = parseMacro(example.macro, flavour, {
        spells: INDEX_BY_FLAVOUR[flavour],
        classId: example.classId ?? ANY_CLASS,
      });
      const bad = ast.issues.filter((i) => i.severity !== 'info');
      expect(bad.map((i) => i.message), `${example.title} on ${flavour} should be clean`).toEqual([]);
    }
  });

  it('stays within the size budget it was planned against', () => {
    const path = 'src/data/spells.retail.json';
    const raw = statSync(path).size;
    const gzipped = gzipSync(readFileSync(path)).length;
    // Reported so a regression is visible rather than silent.
    console.log(`    spells.retail.json: ${(raw / 1024).toFixed(0)} kB raw, `
      + `${(gzipped / 1024).toFixed(0)} kB gzipped, ${data.icons.length} distinct icons`);
    expect(gzipped).toBeLessThan(400 * 1024);
  });
});

describe('icon and link helpers', () => {
  it('builds CDN urls from the single ICON_BASE constant', () => {
    expect(iconUrl('spell_fire_flamebolt', 36)).toBe(`${ICON_BASE}/36/spell_fire_flamebolt.jpg`);
    expect(iconUrl('spell_fire_flamebolt')).toContain('/56/');
  });

  // The path prefix is what tells Wowhead which game version to show, both on the page
  // and in the tooltip their embed renders, so these three strings are load-bearing.
  it('links to Wowhead on the right game version', () => {
    expect(wowheadUrl(133, 'retail')).toBe('https://www.wowhead.com/spell=133');
    expect(wowheadUrl(133, 'forever')).toBe('https://www.wowhead.com/forever/spell=133');
    expect(wowheadUrl(133, 'era')).toBe('https://www.wowhead.com/classic/spell=133');
  });

  // A new flavour must not silently inherit Midnight's path: every id would then point
  // at a different spell. Adding one means deciding its wowheadPath.
  it('gives every flavour a distinct Wowhead path', () => {
    const urls = FLAVOUR_IDS.map((flavour) => wowheadUrl(133, flavour));
    for (const url of urls) expect(url).toMatch(/^https:\/\/www\.wowhead\.com\/[\w/]*spell=133$/);
    expect(new Set(urls).size).toBe(FLAVOUR_IDS.length);
  });
});


describe('every flavour dataset', () => {
  it.each(ALL)('%s is populated, labelled and carries icons', (flavour, raw, idx) => {
    expect(raw.flavour).toBe(flavour);
    expect(raw.build).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(idx.count).toBeGreaterThan(2000);
    const withIcon = raw.spells.filter((row) => row[2] >= 0).length;
    expect(withIcon / raw.spells.length).toBeGreaterThan(0.95);
  });

  it.each(ALL)('%s resolves the vanilla core every version shares', (_flavour, _raw, idx) => {
    // Real ids, verified against each build. Mortal Strike is 12294 everywhere -- the
    // 9347 in the raw SpellName table is a non-player variant.
    //
    // Asked for rank 1 so one assertion covers all three: the Classic lines hit the rank
    // explicitly, and Midnight has no ranks at all so it falls back to its single record.
    expect(idx.lookup('Fireball', 1)!.id).toBe(133);
    expect(idx.lookup('Mortal Strike', 1)!.id).toBe(12294);
    expect(idx.lookup('Flash Heal', 1)!.id).toBe(2061);
    expect(idx.lookup('Counterspell', 1)!.id).toBe(2139);
  });

  it('draws from genuinely different builds, not one source relabelled', () => {
    expect(data.build.startsWith('12.')).toBe(true);
    expect((eraData as unknown as SpellData).build.startsWith('1.15.')).toBe(true);
    expect((foreverData as unknown as SpellData).build.startsWith('1.60.')).toBe(true);

    // Steady Shot is a Burning Crusade hunter ability: present on Midnight, absent
    // from both vanilla-era spellbooks.
    expect(index.has('Steady Shot')).toBe(true);
    expect(era.has('Steady Shot')).toBe(false);
    expect(forever.has('Steady Shot')).toBe(false);
  });

  // `/cast Fireball(Rank 3)` addresses one specific spell id in game, so the dataset
  // carries a row per (name, rank) rather than collapsing twelve Fireballs into one.
  it.each([['era', era], ['forever', forever]] as const)('%s keys spells by rank', (_f, idx) => {
    expect(idx.ranksFor('Fireball')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(idx.lookup('Fireball', 3)!.id).toBe(145);
    expect(idx.lookup('Fireball', 12)!.id).toBe(25306);

    // No rank given means the highest rank you know, so we answer with the highest we
    // have. Picking the lowest id -- which is what name-only keying did -- made every
    // Classic macro resolve to Rank 1.
    expect(idx.lookup('Fireball')!.rank).toBe(12);
    expect(idx.lookup('Fireball')!.id).toBe(25306);

    // A rank the spell does not have falls back rather than failing; the parser is what
    // decides whether that deserves an issue.
    expect(idx.lookup('Fireball', 99)!.id).toBe(25306);

    // Unranked spells are untouched: Counterspell has a single rank-less row.
    expect(idx.ranksFor('Counterspell')).toEqual([]);
    expect(idx.lookup('Counterspell', 3)!.id).toBe(2139);
  });

  it('leaves Midnight rankless, where ranks do not exist', () => {
    expect(index.ranksFor('Fireball')).toEqual([]);
    expect(index.lookup('Fireball')!.rank).toBe(0);
    // A rank argument is simply ignored rather than failing to match.
    expect(index.lookup('Fireball', 3)!.id).toBe(133);
  });

  it('splitting by rank reduced ambiguity rather than adding to it', () => {
    // Same-named ids used to pile up under one key; most of that pile was just ranks.
    const rate = (raw: SpellData) =>
      raw.spells.filter((row) => row[7] === 1).length / raw.spells.length;
    expect(rate(foreverData as unknown as SpellData)).toBeLessThan(rate(data));
    expect(era.lookup('Fireball', 3)!.ambiguous).toBe(false);
  });

  it('keeps each dataset small enough to be a lazy chunk', () => {
    for (const file of ['era', 'forever'] as const) {
      const path = `src/data/spells.${file}.json`;
      const gzipped = gzipSync(readFileSync(path)).length;
      console.log(`    spells.${file}.json: ${(statSync(path).size / 1024).toFixed(0)} kB raw, `
        + `${(gzipped / 1024).toFixed(0)} kB gzipped`);
      expect(gzipped).toBeLessThan(200 * 1024);
    }
  });
});

describe('class ownership', () => {
  // Real masks verified against each build while planning.
  it.each(ALL)('%s knows who owns the vanilla class staples', (_f, _raw, idx) => {
    expect(idx.lookup('Consecration')!.classes).toEqual(['Paladin']);
    expect(idx.lookup('Mortal Strike')!.classes).toEqual(['Warrior']);
    expect(idx.lookup('Fireball')!.classes).toEqual(['Mage']);
    expect(idx.lookup('Rejuvenation')!.classes).toEqual(['Druid']);
  });

  it('covers the modern classes on Midnight only', () => {
    expect(index.lookup('Fel Rush')!.classes).toEqual(['Demon Hunter']);
    expect(index.lookup('Disintegrate')!.classes).toEqual(['Evoker']);
    expect(index.lookup('Roll')!.classes).toEqual(['Monk']);
    // Those classes do not exist on the vanilla lines, nor do their abilities.
    for (const idx of [era, forever]) {
      expect(idx.has('Fel Rush')).toBe(false);
      expect(idx.has('Disintegrate')).toBe(false);
    }
  });

  it('leaves professions classless rather than listing every class', () => {
    // Classic Era tags professions with all nine classes; that must normalise to none,
    // or the tooltip reads "Warrior / Paladin / Hunter / ... ability" for Mining.
    expect(era.lookup('Mining')!.classes).toEqual([]);
    expect(era.lookup('Tailoring')!.classes).toEqual([]);
    expect(index.lookup('Mining')!.classes).toEqual([]);
  });

  it('never attributes a spell to a class the flavour does not have', () => {
    // Classic-line ClassMask values carry a Death Knight bit regardless.
    const vanillaOnly = new Set(classesFor('era').map((c) => c.name));
    for (const [, raw, idx] of [['era', eraData, era], ['forever', foreverData, forever]] as const) {
      for (const row of (raw as unknown as SpellData).spells.slice(0, 2000)) {
        for (const name of idx.lookup(row[0])!.classes) {
          expect(vanillaOnly.has(name), `${row[0]} attributed to ${name}`).toBe(true);
        }
      }
    }
  });

  it('keeps coverage high enough to be useful', () => {
    const rate = (raw: SpellData, idx: typeof index) =>
      raw.spells.filter((row) => idx.lookup(row[0])!.classMask !== 0).length / raw.spells.length;
    // Floors, not targets. Measured: era 34.9%, forever 24.2%, retail 21.5%. The rest of
    // every dataset is professions, shared skills, items and quest spells, which have no
    // class. These exist to make a broken join loud rather than silent.
    expect(rate(eraData as unknown as SpellData, era)).toBeGreaterThan(0.30);
    expect(rate(foreverData as unknown as SpellData, forever)).toBeGreaterThan(0.20);
    expect(rate(data, index)).toBeGreaterThan(0.15);
  });

  it('answers class ownership as a tri-state, never a guess', () => {
    const consecration = index.lookup('Consecration')!;
    expect(belongsToClass(consecration, 2)).toBe(true);    // Paladin
    expect(belongsToClass(consecration, 1)).toBe(false);   // Warrior
    expect(belongsToClass(consecration, ANY_CLASS)).toBe('unknown');
    // A spell with no class data must never read as "not yours".
    expect(belongsToClass(index.lookup('Mining')!, 1)).toBe('unknown');
  });

  it('offers nine classes on the vanilla lines and thirteen on Midnight', () => {
    expect(classesFor('retail')).toHaveLength(13);
    expect(classesFor('era')).toHaveLength(9);
    expect(classesFor('forever')).toHaveLength(9);
    for (const flavour of ['era', 'forever'] as const) {
      const names = classesFor(flavour).map((c) => c.name);
      expect(names).not.toContain('Death Knight');
      expect(names).not.toContain('Evoker');
    }
  });
});

describe('class presentation data', () => {
  it('uses the game\'s own class colours, not approximations', () => {
    // Straight from ChrClasses.ClassColorR/G/B on build 12.1.0.69933.
    const byName = new Map(WOW_CLASSES.map((c) => [c.name, c]));
    expect(byName.get('Warrior')!.color).toBe('#C69B6D');
    expect(byName.get('Druid')!.color).toBe('#FF7C0A');
    expect(byName.get('Priest')!.color).toBe('#FFFFFF');
    expect(byName.get('Evoker')!.color).toBe('#33937F');
  });

  it('gives every class a colour and an icon', () => {
    expect(WOW_CLASSES).toHaveLength(13);
    for (const c of WOW_CLASSES) {
      expect(c.color, `${c.name} colour`).toMatch(/^#[0-9A-F]{6}$/);
      expect(c.icon, `${c.name} icon`).toMatch(/^[a-z0-9_]+$/);
    }
    // Icon names must be unique, or two classes would show the same badge.
    expect(new Set(WOW_CLASSES.map((c) => c.icon)).size).toBe(13);
  });

  it('tags every bundled example with the class it is written for', () => {
    for (const example of EXAMPLES) {
      expect(example.classId, `${example.title} has no class`).toBeDefined();
      expect(classesFor('retail').some((c) => c.id === example.classId)).toBe(true);
    }
  });

  it('keeps each example clean for its own class', () => {
    // This is the whole point of tagging them: no warnings about our own examples.
    for (const example of EXAMPLES) {
      const ast = parseMacro(example.macro, 'retail', { spells: index, classId: example.classId });
      const complaints = ast.issues.filter((i) => /ability\. Your class is set to/.test(i.message));
      expect(complaints.map((c) => c.message), example.title).toEqual([]);
    }
  });

  it('would warn if an example were loaded as the wrong class', () => {
    // Guards that the previous test passes because of the tag, not because the check
    // is inert.
    const rogueExample = EXAMPLES.find((e) => e.title === 'Modifier multi-spell')!;
    const asWarrior = parseMacro(rogueExample.macro, 'retail', { spells: index, classId: 1 });
    expect(asWarrior.issues.some((i) => /is a Rogue ability/.test(i.message))).toBe(true);
  });
});
