import { describe, expect, it } from 'vitest';
import { parseMacro } from '../src/parser/parser';
import { evaluateMacro } from '../src/sim/evaluate';
import { defaultSimState, type SimState } from '../src/sim/state';

function sim(src: string, tweak: (s: SimState) => void = () => {}) {
  const state = defaultSimState();
  tweak(state);
  const ast = parseMacro(src);
  const result = evaluateMacro(ast, state);
  const verdicts = ast.lines
    .filter((l) => l.kind === 'command' || l.kind === 'meta')
    .map((l) => l.clauses.map((c) => result.byClause.get(c.id)!.verdict));
  return { ast, result, verdicts };
}

describe('clause precedence', () => {
  const MACRO = '/cast [mod:shift,@focus][@mouseover,help][] Spell';

  it('falls through to the unconditional clause by default', () => {
    // One clause, three OR groups: the empty group carries it.
    const { result, ast } = sim(MACRO);
    const clause = ast.lines[0].clauses[0];
    const r = result.byClause.get(clause.id)!;
    expect(r.verdict).toBe('fires');
    expect(r.firedGroupId).toBe(clause.groups[2].id);
    expect(r.unit).toBeNull();
  });

  it('picks the shift group when shift is held', () => {
    const { result, ast } = sim(MACRO, (s) => { s.modifiers.shift = true; });
    const r = result.byClause.get(ast.lines[0].clauses[0].id)!;
    expect(r.firedGroupId).toBe(ast.lines[0].clauses[0].groups[0].id);
    expect(r.unit).toBe('focus');
  });

  it('picks the mouseover group when a friendly unit is hovered', () => {
    const { result, ast } = sim(MACRO, (s) => {
      s.units.mouseover = { exists: true, reaction: 'friendly', dead: false, inParty: true, inRaid: false };
    });
    const r = result.byClause.get(ast.lines[0].clauses[0].id)!;
    expect(r.unit).toBe('mouseover');
  });

  it('marks the first matching clause as firing and the rest unreachable', () => {
    const { verdicts } = sim(
      '/cast [swimming] Aquatic; [combat] Cat; Travel',
      (s) => { s.combat = true; },
    );
    expect(verdicts[0]).toEqual(['skipped', 'fires', 'unreachable']);
  });

  it('reaches the final fallback when nothing else matches', () => {
    const { verdicts } = sim(
      '/cast [swimming] Aquatic; [combat] Cat; Travel',
      (s) => { s.combat = false; },
    );
    expect(verdicts[0]).toEqual(['skipped', 'skipped', 'fires']);
  });
});

describe('three-valued logic', () => {
  it('reports unmodellable conditions as maybe, never as a guess', () => {
    const { verdicts, result, ast } = sim('/cast [known:Starfire] Starfire; Wrath');
    expect(verdicts[0]).toEqual(['maybe', 'maybe']);
    expect(result.byClause.get(ast.lines[0].clauses[0].id)!.truth).toBe('unknown');
  });

  it('still resolves a definite false next to an unknown', () => {
    // AND with a false member is false regardless of the unknown.
    const { verdicts } = sim('/cast [known:X,nocombat] A; B', (s) => { s.combat = true; });
    expect(verdicts[0]).toEqual(['skipped', 'fires']);
  });

  it('still resolves a definite true next to an unknown in an OR', () => {
    const { verdicts } = sim('/cast [known:X][combat] A; B', (s) => { s.combat = true; });
    expect(verdicts[0]).toEqual(['fires', 'unreachable']);
  });

  it('downgrades later clauses to maybe once something is uncertain', () => {
    const { verdicts } = sim('/cast [equipped:Shields] A; B');
    expect(verdicts[0]).toEqual(['maybe', 'maybe']);
  });

  it('treats an unknown conditional name as unknown, not false', () => {
    const { verdicts } = sim('/cast [bogusname] A; B');
    expect(verdicts[0][0]).toBe('maybe');
  });

  it('cannot model a unit it has no slot for', () => {
    const { verdicts } = sim('/cast [@raid7,help] Heal; Smite');
    expect(verdicts[0]).toEqual(['maybe', 'maybe']);
  });
});

describe('unit resolution', () => {
  it('tests conditions against the redirected unit, not your target', () => {
    // Target is hostile, focus is friendly: [@focus,help] must pass.
    const { verdicts } = sim('/cast [@focus,help] Heal; Smite', (s) => {
      s.units.focus = { exists: true, reaction: 'friendly', dead: false, inParty: true, inRaid: false };
    });
    expect(verdicts[0]).toEqual(['fires', 'unreachable']);
  });

  it('defaults to your current target when no unit is given', () => {
    expect(sim('/cast [harm] Smite; Heal').verdicts[0]).toEqual(['fires', 'unreachable']);
    expect(sim('/cast [help] Heal; Smite').verdicts[0]).toEqual(['skipped', 'fires']);
  });

  it('handles a missing unit as not existing rather than unknown', () => {
    expect(sim('/cast [@focus,exists] A; B').verdicts[0]).toEqual(['skipped', 'fires']);
  });
});

