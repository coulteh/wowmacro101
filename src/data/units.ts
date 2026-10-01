// Unit tokens usable with [@unit] / [target=unit] in macro conditionals.

export interface UnitTokenDoc {
  name: string;
  desc: string;
}

export const UNIT_TOKENS: UnitTokenDoc[] = [
  { name: 'player', desc: 'yourself' },
  { name: 'target', desc: 'your current target' },
  { name: 'focus', desc: 'your focus target' },
  { name: 'pet', desc: 'your pet' },
  { name: 'mouseover', desc: 'whatever your cursor is hovering (unit frame or 3D world)' },
  { name: 'cursor', desc: 'the ground at your cursor (casts ground-targeted spells instantly)' },
  { name: 'none', desc: 'no unit at all (clears the spell target)' },
  { name: 'vehicle', desc: 'the vehicle you are controlling' },
  { name: 'npc', desc: 'the NPC you are currently interacting with' },
  { name: 'targettarget', desc: "your target's target" },
  { name: 'focustarget', desc: "your focus target's target" },
  { name: 'pettarget', desc: "your pet's target" },
  { name: 'mouseovertarget', desc: 'the target of the unit under your cursor' },
  { name: 'party1', desc: 'party member 1 (party1-party4)' },
  { name: 'raid1', desc: 'raid member 1 (raid1-raid40)' },
  { name: 'arena1', desc: 'arena enemy 1 (arena1-arena5)' },
  { name: 'boss1', desc: 'boss unit 1 (boss1-boss8)' },
  { name: 'partypet1', desc: "party member 1's pet" },
  { name: 'raidpet1', desc: "raid member 1's pet" },
  { name: 'softenemy', desc: 'your soft enemy target (action targeting)' },
  { name: 'softfriend', desc: 'your soft friendly target (action targeting)' },
];

const BASE_UNITS = new Set([
  'player', 'target', 'focus', 'pet', 'mouseover', 'cursor', 'none',
  'vehicle', 'npc', 'softenemy', 'softfriend', 'softinteract',
]);

const NUMBERED: Record<string, number> = {
  party: 4, partypet: 4, raid: 40, raidpet: 40, arena: 5, arenapet: 5, boss: 8,
};

/** Strip trailing "target" chains: targettargettarget -> target + 2 hops. */
function peel(unit: string): { base: string; hops: number } {
  let hops = 0;
  let base = unit;
  while (base.length > 6 && base.endsWith('target')) {
    base = base.slice(0, -6);
    hops++;
  }
  return { base, hops };
}

export function isValidUnit(unit: string): boolean {
  if (!unit) return false;
  const { base } = peel(unit.toLowerCase());
  if (BASE_UNITS.has(base)) return true;
  const m = /^([a-z]+)(\d+)$/.exec(base);
  if (m && NUMBERED[m[1]] !== undefined) {
    const n = parseInt(m[2], 10);
    return n >= 1 && n <= NUMBERED[m[1]];
  }
  return false;
}

const BASE_DESC: Record<string, string> = {
  player: 'yourself',
  target: 'your current target',
  focus: 'your focus target',
  pet: 'your pet',
  mouseover: 'the unit under your mouse cursor',
  cursor: 'the ground location under your cursor',
  none: 'nothing (clears the target)',
  vehicle: 'the vehicle you are in',
  npc: 'the NPC you are interacting with',
  softenemy: 'your soft enemy target',
  softfriend: 'your soft friendly target',
  softinteract: 'your soft interact target',
};

const GROUP_DESC: Record<string, (n: string) => string> = {
  party: (n) => `party member ${n}`,
  partypet: (n) => `party member ${n}'s pet`,
  raid: (n) => `raid member ${n}`,
  raidpet: (n) => `raid member ${n}'s pet`,
  arena: (n) => `enemy arena player ${n}`,
  arenapet: (n) => `enemy arena player ${n}'s pet`,
  boss: (n) => `boss unit ${n}`,
};

export function describeUnit(unit: string): string {
  if (!unit) return 'an unspecified unit';
  const { base, hops } = peel(unit.toLowerCase());
  let text = BASE_DESC[base];
  if (!text) {
    const m = /^([a-z]+)(\d+)$/.exec(base);
    if (m && GROUP_DESC[m[1]]) text = GROUP_DESC[m[1]](m[2]);
  }
  if (!text) return `the unit "${unit}"`;
  for (let i = 0; i < hops; i++) text = `the target of ${text}`;
  return text;
}
