import { describe, expect, it } from 'vitest';
import { parseMacro } from '../src/parser/parser';
import { FLAVOURS } from '../src/flavours';
import type { MacroAst } from '../src/parser/types';

const errors = (ast: MacroAst) => ast.issues.filter((i) => i.severity === 'error');
const warnings = (ast: MacroAst) => ast.issues.filter((i) => i.severity === 'warning');
const infos = (ast: MacroAst) => ast.issues.filter((i) => i.severity === 'info');
const messages = (ast: MacroAst) => ast.issues.map((i) => i.message);

describe('basic structure', () => {
  it('parses a bare cast', () => {
    const ast = parseMacro('/cast Fireball');
    expect(errors(ast)).toHaveLength(0);
    const line = ast.lines[0];
    expect(line.kind).toBe('command');
    expect(line.command?.name).toBe('/cast');
    expect(line.command?.def?.short).toBe('Cast a spell');
    expect(line.clauses).toHaveLength(1);
    expect(line.clauses[0].arg?.text).toBe('Fireball');
    expect(line.clauses[0].groups).toHaveLength(0);
  });

  it('treats bracket groups as OR and commas as AND', () => {
    const ast = parseMacro('/cast [mod:shift,@focus][help] Counterspell');
    const [clause] = ast.lines[0].clauses;
    expect(clause.groups).toHaveLength(2);
    expect(clause.groups[0].conditions).toHaveLength(2);
    expect(clause.groups[0].conditions[0].name).toBe('mod');
    expect(clause.groups[0].conditions[0].values.map((v) => v.text)).toEqual(['shift']);
    expect(clause.groups[0].conditions[1].kind).toBe('unit');
    expect(clause.groups[0].conditions[1].unit).toBe('focus');
    expect(clause.groups[1].conditions[0].name).toBe('help');
    expect(clause.arg?.text).toBe('Counterspell');
  });

  it('splits clauses on semicolons', () => {
    const ast = parseMacro('/cast [nocombat] Seal; [combat] Judgement; Crusader Strike');
    const { clauses } = ast.lines[0];
    expect(clauses).toHaveLength(3);
    expect(clauses.map((c) => c.arg?.text)).toEqual(['Seal', 'Judgement', 'Crusader Strike']);
    expect(clauses[0].groups[0].conditions[0].negated).toBe(true);
    expect(clauses[0].groups[0].conditions[0].name).toBe('combat');
    expect(clauses[2].groups).toHaveLength(0);
  });

  it('reads [] as an always-true group', () => {
    const ast = parseMacro('/cast [@mouseover,help][] Flash Heal');
    const [clause] = ast.lines[0].clauses;
    expect(clause.groups[1].empty).toBe(true);
    expect(clause.groups[1].conditions).toHaveLength(0);
    expect(errors(ast)).toHaveLength(0);
  });

  it('handles the legacy target=unit form', () => {
    const ast = parseMacro('/cast [target=focus] Polymorph');
    const cond = ast.lines[0].clauses[0].groups[0].conditions[0];
    expect(cond.kind).toBe('unit');
    expect(cond.unit).toBe('focus');
    expect(errors(ast)).toHaveLength(0);
  });

  it('picks up the ! no-toggle prefix', () => {
    const ast = parseMacro('/cast !Aspect of the Cheetah');
    const [clause] = ast.lines[0].clauses;
    expect(clause.bang).toBe(true);
    expect(clause.arg?.text).toBe('Aspect of the Cheetah');
  });

  it('never mis-splits a conditional that genuinely starts with "no"', () => {
    const ast = parseMacro('/cast [nodead] Smite');
    const cond = ast.lines[0].clauses[0].groups[0].conditions[0];
    expect(cond.negated).toBe(true);
    expect(cond.name).toBe('dead');
    expect(ast.source.slice(cond.nameSpan!.start, cond.nameSpan!.end)).toBe('dead');
  });
});

