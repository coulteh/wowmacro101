// Game flavours.
//
// WoW: Forever (interface 16001, build line 1.60.x) reports
// WOW_PROJECT_ID == WOW_PROJECT_MAINLINE -- it is vanilla *content* running on the
// *retail* engine, so it shares Retail's macro parser. Supporting it is a matter of
// tagging which conditionals are meaningful.
//
// The Classic lines -- Classic Era and Forever -- are the genuine fork: spell ranks are
// live there and Midnight has no concept of them, which is what `features` exists for.
// Forever follows Classic Era rather than Midnight on talents too, so it has no
// specialisations.

export type FlavourId = 'retail' | 'forever' | 'era';

export interface FlavourFeatures {
  /** Does `/cast Fireball(Rank 3)` mean anything? Mainline dropped ranks; Classic kept them. */
  spellRanks: boolean;
}

export interface Flavour {
  id: FlavourId;
  label: string;
  shortLabel: string;
  interfaceVersion: number;
  /** True while our rules for this flavour may be wrong; drives a louder banner. */
  provisional: boolean;
  /** Shown under the header whenever present, provisional or not. */
  note?: string;
  features: FlavourFeatures;
}

export const FLAVOURS: Record<FlavourId, Flavour> = {
  // The id stays 'retail' even though the label is the expansion name: permalinks,
  // localStorage and the spells.retail.json filename all depend on it.
  retail: {
    id: 'retail',
    label: 'Midnight (Retail)',
    shortLabel: 'Midnight',
    interfaceVersion: 120100,
    provisional: false,
    features: { spellRanks: false },
  },
  forever: {
    id: 'forever',
    label: 'Forever',
    shortLabel: 'Forever',
    interfaceVersion: 16001,
    provisional: true,
    note:
      'Forever launches 4 Nov 2026. Spell data here comes from a pre-launch build and '
      + 'will change — treat flavour-specific notes as provisional.',
    features: { spellRanks: true },
  },
  era: {
    id: 'era',
    label: 'Classic Era',
    shortLabel: 'Classic Era',
    interfaceVersion: 11509,
    provisional: false,
    // No note about spell ranks: anyone playing a Classic line already knows ranks
    // exist, so saying so is clutter at the top of every page.
    note:
      'A few conditionals could not be confirmed against a reliable source and are '
      + 'marked unverified rather than guessed at.',
    features: { spellRanks: true },
  },
};

export const FLAVOUR_IDS = Object.keys(FLAVOURS) as FlavourId[];
export const DEFAULT_FLAVOUR: FlavourId = 'retail';

/** 'yes' = works, 'no' = parses but can never be true, 'unknown' = unverified. */
export type Availability = 'yes' | 'no' | 'unknown';

export type AvailabilityMap = Partial<Record<FlavourId, Availability>>;

export function availabilityOf(
  entry: { availability?: AvailabilityMap },
  flavour: FlavourId,
): Availability {
  return entry.availability?.[flavour] ?? 'yes';
}
