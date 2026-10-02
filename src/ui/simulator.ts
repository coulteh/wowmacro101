// The "situation" panel: the macro equivalent of regex101's test string.

import { ANY_CLASS, classesFor, hasPet, specsFor, wowClass } from '../data/classes';
import { iconUrl } from '../data/spells';
import type { FlavourId } from '../flavours';
import type { SimState } from '../sim/state';
import { escapeHtml } from './highlight';

type Control =
  | { kind: 'check'; label: string; path: string }
  | { kind: 'select'; label: string; path: string; type: 'string' | 'number'; options: [string, string][] }
  | { kind: 'number'; label: string; path: string; min: number; max: number }
  | { kind: 'text'; label: string; path: string; placeholder?: string };

interface Section {
  title: string;
  hint?: string;
  controls: Control[];
  /** Hidden when this returns false for the current class. */
  showFor?: (flavour: FlavourId, classId: number) => boolean;
}

const REACTIONS: [string, string][] = [
  ['absent', 'no unit'],
  ['friendly', 'friendly'],
  ['hostile', 'hostile'],
  ['neutral', 'neutral'],
];

/**
 * `[spec:N]` indexes the class's specialisations in order, so with a class chosen we
 * can name them instead of asking for a number nobody remembers.
 */
function renderSpecControl(classId: number, current: number): string {
  const specs = specsFor(classId);
  if (!specs.length) {
    // No class chosen, so there is nothing to name.
    return '<label class="sim-field"><span>spec</span>'
      + `<input type="number" min="1" max="4" value="${current}" data-path="spec" data-type="number">`
      + '</label>';
  }
  const options = specs
    .map((name, i) => `<option value="${i + 1}"${i + 1 === current ? ' selected' : ''}>`
      + `${escapeHtml(`${i + 1} — ${name}`)}</option>`)
    .join('');
  return '<label class="sim-field"><span>spec</span>'
    + `<select data-path="spec" data-type="number">${options}</select></label>`;
}

function unitSection(slot: 'target' | 'focus' | 'mouseover', title: string): Section {
  return {
    title,
    controls: [
      { kind: 'select', label: 'is', path: `units.${slot}.reaction`, type: 'string', options: REACTIONS },
      { kind: 'check', label: 'dead', path: `units.${slot}.dead` },
      { kind: 'check', label: 'in your party', path: `units.${slot}.inParty` },
    ],
  };
}

export const SECTIONS: Section[] = [
  {
    title: 'Your keypress',
    controls: [
      { kind: 'check', label: 'Shift', path: 'modifiers.shift' },
      { kind: 'check', label: 'Ctrl', path: 'modifiers.ctrl' },
      { kind: 'check', label: 'Alt', path: 'modifiers.alt' },
      {
        kind: 'select', label: 'mouse button', path: 'button', type: 'number',
        options: [['1', 'left (or a keybind)'], ['2', 'right'], ['3', 'middle'], ['4', 'button 4'], ['5', 'button 5']],
      },
    ],
  },
  {
    title: 'You are',
    controls: [
      { kind: 'check', label: 'in combat', path: 'combat' },
      { kind: 'check', label: 'mounted', path: 'mounted' },
      { kind: 'check', label: 'stealthed', path: 'stealth' },
      { kind: 'check', label: 'swimming', path: 'swimming' },
      { kind: 'check', label: 'flying', path: 'flying' },
      { kind: 'check', label: 'flying allowed here', path: 'flyable' },
      { kind: 'check', label: 'skyriding here', path: 'advflyable' },
      { kind: 'check', label: 'indoors', path: 'indoors' },
      { kind: 'check', label: 'resting', path: 'resting' },
      { kind: 'check', label: 'channelling', path: 'channeling' },
      { kind: 'number', label: 'form / stance', path: 'form', min: 0, max: 10 },
      { kind: 'number', label: 'action bar', path: 'actionbar', min: 1, max: 6 },
      {
        kind: 'select', label: 'group', path: 'group', type: 'string',
        options: [['none', 'solo'], ['party', 'party'], ['raid', 'raid']],
      },
    ],
  },
  unitSection('target', 'Your target'),
  unitSection('focus', 'Your focus'),
  unitSection('mouseover', 'Under your cursor'),
  {
    title: 'Your pet',
    // Hidden for classes with no commandable pet -- [pet] and /petattack are
    // meaningless there, so the controls would only be noise.
    showFor: hasPet,
    controls: [
      { kind: 'check', label: 'pet is out', path: 'hasPet' },
      { kind: 'text', label: 'family', path: 'petName', placeholder: 'e.g. Voidwalker' },
    ],
  },
];

export function getPath(state: SimState, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, key) => (acc as Record<string, unknown>)?.[key], state as unknown,
  );
}

export function setPath(state: SimState, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const parent = keys.reduce<Record<string, unknown>>(
    (acc, key) => acc[key] as Record<string, unknown>, state as unknown as Record<string, unknown>,
  );
  parent[last] = value;
}

