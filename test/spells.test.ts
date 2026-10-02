import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import spellData from '../src/data/spells.retail.json';
import eraData from '../src/data/spells.era.json';
import foreverData from '../src/data/spells.forever.json';
import {
  belongsToClass, createSpellIndex, formatCastTime, formatCooldown, formatRange, iconUrl,
  wowheadUrl, ICON_BASE, type SpellData,
} from '../src/data/spells';
import { EXAMPLES } from '../src/data/examples';
import { ANY_CLASS, classesFor } from '../src/data/classes';
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
    for (const example of EXAMPLES) {
      const ast = parseMacro(example.macro, 'retail', { spells: index });
      for (const issue of ast.issues) {
        if (/not in the bundled spell list/.test(issue.message)) {
          complaints.push(`${example.title}: ${issue.message}`);
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
    for (const example of EXAMPLES) {
      const ast = parseMacro(example.macro, 'retail', { spells: index });
      const bad = ast.issues.filter((i) => i.severity !== 'info');
      expect(bad.map((i) => i.message), `${example.title} should be clean`).toEqual([]);
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

  it('links to Wowhead by spell id', () => {
    expect(wowheadUrl(133)).toBe('https://www.wowhead.com/spell=133');
  });

  it('formats facts the way a tooltip should read', () => {
    expect(formatCastTime(0)).toBe('Instant');
    expect(formatCastTime(1500)).toBe('1.5 sec cast');
    expect(formatCastTime(2000)).toBe('2 sec cast');
    expect(formatCastTime(1750)).toBe('1.75 sec cast');
    expect(formatRange(0)).toBe('Self');
    expect(formatRange(40)).toBe('40 yd range');
    expect(formatCooldown(0)).toBe('No cooldown');
    expect(formatCooldown(25_000)).toBe('25 sec cooldown');
    expect(formatCooldown(120_000)).toBe('2 min cooldown');
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
    expect(idx.lookup('Fireball')!.id).toBe(133);
    expect(idx.lookup('Mortal Strike')!.id).toBe(12294);
    expect(idx.lookup('Flash Heal')!.id).toBe(2061);
    expect(idx.lookup('Counterspell')!.id).toBe(2139);
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

  it('shows more ambiguity on the rank-bearing versions', () => {
    // Ranks share a spell name, so Classic-line datasets collapse many ids per name.
    const rate = (raw: SpellData) =>
      raw.spells.filter((row) => row[7] === 1).length / raw.spells.length;
    expect(rate(eraData as unknown as SpellData))
      .toBeGreaterThan(rate(data));
    expect(era.lookup('Fireball')!.ambiguous).toBe(true);
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
