// Bundled spell data, used for soft hints, icons and tooltips.
//
// The dataset always lags a patch, so a name we do not recognise is reported at info
// level and never as an error. Being confidently wrong about a spell someone actually
// has is worse than saying nothing at all.

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

/** name, id, iconIndex (-1 = none), castMs, rangeYd, cooldownMs, gcdMs, ambiguous */
export type SpellRow = [string, number, number, number, number, number, number, number];

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
  for (const [name, id, iconIndex, castMs, rangeYd, cooldownMs, gcdMs, ambiguous] of data.spells) {
    byName.set(normalise(name), {
      name,
      id,
      icon: iconIndex >= 0 ? data.icons[iconIndex] ?? null : null,
      castMs,
      rangeYd,
      cooldownMs,
      gcdMs,
      ambiguous: ambiguous === 1,
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