/** `reaction` doubles as presence: "no unit" means the unit does not exist. */
function reactionValue(state: SimState, path: string): string {
  const slot = path.split('.')[1] as 'target' | 'focus' | 'mouseover';
  const unit = state.units[slot];
  return unit.exists ? unit.reaction : 'absent';
}

/**
 * Your class is a property of who you are, not a transient situation, so it lives in
 * app state rather than SimState -- the Reset button must not change it, and the parser
 * needs it. It renders here because this is where it belongs on screen.
 */
export function renderCharacter(flavour: FlavourId, classId: number): string {
  const options = [
    `<option value="${ANY_CLASS}"${classId === ANY_CLASS ? ' selected' : ''}>Any class</option>`,
    ...classesFor(flavour).map(
      (c) => `<option value="${c.id}"${c.id === classId ? ' selected' : ''}`
        // Chrome honours option colours on some platforms and ignores them on others,
        // so this is a bonus -- the select and the icon carry the colour regardless.
        + ` style="color:${c.color}">${escapeHtml(c.name)}</option>`,
    ),
  ].join('');

  const selected = wowClass(classId);
  // The class colour rides on a custom property so the stylesheet can darken it for
  // light mode, where Priest white and Rogue yellow are otherwise unreadable.
  const style = selected ? ` style="--class-color:${selected.color}"` : '';
  const icon = selected
    ? `<img class="class-icon" src="${iconUrl(selected.icon, 36)}" alt="" width="18" height="18"
         onerror="this.style.visibility='hidden'">`
    : '';

  return '<fieldset class="sim-section" id="character"><legend>You are a</legend>'
    + `<div class="sim-controls class-picker${selected ? ' has-class' : ''}"${style}>`
    + `<label class="sim-field"><span>class</span>${icon}`
    + `<select data-path="class" data-type="number">${options}</select></label>`
    + '</div></fieldset>';
}

export function renderSimulator(state: SimState, flavour: FlavourId, classId: number): string {
  const sections = SECTIONS
    .filter((section) => !section.showFor || section.showFor(flavour, classId))
    .map((section) => {
      let body = section.controls.map((c) => renderControl(state, c)).join('');
      // The spec control is built from the class rather than the control list, and
      // [spec:N] does not exist at all on versions without specialisations.
      if (section.title === 'You are' && specAvailable(flavour)) {
        body += renderSpecControl(classId, state.spec);
      }
      return `<fieldset class="sim-section"><legend>${escapeHtml(section.title)}</legend>`
        + `<div class="sim-controls">${body}</div></fieldset>`;
    })
    .join('');
  return renderCharacter(flavour, classId) + sections;
}

/** Classic Era has no specialisations, so asking for one is nonsense there. */
function specAvailable(flavour: FlavourId): boolean {
  return flavour !== 'era';
}

function renderControl(state: SimState, control: Control): string {
  const path = control.path;
  switch (control.kind) {
    case 'check': {
      const on = Boolean(getPath(state, path));
      return `<label class="sim-check"><input type="checkbox" data-path="${path}" data-type="bool"`
        + `${on ? ' checked' : ''}> ${escapeHtml(control.label)}</label>`;
    }
    case 'select': {
      const current = path.endsWith('.reaction')
        ? reactionValue(state, path)
        : String(getPath(state, path));
      const options = control.options
        .map(([v, l]) => `<option value="${v}"${v === current ? ' selected' : ''}>${escapeHtml(l)}</option>`)
        .join('');
      return `<label class="sim-field"><span>${escapeHtml(control.label)}</span>`
        + `<select data-path="${path}" data-type="${control.type}">${options}</select></label>`;
    }
    case 'number': {
      return `<label class="sim-field"><span>${escapeHtml(control.label)}</span>`
        + `<input type="number" min="${control.min}" max="${control.max}" `
        + `value="${String(getPath(state, path))}" data-path="${path}" data-type="number"></label>`;
    }
    case 'text': {
      return `<label class="sim-field"><span>${escapeHtml(control.label)}</span>`
        + `<input type="text" value="${escapeHtml(String(getPath(state, path)))}" `
        + `placeholder="${escapeHtml(control.placeholder ?? '')}" data-path="${path}" data-type="string"></label>`;
    }
  }
}

/** Applies a control change, translating "no unit" back into `exists: false`. */
export function applyControlChange(state: SimState, path: string, type: string, raw: string | boolean): void {
  if (path.endsWith('.reaction')) {
    const slot = path.split('.')[1] as 'target' | 'focus' | 'mouseover';
    if (raw === 'absent') {
      state.units[slot].exists = false;
    } else {
      state.units[slot].exists = true;
      state.units[slot].reaction = raw as 'friendly' | 'hostile' | 'neutral';
    }
    return;
  }
  if (type === 'bool') setPath(state, path, Boolean(raw));
  else if (type === 'number') setPath(state, path, Number(raw));
  else setPath(state, path, raw);
}
