# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm install                 # or npm ci — the lockfile is kept in sync
npm run dev                 # http://localhost:5173
npm test                    # vitest run, ~190 tests
npm run test:watch
npm run typecheck           # tsc --noEmit
npm run build               # tsc --noEmit && vite build -> dist/
```

`npm run build` runs the typecheck, so CI has no separate typecheck step. A type error
fails the build and therefore the deploy.

Single test file or single test:

```sh
npx vitest run test/parser.test.ts
npx vitest run -t "splits the rank off"
```

Regenerating the committed spell datasets (manual, never in CI):

```sh
npm run data:spells                               # Midnight  -> src/data/spells.retail.json
npm run data:spells -- --product wow_cn_beta      # Forever   -> spells.forever.json
npm run data:spells -- --product wow_classic_era  # Era       -> spells.era.json
npm run data:spells -- --build 12.1.0.69933       # pin a build if the builds API is down
```

Downloads cache in `.cache/` (gitignored), so re-runs are cheap.

## Architecture

A one-way pipeline. Each stage is pure and independently tested; the UI is a thin
render layer at the end.

```
text ──> parser/ ──> AST ──┬──> explain/ ──> rows of {chip, text}
                           └──> sim/     ──> per-clause + per-condition verdicts
                                              ↓
                                            ui/ renders both, keyed by node id
