// Macro state lives in the URL hash so a link reproduces the editor exactly.

import { ANY_CLASS, isClassAvailable } from '../data/classes';
import { DEFAULT_FLAVOUR, FLAVOURS, type FlavourId } from '../flavours';

export interface Permalink {
  macro: string;
  flavour: FlavourId;
  classId: number;
}

export function readPermalink(hash: string): Permalink | null {
  const raw = hash.replace(/^#/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const macro = params.get('m');
  if (macro === null) return null;
  const flavour = params.get('f');
  const resolved = flavour && flavour in FLAVOURS ? (flavour as FlavourId) : DEFAULT_FLAVOUR;
  const classId = Number(params.get('c') ?? ANY_CLASS);
  return {
    macro,
    flavour: resolved,
    // A link naming a class the flavour does not have falls back rather than breaking.
    classId: Number.isFinite(classId) && isClassAvailable(resolved, classId) ? classId : ANY_CLASS,
  };
}

export function writePermalink(link: Permalink): string {
  const params = new URLSearchParams();
  params.set('m', link.macro);
  if (link.flavour !== DEFAULT_FLAVOUR) params.set('f', link.flavour);
  if (link.classId !== ANY_CLASS) params.set('c', String(link.classId));
  return `#${params.toString()}`;
}
