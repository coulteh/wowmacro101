// Game flavours.
//
// WoW: Forever (interface 16001, build line 1.60.x) reports
// WOW_PROJECT_ID == WOW_PROJECT_MAINLINE -- it is vanilla *content* running on the
// *retail* engine, so it shares Retail's macro parser exactly. Supporting it is a
// matter of tagging which conditionals are meaningful, not forking the parser.
//
// Classic proper would be a real parser fork (spell ranks, different stance indexes),
// which is why the parser reads feature flags from here rather than hardcoding.

export type FlavourId = 'retail' | 'forever';

export interface FlavourFeatures {
  /** Does `/cast Spell(Rank 3)` mean anything? Mainline dropped ranks; Classic kept them. */
  spellRanks: boolean;
}

export interface Flavour {
  id: FlavourId;
  label: string;
  shortLabel: string;
  interfaceVersion: number;
  /** True while the flavour is unreleased/beta and our rules may be wrong. */
  provisional: boolean;
  note?: string;
  features: FlavourFeatures;
}

export const FLAVOURS: Record<FlavourId, Flavour> = {
  retail: {
    id: 'retail',
    label: 'Retail (Modern)',
    shortLabel: 'Retail',
    interfaceVersion: 120100,
    provisional: false,
    features: { spellRanks: false },
  },
  forever: {
    id: 'forever',
    label: 'Forever (Classic+)',
    shortLabel: 'Forever',
    interfaceVersion: 16001,
    provisional: true,
    note:
      'Forever launches 4 Nov 2026 and runs the modern macro engine over vanilla content, ' +
      'so the syntax matches Retail. Which conditionals are actually meaningful is still ' +
      'being confirmed — treat flavour-specific notes as provisional.',
    features: { spellRanks: false },
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
