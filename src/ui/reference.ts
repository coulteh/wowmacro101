// Searchable cheatsheet. Every entry inserts its syntax at the caret.

import { COMMANDS, METACOMMANDS } from '../data/commands';
import { CONDITIONALS } from '../data/conditionals';
import { UNIT_TOKENS } from '../data/units';
import { FLAVOURS, availabilityOf, type FlavourId } from '../flavours';
import { escapeHtml } from './highlight';

export type RefTab = 'commands' | 'conditionals' | 'units';

export const REF_TABS: [RefTab, string][] = [
  ['commands', 'Commands'],
  ['conditionals', 'Conditions'],
  ['units', 'Units'],
];

interface RefItem {
  name: string;
  insert: string;
  short: string;
  detail: string;
  category: string;
  note?: string;
  availability?: 'yes' | 'no' | 'unknown';
}

function commandItems(flavour: FlavourId): RefItem[] {
  const meta: RefItem[] = METACOMMANDS.map((m) => ({
    name: m.names[0],
    insert: `${m.names[0]} `,
    short: m.short,
    detail: m.long,
    category: 'Metacommand',
  }));
  const cmds: RefItem[] = COMMANDS.map((c) => ({
    name: c.names[0],
    insert: `${c.names[0]} `,
    short: c.short,
    detail: `${c.long}${c.names.length > 1 ? `\nAlso: ${c.names.slice(1).join(', ')}` : ''}`,
    category: c.category,
    ...(c.flavourNotes?.[flavour] ? { note: c.flavourNotes[flavour] } : {}),
    availability: availabilityOf(c, flavour),
  }));
  return [...meta, ...cmds];
}

function conditionalItems(flavour: FlavourId): RefItem[] {
  return CONDITIONALS.map((c) => {
    const sample = c.value === 'none' ? c.name : `${c.name}:${c.values?.[0] ?? '…'}`;
    return {
      name: c.value === 'none' ? `[${c.name}]` : `[${c.name}:…]`,
      insert: `[${sample}]`,
      short: c.short,
      detail: `${c.desc(c.values?.slice(0, 1) ?? [], false)}${c.note ? `\n${c.note}` : ''}`,
      category: c.category,
      ...(c.flavourNotes?.[flavour] ? { note: c.flavourNotes[flavour] } : {}),
      availability: availabilityOf(c, flavour),
    };
  });
}

function unitItems(): RefItem[] {
  return UNIT_TOKENS.map((u) => ({
    name: `@${u.name}`,
    insert: `[@${u.name}]`,
    short: u.desc,
    detail: u.desc,
    category: 'Unit',
  }));
}

export function refItems(tab: RefTab, flavour: FlavourId): RefItem[] {
  if (tab === 'commands') return commandItems(flavour);
  if (tab === 'conditionals') return conditionalItems(flavour);
  return unitItems();
}

export function renderReference(tab: RefTab, query: string, flavour: FlavourId): string {
  const q = query.trim().toLowerCase();
  const items = refItems(tab, flavour).filter(
    (i) => !q
      || i.name.toLowerCase().includes(q)
      || i.short.toLowerCase().includes(q)
      || i.category.toLowerCase().includes(q),
  );

  if (!items.length) {
    return `<p class="empty">Nothing matches “${escapeHtml(query)}”.</p>`;
  }

  const byCategory = new Map<string, RefItem[]>();
  for (const item of items) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category)!.push(item);
  }

  return [...byCategory]
    .map(([category, group]) => `<h4 class="ref-cat">${escapeHtml(category)}</h4>`
      + `<ul class="ref-list">${group.map((i) => renderItem(i, flavour)).join('')}</ul>`)
    .join('');
}

function renderItem(item: RefItem, flavour: FlavourId): string {
  const flag = item.availability && item.availability !== 'yes'
    ? `<span class="ref-flag flag-${item.availability}" title="${escapeHtml(item.note ?? '')}">`
      + `${item.availability === 'no' ? `not on ${FLAVOURS[flavour].shortLabel}` : 'unverified'}</span>`
    : '';
  return `<li class="ref-item"><button type="button" class="ref-insert" `
    + `data-insert="${escapeHtml(item.insert)}" title="${escapeHtml(item.detail)}">`
    + `<code>${escapeHtml(item.name)}</code><span>${escapeHtml(item.short)}</span>${flag}</button></li>`;
}
