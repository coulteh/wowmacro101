// Bundled spell names, used only for soft hints.
//
// The dataset always lags a patch, so a name we do not recognise is reported at info
// level and never as an error. Being confidently wrong about a spell someone actually
// has is worse than saying nothing at all.

import type { FlavourId } from '../flavours';

export interface SpellData {
  build: string;
  product: string;
  generatedAt: string;
  count: number;
  names: string[];
}

export interface SpellIndex {
  build: string;
  count: number;
  has(name: string): boolean;
}

export function createSpellIndex(data: SpellData): SpellIndex {
  const lookup = new Set(data.names.map((n) => n.toLowerCase()));
  return {
    build: data.build,
    count: data.count,
    has: (name: string) => lookup.has(name.trim().toLowerCase()),
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