```

- **`src/parser/`** — hand-written, line-oriented. `parseMacro(source, flavour, options)`
  produces `MacroAst` plus `Issue[]`.
- **`src/explain/`** — `MacroAst` -> nested `{ chip, text, children }` rows. No DOM.
- **`src/sim/`** — `(MacroAst, SimState)` -> verdicts. No DOM.
- **`src/ui/`** — renders the above; `src/main.ts` owns app state and wiring.
- **`src/data/`** — dictionaries plus generated spell JSON.

### Five things that will bite you if you don't know them

**1. Source offsets are load-bearing.** Every AST node carries absolute `start`/`end`
into the source string. Those offsets drive the highlight overlay, the caret/hover sync
between editor and explanation, and the squiggles. They are not decoration — if you add
a node, give it correct offsets. `test/parser.test.ts` asserts tokens never overlap and
that every node's span slices back to its own text.

**2. The dictionaries do triple duty.** A `ConditionalDef` in `src/data/conditionals.ts`
documents itself, produces its own English (`desc`), *and* evaluates itself against a
simulated situation (`test`). Keeping those together is what stops the explainer and the
simulator drifting apart. Adding a conditional means adding all three.

`desc(values, negated, unit?, ctx?)` — `ctx` is a `DescContext` carrying class, flavour
and spec, so `[spec:N]` and `[form:N]` can be named rather than numbered.

**3. Nothing guesses.** Tri-state (`boolean | 'unknown'`) runs through the simulator and
the class checks. Conditions that cannot be modelled from toggles (`[known:X]`,
`[equipped:X]`, `[bonusbar:N]`) return `'unknown'` and surface as *might run*. Likewise
`belongsToClass` returns `'unknown'` rather than "not yours" when a spell has no class
data. **Never convert an unknown into a false.**

The same principle governs severity: unrecognised spell names are **info**, flavour
mismatches are **warnings**, and only genuine syntax faults are **errors**. A spell
missing from the dataset must never be an error — the data always lags a patch.

**4. Flavours are data, not branches.** `src/flavours.ts` defines `retail` (Midnight),
`forever` and `era`. Conditionals and commands carry
`availability: { [flavour]: 'yes' | 'no' | 'unknown' }`; parser behaviour differences go
through `features` (currently just `spellRanks`).

Counter-intuitively, **Forever shares Midnight's grammar but follows Classic Era on what
matters**: spell ranks work and there are no specialisations. The flavour id `retail` is
deliberately not renamed to `midnight` — permalinks, `localStorage` and
`spells.retail.json` all depend on the string.

**5. Where the data cannot be trusted, it is hardcoded — with the reason.** Class lists,
spec names, pet-capable classes and shapeshift form orderings live in
`src/data/classes.ts` as literals, each with a comment explaining why. Examples: Classic
builds carry a Death Knight bit in their `ClassMask` despite vanilla having no Death
Knights; `SpellShapeshift.StanceBarOrder` maps directly on Retail but is offset by one on
the Classic lines. Retail Warrior stances are deliberately left *unnamed* because the
data contradicts the well-known order.

**If you cannot corroborate a mapping from two sources, leave it as a number.** A wrong
index is worse than an unlabelled one.

## The spell data pipeline

`scripts/build-spell-data.mjs` joins wago.tools DB2 CSV exports into a committed JSON per
flavour. Output columns: `name, id, iconIndex, castMs, rangeYd, cooldownMs, gcdMs,
ambiguous, classMask`.

Hard-won details:

- **`readCsv` must handle multi-line quoted fields.** `ChrSpecialization.Description_lang`
  contains newlines; naive line-by-line parsing turned its 61 records into 140 broken ones
  and silently corrupted every spec-to-class lookup.
- **A missing table answers 4xx, not 200.** Optional tables use
  `fetchTable(..., { required: false })`. `SpecializationSpells` does not exist on either
  Classic build.
- **wago.tools rejects the default Python user-agent** (403). Use `curl` for ad-hoc probes.
- **Class ownership needs the trait chain.** `SkillLineAbility` alone covers 6% of retail
  names and misses the entire modern class kit. `TraitDefinition -> TraitNodeEntry ->
  TraitNodeXTraitNodeEntry -> TraitNode -> TraitTreeLoadout -> ChrSpecialization` lifts it
  to ~23%, which is correct — the rest are professions, mounts and quest items.
- **Read-time normalisation** in `createSpellIndex` masks class bits to the flavour's known
  classes and treats an "every class" mask as no class at all.

## Icons

Hotlinked from Blizzard's own CDN, never redistributed. The host lives in a single
`ICON_BASE` constant in `src/data/spells.ts` and the datasets store icon *names*, not
URLs, so switching to self-hosting or a proxy is a one-line change.

- Size the request to the display size times the device pixel ratio. A 20px box on a 2x
  display needs the 56px source, not 36px.
- **Do not add `loading="lazy"`.** Lazy images inserted via `innerHTML` into an
  already-laid-out container do not reliably trigger their intersection check, so the
  icons simply never appear.
- Always give explicit `width`/`height` and an `onerror` that hides the image. Graceful
  degradation is a requirement: the CDN offers no uptime guarantee for this use.

## Tooltips

Spell tooltips are Wowhead's, not ours. The in-game descriptions in `Spell.db2` are
templates (`"Deals $s1 Frost damage"`) resolved at runtime from effect values and caster
stats we do not have, so rendering them ourselves would mean inventing numbers. Wowhead
resolves them properly, and their embed does it for any link we emit. The script is
hotlinked, never vendored, on the same terms as the icons: one `SCRIPT_URL` constant in
`src/ui/wowhead.ts`.

Four things, all read out of the minified script rather than its docs page (which answers
403 to anything that is not a browser — the plain-text docs are unreachable by `curl`):

- **The trigger must be an `<a>` or `<area>`.** `data-wowhead` on a `<span>` or `<code>`
  is ignored outright. That is the whole reason a spell chip is an anchor rather than the
  `<code>` every other chip is.
- **One `mouseover` handler is bound on `document`.** Links rendered afterwards are picked
  up for free, so `update()` can re-render the explanation on every keystroke without
  calling `$WowheadPower.refreshLinks()`. That function exists only to re-apply the
  rename/colour/iconize decoration, which is why all three are turned off in `whTooltips`
  — we want our own icon, our own `--tok-*` colours, and the macro token verbatim.
- **The game version comes from the href's path prefix**, so a correct URL from
  `wowheadUrl` is the entire integration. The mapping is flavour data (`wowheadPath` in
  `src/flavours.ts`): Midnight has no prefix, Forever is `/forever/` and Classic Era is
  `/classic/`. Wowhead's own enum calls Forever `CLASSICPLUS` and maps it to `"forever"` —
  do not guess a new flavour's segment, read it out of the script.
- **Load it lazily.** `ensureWowheadTooltips()` is called only once a render has produced
  a spell chip, so an empty editor never contacts Wowhead. The footer discloses this; keep
  the two in step.

Losing Wowhead degrades to a chip with no tooltip, which is still a working link — there
is deliberately no fallback popover. The one casualty is `SpellRecord.ambiguous`, which no
longer has any UI surface.

## UI gotchas

- **The highlight overlay and the textarea must share font metrics exactly.** Font size,
  line height and padding come from shared CSS custom properties
  (`--editor-font-size`, `--editor-line-height`, `--editor-padding`) for precisely this
  reason. `white-space: pre` with synced horizontal scroll avoids wrapping misalignment.
- **`update()` deliberately does not re-render the Situation panel** — rebuilding it on
  every keystroke would fight the controls. When one control reshapes another (class
  names the specs and gates the pet section, spec gates the forms, a unit going absent
  disables its checkboxes), call `rerenderSituation()`, which restores focus by
  `data-path`.
- `.col > *` needs `flex: 0 0 auto`. The sticky side column has a `max-height`, and flex
  items shrink by default, which silently squashed the cards and clipped their content.
- Removing a visible label means moving the accessible name to `aria-label`, not dropping
  it. Several controls rely on this.

## Conventions

`.editorconfig` is authoritative: 2-space indent, LF, single quotes, 120 columns. There
is no linter or formatter — the values were measured from the code, so Reformat Code
should be close to a no-op. `src/data/*.ts` dictionaries are deliberately tabular and
exempt from the width limit.

Negated descriptions must negate the *whole* phrase, including any parenthetical. A test
over the entire dictionary enforces this: a positive gloss may not survive into the
negative, with an explicit allowlist for parentheticals that gloss a term rather than
assert a truth.

## Deployment

`.github/workflows/deploy.yml` tests and builds on every push and pull request, and
deploys to GitHub Pages only from `main`. Live at
<https://coulteh.github.io/wowmacro101/>.

Pages serves from the `/wowmacro101/` subpath, which works because `vite.config.ts` sets
`base: './'` and nothing in the app uses a root-relative URL. To check that locally,
serve the repo root and open the build at its own subpath:

```sh
npm run build && python3 -m http.server 5199   # then http://127.0.0.1:5199/dist/
```

`dist/` is gitignored — the artifact is built in CI, never committed. Pages must be set
to the **GitHub Actions** source (`build_type: workflow`); in branch mode it publishes the
repository root, which serves the unbuilt `index.html` and its `./src/main.ts` script tag.