describe('castsequence', () => {
  it('parses reset conditions and the spell list', () => {
    const ast = parseMacro('/castsequence reset=combat/5 Steady Shot, Arcane Shot');
    const seq = ast.lines[0].clauses[0].sequence!;
    expect(seq.reset?.parts).toEqual(['combat', '5']);
    expect(seq.spells.map((s) => s.text)).toEqual(['Steady Shot', 'Arcane Shot']);
    expect(warnings(ast)).toHaveLength(0);
  });

  it('warns on a bogus reset keyword', () => {
    const ast = parseMacro('/castsequence reset=banana Shot');
    expect(messages(ast).join(' ')).toMatch(/not a valid reset condition/);
  });
});

describe('errors and warnings', () => {
  it('flags an unclosed bracket', () => {
    const ast = parseMacro('/cast [mod:shift Fireball');
    expect(messages(ast).join(' ')).toMatch(/Unclosed/);
    expect(ast.lines[0].clauses[0].groups[0].closed).toBe(false);
  });

  it('suggests a correction for a misspelled conditional', () => {
    const ast = parseMacro('/cast [combet] Fireball');
    const issue = errors(ast)[0];
    expect(issue.message).toMatch(/Unknown condition "combet"/);
    expect(issue.suggestion).toBe('combat');
  });

  it('suggests a correction for a misspelled command', () => {
    const ast = parseMacro('/casts Fireball');
    expect(errors(ast)[0].suggestion).toBe('/cast');
  });

  it('rejects an invalid unit token', () => {
    const ast = parseMacro('/cast [@raid99] Heal');
    expect(errors(ast)[0].message).toMatch(/not a valid unit token/);
  });

  it('rejects a line that is not a command or comment', () => {
    const ast = parseMacro('cast Fireball');
    expect(ast.lines[0].kind).toBe('invalid');
    expect(errors(ast)[0].message).toMatch(/must start with a slash command/);
  });

  it('warns that chat commands ignore conditionals', () => {
    const ast = parseMacro('/say [combat] Pulling!');
    expect(warnings(ast)[0].message).toMatch(/does not support \[conditions\]/);
    expect(ast.lines[0].clauses).toHaveLength(0);
    expect(ast.lines[0].rawArg?.text).toBe('[combat] Pulling!');
  });

  it('warns when a second cast line can never fire', () => {
    const ast = parseMacro('/cast Fireball\n/cast Frostbolt');
    const w = warnings(ast);
    expect(w).toHaveLength(1);
    expect(w[0].line).toBe(2);
    expect(w[0].message).toMatch(/Only one spell can be cast/);
  });

  it('does not warn when two cast lines are mutually exclusive', () => {
    // A perfectly good pattern: only one of these can ever pass its conditions.
    const ast = parseMacro('/cast [mod:shift] Eviscerate\n/cast [nomod] Sinister Strike');
    expect(warnings(ast)).toHaveLength(0);
  });

  it('warns once an earlier line is guaranteed to cast', () => {
    // The [] fallback makes line 1 unconditional, so line 2 is dead.
    const ast = parseMacro('/cast [mod:shift][] Eviscerate\n/cast Sinister Strike');
    expect(warnings(ast)).toHaveLength(1);
    expect(warnings(ast)[0].line).toBe(2);
    expect(warnings(ast)[0].message).toMatch(/line 1 always casts/);
  });

  it('counts a unit-only group as unconditional', () => {
    const ast = parseMacro('/cast [@focus] Polymorph\n/cast Frostbolt');
    expect(warnings(ast)).toHaveLength(1);
  });

  it('does not warn for the trinket-plus-cast pattern', () => {
    const ast = parseMacro('#showtooltip\n/use 13\n/cast Avenging Wrath');
    expect(warnings(ast)).toHaveLength(0);
    expect(errors(ast)).toHaveLength(0);
  });

  it('warns when #showtooltip is not on the first line', () => {
    const ast = parseMacro('/cast Fireball\n#showtooltip');
    expect(warnings(ast).some((w) => /only works on the first line/.test(w.message))).toBe(true);
  });

  it('errors past the 255 character limit', () => {
    const ast = parseMacro(`/cast ${'A'.repeat(300)}`);
    expect(errors(ast).some((e) => /limited to 255 characters/.test(e.message))).toBe(true);
  });

  it('treats an empty final clause as a deliberate no-op', () => {
    const ast = parseMacro('/cast [mod:shift] Eviscerate;');
    expect(errors(ast)).toHaveLength(0);
    expect(infos(ast)[0].message).toMatch(/deliberately does nothing/);
  });

  it('errors when a required argument is missing outright', () => {
    const ast = parseMacro('/cast [combat]');
    expect(errors(ast)[0].message).toMatch(/needs something to act on/);
  });

  it('allows commands whose argument is optional', () => {
    const ast = parseMacro('/target [@mouseover]\n/startattack [harm]\n/stopmacro [noexists]');
    expect(errors(ast)).toHaveLength(0);
  });

  it('warns about an unrecognised value only for closed enums', () => {
    expect(warnings(parseMacro('/cast [mod:banana] X'))).toHaveLength(1);
    // [known:...] takes free text, so no warning.
    expect(warnings(parseMacro('/cast [known:Some Spell] X'))).toHaveLength(0);
  });
});