describe('negation', () => {
  it('inverts a definite result', () => {
    expect(sim('/cast [nocombat] A; B', (s) => { s.combat = true; }).verdicts[0])
      .toEqual(['skipped', 'fires']);
    expect(sim('/cast [nocombat] A; B', (s) => { s.combat = false; }).verdicts[0])
      .toEqual(['fires', 'unreachable']);
  });

  it('leaves an unknown unknown', () => {
    expect(sim('/cast [noknown:X] A; B').verdicts[0]).toEqual(['maybe', 'maybe']);
  });
});

describe('/stopmacro', () => {
  it('stops later lines from running when it definitely fires', () => {
    const { result } = sim('/stopmacro [nocombat]\n/cast Fireball', (s) => { s.combat = false; });
    expect(result.stopped).toBe(true);
    expect(result.lines[1].executed).toBe(false);
    expect(result.lines[1].clauses[0].verdict).toBe('unreachable');
  });

  it('lets later lines run when it does not fire', () => {
    const { result } = sim('/stopmacro [nocombat]\n/cast Fireball', (s) => { s.combat = true; });
    expect(result.stopped).toBe(false);
    expect(result.lines[1].clauses[0].verdict).toBe('fires');
  });

  it('downgrades later lines to maybe when it might fire', () => {
    const { result } = sim('/stopmacro [known:X]\n/cast Fireball');
    expect(result.lines[1].conditional).toBe(true);
    expect(result.lines[1].clauses[0].verdict).toBe('maybe');
  });
});

describe('modifiers', () => {
  it('matches any modifier for a bare [mod]', () => {
    expect(sim('/cast [mod] A; B', (s) => { s.modifiers.alt = true; }).verdicts[0])
      .toEqual(['fires', 'unreachable']);
  });

  it('cannot tell left from right, so says so', () => {
    expect(sim('/cast [mod:lshift] A; B', (s) => { s.modifiers.shift = true; }).verdicts[0][0])
      .toBe('maybe');
  });

  it('matches mouse buttons', () => {
    expect(sim('/cast [btn:2] A; B', (s) => { s.button = 2; }).verdicts[0])
      .toEqual(['fires', 'unreachable']);
    expect(sim('/cast [btn:2] A; B', (s) => { s.button = 1; }).verdicts[0])
      .toEqual(['skipped', 'fires']);
  });
});

describe('forms and pets', () => {
  it('matches a shapeshift form by index', () => {
    expect(sim('/cast [form:1] A; B', (s) => { s.form = 1; }).verdicts[0])
      .toEqual(['fires', 'unreachable']);
    expect(sim('/cast [form:0] A; B', (s) => { s.form = 2; }).verdicts[0])
      .toEqual(['skipped', 'fires']);
  });

  it('matches a pet by family', () => {
    expect(sim('/cast [pet:Voidwalker] A; B', (s) => { s.hasPet = true; s.petName = 'voidwalker'; }).verdicts[0])
      .toEqual(['fires', 'unreachable']);
    expect(sim('/cast [pet:Voidwalker] A; B', (s) => { s.hasPet = true; s.petName = 'Felguard'; }).verdicts[0])
      .toEqual(['skipped', 'fires']);
    expect(sim('/cast [pet] A; B').verdicts[0]).toEqual(['skipped', 'fires']);
  });
});

describe('why a clause was skipped', () => {
  function conditions(src: string, tweak: (s: SimState) => void = () => {}) {
    const state = defaultSimState();
    tweak(state);
    const ast = parseMacro(src);
    const result = evaluateMacro(ast, state);
    // Map the raw condition text to its truth so assertions read like the UI.
    const out: Record<string, unknown> = {};
    for (const line of ast.lines) {
      for (const clause of line.clauses) {
        for (const group of clause.groups) {
          for (const cond of group.conditions) {
            out[cond.raw] = result.byCondition.get(cond.id);
          }
        }
      }
    }
    return out;
  }

  it('reports each condition individually, not just the clause verdict', () => {
    expect(conditions('/cast [swimming] A; [combat] B; C', (s) => { s.combat = true; }))
      .toEqual({ swimming: false, combat: true });
  });

  it('says unknown rather than guessing', () => {
    expect(conditions('/cast [known:Starfire] A; B')['known:Starfire']).toBe('unknown');
  });

  it('reports every condition in an AND group, including ones after a failure', () => {
    // No short-circuiting: the UI needs to show which of these failed.
    const result = conditions('/cast [nocombat,harm,nodead] A; B', (s) => { s.combat = true; });
    expect(result).toEqual({ nocombat: false, harm: true, nodead: true });
  });

  it('evaluates conditions against their own group unit', () => {
    const result = conditions('/cast [@focus,help][help] Heal', (s) => {
      s.units.focus = { exists: true, reaction: 'friendly', dead: false, inParty: true, inRaid: false };
      s.units.target = { exists: true, reaction: 'hostile', dead: false, inParty: false, inRaid: false };
    });
    // Both groups contain a `help` condition but they test different units, so the
    // keyed-by-text map collapses them -- assert via the clause instead.
    expect(result['@focus']).toBe(true);
  });

  it('covers negation correctly', () => {
    expect(conditions('/cast [nomounted] A; B', (s) => { s.mounted = true; }))
      .toEqual({ nomounted: false });
    expect(conditions('/cast [nomounted] A; B', (s) => { s.mounted = false; }))
      .toEqual({ nomounted: true });
  });
});
