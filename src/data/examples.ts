// Bundled example macros.
//
// The content lives in examples.json so that adding or fixing an example is a data edit
// rather than a code change. This module is only the adapter: it joins the macro lines,
// resolves the class name to an id and exposes the per-flavour filter.

import raw from './examples.json';
import { WOW_CLASSES } from './classes';
import type { FlavourId } from '../flavours';

/** The on-disk shape. `macro` is one entry per line; `class` is a name, not an id. */
interface RawExample {
  title: string;
  blurb: string;
  macro: string[];
  class?: string;
  flavours?: string[];
  default?: boolean;
}

export interface Example {
  title: string;
  blurb: string;
  macro: string;
  /**
   * The class this macro is for. Loading the example selects it, so the app does not
   * warn about its own examples using another class's abilities.
   */
  classId?: number;
  /**
   * Flavours this example is offered on. Absent means all of them -- most examples are
   * flavour-neutral, so only the ones that are not carry the key.
   */
  flavours?: FlavourId[];
}

/** By name so the mapping cannot drift from the class list. */
const CLASS_IDS: Record<string, number> = Object.fromEntries(
  WOW_CLASSES.map((c) => [c.name, c.id]),
);

/**
 * An unknown class name resolves to undefined -- no class filtering -- rather than
 * throwing. A typo in the content must not white-screen the app; the test suite is what
 * makes it loud instead.
 */
export const EXAMPLES: Example[] = (raw as RawExample[]).map((ex) => ({
  title: ex.title,
  blurb: ex.blurb,
  macro: ex.macro.join('\n'),
  ...(ex.class && CLASS_IDS[ex.class] ? { classId: CLASS_IDS[ex.class] } : {}),
  ...(ex.flavours ? { flavours: ex.flavours as FlavourId[] } : {}),
}));

/** The macro the editor opens with, by flag rather than by index. */
export const DEFAULT_EXAMPLE: Example = (() => {
  const index = (raw as RawExample[]).findIndex((ex) => ex.default);
  return EXAMPLES[index === -1 ? 0 : index];
})();

/** The examples worth offering on this flavour. */
export function examplesFor(flavour: FlavourId): Example[] {
  return EXAMPLES.filter((ex) => !ex.flavours || ex.flavours.includes(flavour));
}