describe('whitespace and comments', () => {
  it('ignores trailing whitespace the game adds to macro bodies', () => {
    const clean = parseMacro('#showtooltip\n/cast [mod:shift] A; B');
    const dirty = parseMacro('#showtooltip   \n/cast [mod:shift] A; B   ');
    expect(dirty.issues.map((i) => i.message)).toEqual(clean.issues.map((i) => i.message));
    expect(dirty.lines[1].clauses.map((c) => c.arg?.text))
      .toEqual(clean.lines[1].clauses.map((c) => c.arg?.text));
  });

  it('distinguishes comments from the #showtooltip metacommand', () => {
    const ast = parseMacro('# just a note\n#showtooltip Fireball');
    expect(ast.lines[0].kind).toBe('comment');
    expect(ast.lines[1].kind).toBe('meta');
    expect(ast.lines[1].clauses[0].arg?.text).toBe('Fireball');
  });

  it('records blank lines without complaint', () => {
    const ast = parseMacro('/cast A\n\n/target B');
    expect(ast.lines.map((l) => l.kind)).toEqual(['command', 'blank', 'command']);
    expect(errors(ast)).toHaveLength(0);
  });
});

describe('source offsets', () => {
  const SAMPLES = [
    '/cast [mod:shift,@focus][help,nodead][] Flash Heal',
    '#showtooltip\n/castsequence reset=combat/5 Steady Shot, Arcane Shot',
    '/cast [nocombat] Seal; [combat] Judgement; Crusader Strike',
    '/say [combat] hi',
    '/cast [mod:shift Fireball',
  ];

  it.each(SAMPLES)('tokens stay inside their line and never overlap: %s', (src) => {
    const ast = parseMacro(src);
    for (const line of ast.lines) {
      let prevEnd = -1;
      for (const t of line.tokens) {
        expect(t.start).toBeGreaterThanOrEqual(line.start);
        expect(t.end).toBeLessThanOrEqual(line.end);
        expect(t.end).toBeGreaterThanOrEqual(t.start);
        expect(src.slice(t.start, t.end)).not.toContain('\n');
        expect(t.start).toBeGreaterThanOrEqual(prevEnd);
        prevEnd = t.end;
      }
    }
  });

  it.each(SAMPLES)('node spans slice back to their own text: %s', (src) => {
    const ast = parseMacro(src);
    for (const line of ast.lines) {
      for (const clause of line.clauses) {
        if (clause.arg) expect(src.slice(clause.arg.start, clause.arg.end)).toBe(clause.arg.text);
        for (const group of clause.groups) {
          if (group.closed) {
            expect(src[group.start]).toBe('[');
            expect(src[group.end - 1]).toBe(']');
          }
          for (const cond of group.conditions) {
            expect(src.slice(cond.start, cond.end)).toBe(cond.raw);
            for (const v of cond.values) expect(src.slice(v.start, v.end)).toBe(v.text);
          }
        }
      }
    }
  });
});

