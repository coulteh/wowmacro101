// Wowhead's tooltip embed.
//
// The in-game spell descriptions in Spell.db2 are templates ("Deals $s1 Frost damage")
// resolved at runtime from effect values and caster stats we do not have, so we cannot
// render them ourselves without inventing numbers. Wowhead can, and their embed will do
// it for any <a> whose href it recognises -- which is why a spell chip is a real link.
//
// Three things about this script are load-bearing, all read out of the script itself
// rather than taken from the docs:
//
// 1. It binds ONE mouseover handler on `document`, so links rendered after it loads are
//    picked up for free. `$WowheadPower.refreshLinks()` exists only to re-apply the
//    rename/colour/iconize decoration, which we turn off -- so `update()` can re-render
//    the explanation on every keystroke without telling Wowhead anything.
// 2. The trigger must be an <a> or <area>. A `data-wowhead` attribute on a <span> or
//    <code> is ignored outright.
// 3. The game version comes from the href's path prefix, so a correct URL from
//    `wowheadUrl` is all it needs. See `wowheadPath` in src/flavours.ts.

/**
 * This is the ONLY place the host appears, matching ICON_BASE in src/data/spells.ts.
 * `widgets/power.js` is the documented path; `js/tooltips.js` is a byte-identical
 * alias.
 */
const SCRIPT_URL = 'https://wow.zamimg.com/widgets/power.js';

declare global {
  interface Window {
    whTooltips?: { colorLinks: boolean; iconizeLinks: boolean; renameLinks: boolean };
  }
}

let injected = false;

/**
 * Load the embed, once, on demand.
 *
 * Called when a render first produces a spell chip rather than from the page shell: an
 * empty editor, or a macro naming no spell we recognise, then never contacts Wowhead at
 * all. Because the handler is delegated from `document` the script does not need to beat
 * the user to the first hover by much, and nothing breaks if it loses that race.
 */
export function ensureWowheadTooltips(): void {
  if (injected) return;
  injected = true;

  // All three off deliberately: the chip already carries our own icon, its text is the
  // macro token exactly as typed -- rank suffix included -- and recolouring by item
  // quality would fight the --tok-* palette the explanation is built on.
  window.whTooltips = { colorLinks: false, iconizeLinks: false, renameLinks: false };

  const script = document.createElement('script');
  script.src = SCRIPT_URL;
  script.async = true;
  // Nothing to fall back to, and nothing to apologise for: a chip with no tooltip is
  // still a working link. Swallow the failure rather than logging on every page view.
  script.onerror = () => {};
  document.head.appendChild(script);
}
