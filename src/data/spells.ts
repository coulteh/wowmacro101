// Bundled spell data, used for soft hints, icons and tooltips.
//
// The dataset always lags a patch, so a name we do not recognise is reported at info
// level and never as an error. Being confidently wrong about a spell someone actually
// has is worse than saying nothing at all.

import { classBit, classNames, maskHasClass, ANY_CLASS, CLASSES_BY_FLAVOUR } from './classes';
import type { FlavourId } from '../flavours';

/**
 * Icons are hotlinked from Blizzard's own CDN rather than copied into this repo: we
 * then host and redistribute nothing, which is the defensible position for a
 * non-commercial fan tool.
 *
 * This is the ONLY place the host appears. The dataset stores icon names, not URLs, so
 * switching to self-hosted files or a caching proxy is a change to this constant plus a
 * download step -- no dataset regeneration.
 */
export const ICON_BASE = 'https://render.worldofwarcraft.com/us/icons';

export type IconSize = 18 | 36 | 56;

export function iconUrl(icon: string, size: IconSize = 56): string {
  return `${ICON_BASE}/${size}/${icon}.jpg`;
}

export function wowheadUrl(id: number): string {
  return `https://www.wowhead.com/spell=${id}`;
}

/**
 * name, id, iconIndex (-1 = none), castMs, rangeYd, cooldownMs, gcdMs, ambiguous,
 * classMask (bit 0 = Warrior ... bit 12 = Evoker; 0 = not class-specific)
 */
export type SpellRow = [
  string, number, number, number, number, number, number, number, number,
];

export interface SpellData {
  build: string;
  product: string;
  /** Which flavour this dataset belongs to; matches the filename. */
  flavour: string;
  generatedAt: string;
  sources: string[];
  count: number;
  icons: string[];
  spells: SpellRow[];
}

export interface SpellRecord {
  name: string;
  id: number;
  icon: string | null;
  castMs: number;
  rangeYd: number;
  cooldownMs: number;
  gcdMs: number;
  /** The name maps to more than one spell id; this is the most likely one. */
  ambiguous: boolean;
  /** Bitmask of owning classes; 0 means not class-specific or simply unknown. */
  classMask: number;
  /** Owning class names, empty when unknown. */
  classes: string[];
}

export interface SpellIndex {
  build: string;
  count: number;
  has(name: string): boolean;
  lookup(name: string): SpellRecord | null;
}

const normalise = (name: string) => name.trim().toLowerCase();

export function createSpellIndex(data: SpellData): SpellIndex {
  const byName = new Map<string, SpellRecord>();

  // Bits for the classes this flavour actually has. Classic-line data carries a Death
  // Knight bit that vanilla has no business with, so masking against the known list
  // both drops that and lets us recognise an "every class" mask.
  const flavourMask = (CLASSES_BY_FLAVOUR[data.flavour as FlavourId] ?? [])
    .reduce((mask, id) => mask | classBit(id), 0);

  const ownership = (raw: number): number => {
    const mask = raw & flavourMask;
    // Available to every class means it is not a class ability at all -- Classic Era
    // tags professions with all nine, which would otherwise list nine classes.
    return flavourMask && mask === flavourMask ? 0 : mask;
  };
  for (const row of data.spells) {
    const [name, id, iconIndex, castMs, rangeYd, cooldownMs, gcdMs, ambiguous] = row;
    // Tolerate a dataset generated before the class column existed.
    const classMask = ownership(row[8] ?? 0);
    byName.set(normalise(name), {
      name,
      id,
      icon: iconIndex >= 0 ? data.icons[iconIndex] ?? null : null,
      castMs,
      rangeYd,
      cooldownMs,
      gcdMs,
      ambiguous: ambiguous === 1,
      classMask,
      classes: classNames(classMask),
    });
  }
  return {
    build: data.build,
    count: data.count,
    has: (name) => byName.has(normalise(name)),
    lookup: (name) => byName.get(normalise(name)) ?? null,
  };
}

// import.meta.glob keeps a missing dataset from breaking the build -- Forever has no
// exportable build on wago.tools yet, so there is deliberately no spells.forever.json.
const DATASETS = import.meta.glob<{ default: SpellData }>('./spells.*.json');

const cache = new Map<FlavourId, SpellIndex | null>();

export async function loadSpellIndex(flavour: FlavourId): Promise<SpellIndex | null> {
  if (cache.has(flavour)) return cache.get(flavour)!;
  const loader = DATASETS[`./spells.${flavour}.json`];
  if (!loader) {
    cache.set(flavour, null);
    return null;
  }
  try {
    const module = await loader();
    const index = createSpellIndex(module.default);
    cache.set(flavour, index);
    return index;
  } catch {
    cache.set(flavour, null);
    return null;
  }
}

// --- Formatting helpers, shared by the tooltip ------------------------------

/** 1.75 stays 1.75, 1.50 becomes 1.5, 2.00 becomes 2. */
function trim(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

export function formatCastTime(ms: number): string {
  if (!ms) return 'Instant';
  return `${trim(ms / 1000)} sec cast`;
}

export function formatRange(yards: number): string {
  if (!yards) return 'Self';
  return `${trim(yards)} yd range`;
}

export function formatCooldown(ms: number): string {
  if (!ms) return 'No cooldown';
  if (ms < 60_000) return `${trim(ms / 1000)} sec cooldown`;
  return `${trim(ms / 60_000)} min cooldown`;
}


/**
 * Does this spell belong to the given class?
 *
 * Tri-state on purpose, matching the simulator: most spells carry no class data at all
 * (professions, mounts, quest items), and "we don't know" must never be presented as
 * "not yours".
 */
export function belongsToClass(spell: SpellRecord, classId: number): boolean | 'unknown' {
  if (classId === ANY_CLASS) return 'unknown';
  if (!spell.classMask) return 'unknown';
  return maskHasClass(spell.classMask, classId);
}