describe('flavours', () => {
  it('accepts skyriding on retail but flags it on Forever', () => {
    expect(parseMacro('/cast [advflyable] Whirling Surge', 'retail').issues).toHaveLength(0);
    const forever = parseMacro('/cast [advflyable] Whirling Surge', 'forever');
    expect(warnings(forever)[0].message).toMatch(/can never be true on Forever/);
  });

  it('marks unverified Forever conditionals as info, never an error', () => {
    // Vehicles are a Wrath-era system but Forever is new content, so this is genuinely
    // unconfirmed rather than known-absent.
    const ast = parseMacro('/cast [vehicleui] Something', 'forever');
    expect(errors(ast)).toHaveLength(0);
    expect(infos(ast).some((i) => /Unverified on Forever/.test(i.message))).toBe(true);
  });
});

describe('soft spell validation', () => {
  const index = {
    build: '12.1.0.69933',
    count: 2,
    has: (name: string) => ['fireball', 'steady shot'].includes(name.trim().toLowerCase()),
    lookup: () => null,
    ranksFor: () => [],
  };

  it('stays silent with no dataset loaded', () => {
    expect(parseMacro('/cast Totally Made Up').issues).toHaveLength(0);
  });

  it('says nothing about a spell it recognises', () => {
    expect(parseMacro('/cast Fireball', 'retail', { spells: index }).issues).toHaveLength(0);
  });

  it('matches case-insensitively', () => {
    expect(parseMacro('/cast fIREBALL', 'retail', { spells: index }).issues).toHaveLength(0);
  });

  it('hints at info level only, never as an error', () => {
    const ast = parseMacro('/cast Firebal', 'retail', { spells: index });
    expect(errors(ast)).toHaveLength(0);
    expect(warnings(ast)).toHaveLength(0);
    expect(infos(ast)[0].message).toMatch(/not in the bundled spell list/);
  });

  it('checks each step of a castsequence', () => {
    const ast = parseMacro('/castsequence reset=5 Steady Shot, Nonsense Shot', 'retail', { spells: index });
    expect(infos(ast)).toHaveLength(1);
    expect(infos(ast)[0].message).toMatch(/Nonsense Shot/);
  });

  it('does not second-guess slot numbers or item ids', () => {
    for (const macro of ['/use 13', '/cast item:12345', '/cast spell:133']) {
      expect(infos(parseMacro(macro, 'retail', { spells: index }))).toHaveLength(0);
    }
  });

  it('leaves chat and Lua text alone', () => {
    expect(parseMacro('/say Some Random Words', 'retail', { spells: index }).issues).toHaveLength(0);
  });
});


describe('spell ranks', () => {
  it('splits the rank off on Classic Era and keeps the base name', () => {
    const ast = parseMacro('/cast Fireball(Rank 3)', 'era');
    const [clause] = ast.lines[0].clauses;
    expect(clause.arg?.text).toBe('Fireball');
    expect(clause.arg?.rank).toBe(3);
    expect(errors(ast)).toHaveLength(0);
  });

  it('tolerates loose spacing and casing', () => {
    for (const macro of ['/cast Fireball( rank 3 )', '/cast Fireball (RANK 3)']) {
      const clause = parseMacro(macro, 'era').lines[0].clauses[0];
      expect(clause.arg?.text, macro).toBe('Fireball');
      expect(clause.arg?.rank, macro).toBe(3);
    }
  });

  it('gives the rank its own token so it highlights separately', () => {
    const ast = parseMacro('/cast Fireball(Rank 3)', 'era');
    const rank = ast.lines[0].tokens.find((t) => t.type === 'rank')!;
    expect(ast.source.slice(rank.start, rank.end)).toBe('(Rank 3)');
    const arg = ast.lines[0].tokens.find((t) => t.type === 'arg')!;
    expect(ast.source.slice(arg.start, arg.end)).toBe('Fireball');
  });

  it('validates the base name, not the whole string', () => {
    const index = {
      build: 'test', count: 1,
      has: (name: string) => name.trim().toLowerCase() === 'fireball',
      lookup: () => null,
      ranksFor: () => [],
    };
    expect(infos(parseMacro('/cast Fireball(Rank 3)', 'era', { spells: index }))).toHaveLength(0);
    expect(infos(parseMacro('/cast Firebal(Rank 3)', 'era', { spells: index }))[0].message)
      .toMatch(/"Firebal" is not in the bundled spell list/);
  });

  it('reads ranks in a castsequence', () => {
    const ast = parseMacro('/castsequence Fireball(Rank 1), Frostbolt(Rank 2)', 'era');
    const steps = ast.lines[0].clauses[0].sequence!.spells;
    expect(steps.map((s) => [s.text, s.rank])).toEqual([['Fireball', 1], ['Frostbolt', 2]]);
  });

  it('leaves the name alone on Midnight but says why it will not work', () => {
    const ast = parseMacro('/cast Fireball(Rank 3)', 'retail');
    const [clause] = ast.lines[0].clauses;
    expect(clause.arg?.text).toBe('Fireball(Rank 3)');
    expect(clause.arg?.rank).toBeUndefined();
    expect(infos(ast)[0].message).toMatch(/Spell ranks were removed in modern World of Warcraft/);
    expect(errors(ast)).toHaveLength(0);
  });

  it('says nothing about rank syntax when there is none', () => {
    expect(parseMacro('/cast Fireball', 'retail').issues).toHaveLength(0);
    expect(parseMacro('/cast Fireball', 'era').issues).toHaveLength(0);
  });
});

