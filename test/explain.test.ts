import { describe, expect, it } from 'vitest';
import { parseMacro } from '../src/parser/parser';
import { explainMacro, type ExplRow } from '../src/explain/explain';

function explain(src: string, flavour: 'retail' | 'forever' = 'retail') {
  return explainMacro(parseMacro(src, flavour));
}

function flatten(rows: ExplRow[]): ExplRow[] {
  return rows.flatMap((r) => [r, ...flatten(r.children)]);
}

const texts = (rows: ExplRow[]) => flatten(rows).map((r) => r.text);

describe('clause wording', () => {
  it('describes a fallthrough chain in order', () => {
    const { rows } = explain('/cast [swimming] Aquatic Form; [combat] Cat Form; Travel Form');
    const clauses = rows[0].children;
    expect(clauses[0].text).toBe('If you are swimming, cast Aquatic Form.');
    expect(clauses[1].text).toBe('Otherwise, if you are in combat, cast Cat Form.');
    expect(clauses[2].text).toBe('Otherwise, cast Travel Form.');
  });

  it('spells out each group when they act on different units', () => {
    const { rows } = explain('/cast [mod:shift,@focus][] Counterspell');
    expect(rows[0].children[0].text).toBe(
      'If you are holding Shift, cast Counterspell on your focus target; '
      + 'otherwise cast Counterspell on your current target.',
    );
  });

  it('does not describe two different units identically', () => {
    const { rows } = explain('/cast [@mouseover,help][help][@player] Flash Heal');
    const text = rows[0].children[0].text;
    expect(text).toContain('the unit under your mouse cursor');
    expect(text).toContain('your current target');
    expect(text).toContain('yourself');
  });

  it('names the unit once per group rather than repeating it', () => {
    const { rows } = explain('/cast [@mouseover,help,nodead] Heal');
    const text = rows[0].children[0].text;
    expect(text).toMatch(/is friendly\) and is not dead/);
    expect(text.match(/the unit under your mouse cursor/g)!.length).toBeLessThan(3);
  });

  it('uses the compact form when every group shares a unit', () => {
    const { rows } = explain('/cast [@focus,harm][@focus,dead] Shadow Bolt');
    expect(rows[0].children[0].text).toMatch(/^If .* or .*, cast Shadow Bolt on your focus target\.$/);
  });
});

describe('condition rows', () => {
  it('pairs every condition with a plain-English line', () => {
    const { rows } = explain('/cast [nocombat,@player] Renew');
    const conds = rows[0].children[0].children;
    expect(conds.map((c) => [c.chip, c.text])).toEqual([
      ['nocombat', 'You are not in combat.'],
      ['@player', 'Act on yourself instead of your current target.'],
    ]);
  });

  it('negates helpfully rather than mechanically', () => {
    expect(texts(explain('/cast [nohelp] Smite').rows)).toContain(
      'Your current target cannot receive your helpful spells (is friendly).',
    );
  });

  it('flags an unknown condition on the row itself', () => {
    const { rows } = explain('/cast [combet] Fireball');
    const cond = rows[0].children[0].children[0];
    expect(cond.severity).toBe('error');
    expect(cond.text).toMatch(/not a condition the game understands/);
  });

  it('explains the always-true empty group', () => {
    expect(texts(explain('/cast [mod:shift] A; [] B').rows))
      .toContain('An empty condition is always true — this is the fallback.');
  });
});

describe('command-specific detail', () => {
  it('explains castsequence steps and resets', () => {
    const all = texts(explain('/castsequence reset=combat/5 Steady Shot, Arcane Shot').rows);
    expect(all).toContain(
      'The sequence restarts from step 1 when you leave combat or after 5 seconds of not pressing it.',
    );
    expect(all).toContain('Step 1 of 2. Only a successful cast advances the sequence.');
  });

  it('names the inventory slot behind /use 13', () => {
    expect(texts(explain('/use 13').rows)).toContain(
      'Use whatever is equipped in your trinket 1 slot (inventory slot 13).',
    );
  });

  it('explains the ! no-toggle prefix', () => {
    expect(texts(explain('/cast !Aspect of the Cheetah').rows).join(' '))
      .toMatch(/stops the macro toggling the aura back off/);
  });

  it('uses the unit as the object for /target rather than appending it', () => {
    const { rows } = explain('/target [@mouseover]');
    expect(rows[0].children[0].text).toBe('Target the unit under your mouse cursor.');
  });

  it('does not pretend /stopmacro acts on a unit', () => {
    const { rows } = explain('/stopmacro [@focus,noexists]');
    expect(rows[0].children[0].text).not.toMatch(/ on your focus target/);
  });

  it('treats chat text as text, not conditions', () => {
    const { rows } = explain('/say Pulling now!');
    expect(rows[0].children[0].text).toBe('Say "Pulling now!" in /say.');
  });

  it('marks a comment as ignored', () => {
    expect(explain('# a note').rows[0].text).toMatch(/ignores this line/);
  });
});

describe('summary', () => {
  it('summarises sequential lines as steps', () => {
    const { summary } = explain('#showtooltip\n/use 13\n/cast Avenging Wrath');
    expect(summary).toContain('then');
    expect(summary).toContain('Avenging Wrath');
  });

  it('counts outstanding errors', () => {
    expect(explain('/cast [combet] Fireball').summary).toMatch(/1 problem needs fixing/);
  });

  it('flags provisional flavours', () => {
    expect(explain('/cast Fireball', 'forever').summary).toMatch(/Forever rules are provisional/);
    expect(explain('/cast Fireball', 'retail').summary).not.toMatch(/provisional/);
  });

  it('says something useful when empty', () => {
    expect(explain('').summary).toMatch(/Start typing/);
  });
});
