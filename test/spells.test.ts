import { describe, expect, it } from 'vitest';
import spellData from '../src/data/spells.retail.json';
import { createSpellIndex, type SpellData } from '../src/data/spells';
import { EXAMPLES } from '../src/data/examples';
import { parseMacro } from '../src/parser/parser';

const index = createSpellIndex(spellData as SpellData);

describe('bundled spell dataset', () => {
  it('is populated and labelled with its build', () => {
    expect(index.count).toBeGreaterThan(10_000);
    expect(spellData.build).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(spellData.sources).toContain('TraitDefinition');
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

  it('leaves the examples clean of errors and warnings too', () => {
    for (const example of EXAMPLES) {
      const ast = parseMacro(example.macro, 'retail', { spells: index });
      const bad = ast.issues.filter((i) => i.severity !== 'info');
      expect(bad.map((i) => i.message), `${example.title} should be clean`).toEqual([]);
    }
  });
});