describe('Classic Era conditionals', () => {
  it('rejects specialisations, which vanilla does not have', () => {
    const ast = parseMacro('/cast [spec:1] Fireball', 'era');
    expect(warnings(ast)[0].message).toMatch(/can never be true on Classic Era/);
  });

  it('rejects flying on both Classic Era and Forever', () => {
    for (const flavour of ['era', 'forever'] as const) {
      const ast = parseMacro('/cast [flyable] Mount', flavour);
      expect(warnings(ast)[0].message, flavour).toMatch(/can never be true/);
    }
  });

  it('treats row/column talents as native on both Classic lines', () => {
    // Legacy on Midnight, but the real thing on Classic Era and Forever alike.
    expect(parseMacro('/cast [talent:1/1] Something', 'era').issues).toHaveLength(0);
    expect(parseMacro('/cast [talent:1/1] Something', 'forever').issues).toHaveLength(0);
  });

  it('rejects specialisations on both Classic lines', () => {
    // Forever follows Classic Era on talents, so it has no specs either.
    for (const flavour of ['era', 'forever'] as const) {
      const ast = parseMacro('/cast [spec:1] Fireball', flavour);
      expect(warnings(ast)[0].message, flavour).toMatch(/can never be true on/);
    }
    expect(parseMacro('/cast [spec:1] Fireball', 'retail').issues).toHaveLength(0);
  });

  it('admits what it cannot confirm rather than guessing', () => {
    const ast = parseMacro('/cast [group:raid] Heal', 'era');
    expect(errors(ast)).toHaveLength(0);
    expect(infos(ast)[0].message).toMatch(/Unverified on Classic Era/);
  });
});

