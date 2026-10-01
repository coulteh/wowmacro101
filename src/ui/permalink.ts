// Macro state lives in the URL hash so a link reproduces the editor exactly.

import { DEFAULT_FLAVOUR, FLAVOURS, type FlavourId } from '../flavours';

export interface Permalink {
  macro: string;
  flavour: FlavourId;
}

export function readPermalink(hash: string): Permalink | null {
  const raw = hash.replace(/^#/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const macro = params.get('m');
  if (macro === null) return null;
  const flavour = params.get('f');
  return {
    macro,
    flavour: flavour && flavour in FLAVOURS ? (flavour as FlavourId) : DEFAULT_FLAVOUR,
  };
}

export function writePermalink(link: Permalink): string {
  const params = new URLSearchParams();
  params.set('m', link.macro);
  if (link.flavour !== DEFAULT_FLAVOUR) params.set('f', link.flavour);
  return `#${params.toString()}`;
}