describe('class mismatch warnings', () => {
  const WARRIOR = 1;
  const PALADIN = 2;

  // A stand-in index so these tests do not depend on the generated dataset.
  const index = {
    build: 'test',
    count: 3,
    has: (name: string) => ['consecration', 'mortal strike', 'mining'].includes(name.trim().toLowerCase()),
    lookup: (name: string) => {
      const key = name.trim().toLowerCase();
      const base = { icon: null, castMs: 0, rangeYd: 0, cooldownMs: 0, gcdMs: 0, ambiguous: false, rank: 0 };
      if (key === 'consecration') {
        return { ...base, name: 'Consecration', id: 26573, classMask: 0b10, classes: ['Paladin'] };
      }
      if (key === 'mortal strike') {
        return { ...base, name: 'Mortal Strike', id: 12294, classMask: 0b1, classes: ['Warrior'] };
      }
      if (key === 'mining') {
        return { ...base, name: 'Mining', id: 2575, classMask: 0, classes: [] };
      }
      return null;
    },
    ranksFor: () => [],
  };

  it('warns when the spell belongs to another class', () => {
    const ast = parseMacro('/cast Consecration', 'retail', { spells: index, classId: WARRIOR });
    const warning = warnings(ast)[0];
    expect(warning.message).toBe('Consecration is a Paladin ability. Your class is set to Warrior.');
    expect(errors(ast)).toHaveLength(0);
  });

  it('says nothing when the spell is yours', () => {
    expect(parseMacro('/cast Consecration', 'retail', { spells: index, classId: PALADIN }).issues)
      .toHaveLength(0);
    expect(parseMacro('/cast Mortal Strike', 'retail', { spells: index, classId: WARRIOR }).issues)
      .toHaveLength(0);
  });

  it('is silent with no class selected', () => {
    expect(parseMacro('/cast Consecration', 'retail', { spells: index }).issues).toHaveLength(0);
    expect(parseMacro('/cast Consecration', 'retail', { spells: index, classId: 0 }).issues)
      .toHaveLength(0);
  });

  it('never warns about a spell with no class data', () => {
    // Professions and items have no owner; "unknown" must not read as "not yours".
    expect(parseMacro('/cast Mining', 'retail', { spells: index, classId: WARRIOR }).issues)
      .toHaveLength(0);
  });

  it('cannot warn without a dataset at all', () => {
    expect(parseMacro('/cast Consecration', 'retail', { classId: WARRIOR }).issues).toHaveLength(0);
  });

  it('checks castsequence steps and #showtooltip too', () => {
    const seq = parseMacro('/castsequence Mortal Strike, Consecration', 'retail',
      { spells: index, classId: WARRIOR });
    expect(warnings(seq).map((w) => w.message))
      .toEqual(['Consecration is a Paladin ability. Your class is set to Warrior.']);

    const meta = parseMacro('#showtooltip Consecration', 'retail', { spells: index, classId: WARRIOR });
    expect(warnings(meta)).toHaveLength(1);
  });

  it('gets the article right for Evoker', () => {
    const evoker = {
      ...index,
      has: () => true,
      lookup: () => ({
        name: 'Disintegrate', id: 356995, icon: null, castMs: 0, rangeYd: 0,
        cooldownMs: 0, gcdMs: 0, ambiguous: false, rank: 0, classMask: 1 << 12, classes: ['Evoker'],
      }),
    };
    expect(parseMacro('/cast Disintegrate', 'retail', { spells: evoker, classId: WARRIOR }).issues[0].message)
      .toMatch(/is an Evoker ability/);
  });
});


describe('spell ranks on both Classic lines', () => {
  it('splits the rank off on Forever as well as Classic Era', () => {
    for (const flavour of ['era', 'forever'] as const) {
      const clause = parseMacro('/cast Fireball(Rank 3)', flavour).lines[0].clauses[0];
      expect(clause.arg?.text, flavour).toBe('Fireball');
      expect(clause.arg?.rank, flavour).toBe(3);
    }
  });

  it('says nothing about rank syntax on a Classic line', () => {
    // The "ranks were removed" note belongs to Midnight only.
    expect(parseMacro('/cast Fireball(Rank 3)', 'forever').issues).toHaveLength(0);
    expect(parseMacro('/cast Fireball(Rank 3)', 'era').issues).toHaveLength(0);
    expect(parseMacro('/cast Fireball(Rank 3)', 'retail').issues).toHaveLength(1);
  });

  describe('a rank the spell does not have', () => {
    // Fireball has 12 ranks; Counterspell has none; Thunderfury is not in the dataset.
    const spells = {
      build: 'test',
      count: 2,
      has: (name: string) => ['fireball', 'counterspell'].includes(name.trim().toLowerCase()),
      lookup: () => null,
      ranksFor: (name: string) =>
        (name.trim().toLowerCase() === 'fireball' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : []),
    };

    it('is reported at info level, never louder', () => {
      const ast = parseMacro('/cast Fireball(Rank 99)', 'era', { spells });
      expect(ast.issues).toHaveLength(1);
      expect(ast.issues[0].severity).toBe('info');
      expect(ast.issues[0].message)
        .toBe('Fireball has ranks 1 to 12 on Classic Era, so "(Rank 99)" will not match (build test).');
    });

    it('stays silent for a rank that exists', () => {
      expect(parseMacro('/cast Fireball(Rank 3)', 'era', { spells }).issues).toHaveLength(0);
      expect(parseMacro('/cast Fireball(Rank 12)', 'era', { spells }).issues).toHaveLength(0);
    });

    // An unknown must never be reported as a falsehood: no rank data means no opinion.
    it('stays silent when we have no ranks for the spell at all', () => {
      expect(parseMacro('/cast Counterspell(Rank 2)', 'era', { spells }).issues).toHaveLength(0);
      expect(parseMacro('/cast Thunderfury(Rank 2)', 'era', { spells }).issues
        .filter((i) => /will not match/.test(i.message))).toHaveLength(0);
    });

    it('checks each step of a castsequence', () => {
      const ast = parseMacro('/castsequence Fireball(Rank 2), Fireball(Rank 99)', 'era', { spells });
      expect(ast.issues.filter((i) => /will not match/.test(i.message))).toHaveLength(1);
    });
  });
});

describe('flavour notes', () => {
  it('does not tell Classic players that spell ranks exist', () => {
    // They know. It was clutter at the top of every page.
    for (const flavour of ['era', 'forever'] as const) {
      expect(FLAVOURS[flavour].note ?? '', flavour).not.toMatch(/rank/i);
    }
  });

  it('keeps the caveats that are actually worth stating', () => {
    expect(FLAVOURS.era.note).toMatch(/unverified/);
    expect(FLAVOURS.forever.note).toMatch(/pre-launch/);
    expect(FLAVOURS.retail.note).toBeUndefined();
  });
});

describe('[equipped] values', () => {
  it('accepts a real item type, singular or plural', () => {
    for (const value of ['Bows', 'Bow', 'Shields', 'Crossbows', 'One-Handed Swords']) {
      const ast = parseMacro(`/cast [equipped:${value}] Shoot`, 'era');
      expect(messages(ast), value).toEqual([]);
    }
  });

  it('accepts an inventory slot name, including the two-hander test', () => {
    for (const value of ['Ranged', 'Two-Hand', 'Trinket', 'Main Hand']) {
      const ast = parseMacro(`/cast [equipped:${value}] Overpower`, 'era');
      expect(messages(ast), value).toEqual([]);
    }
  });

  it('flags a typo at info level, never as a warning or an error', () => {
    // The list cannot be exhaustive -- slot names exist only as Lua globals -- so an
    // unrecognised value must never accuse a working macro of being broken.
    const ast = parseMacro('/cast [equipped:Shiled] Shoot', 'era');
    expect(errors(ast)).toHaveLength(0);
    expect(warnings(ast)).toHaveLength(0);
    expect(infos(ast)).toHaveLength(1);
    expect(infos(ast)[0].message).toContain('"Shiled" is not a value we recognise');
    // Either spelling is a real value; the singular is simply the closer of the two.
    expect(infos(ast)[0].suggestion).toBe('Shield');
  });

  it('is flavour-aware: Fishing Poles is the plural only Midnight has', () => {
    expect(messages(parseMacro('/cast [equipped:Fishing Poles] Shoot', 'retail'))).toEqual([]);
    const era = parseMacro('/cast [equipped:Fishing Poles] Shoot', 'era');
    expect(infos(era)).toHaveLength(1);
    expect(infos(era)[0].message).toContain('on Classic Era');
    expect(messages(parseMacro('/cast [equipped:Fishing Pole] Shoot', 'era'))).toEqual([]);
  });

  it('does not accept the enchanting-scroll category for a two-hander', () => {
    // 'Two-Handed Weapon' is ItemClass 8 (Item Enhancement), not an equippable type.
    // Too far from 'Two-Hand' to suggest, so this only has to be noticed, not corrected.
    const ast = parseMacro('/cast [equipped:Two-Handed Weapon] Overpower', 'era');
    expect(infos(ast)).toHaveLength(1);
    expect(infos(ast)[0].message).toContain('"Two-Handed Weapon" is not a value we recognise');
  });

  it('points at the offending value, not the whole condition', () => {
    const source = '/cast [equipped:Shiled] Shoot';
    const ast = parseMacro(source, 'era');
    const issue = infos(ast)[0];
    expect(source.slice(issue.start, issue.end)).toBe('Shiled');
  });
});
