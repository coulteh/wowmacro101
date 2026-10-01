# WoW Macro 101

A regex101-style explainer for World of Warcraft macros. Type a macro and it tells you,
token by token, what the game will actually do with it — then lets you set up a situation
and shows which clause really fires.

Macro syntax has the same problem regular expressions do: it is dense, position-sensitive,
and silently wrong in ways the game never reports. `[mod:shift,@focus]` is as opaque to a
new player as `(?<=\b)`, and the in-game macro editor gives you no feedback whatsoever.

## What it does

- **Live explanation.** Every command, clause, condition and unit redirect gets a
  plain-English line. Hover a row to light up the matching text; move the caret and the
  matching row highlights back.
- **Situation simulator.** Toggle combat, modifiers, forms, and what each unit slot looks
  like. The explanation then marks each clause *runs* / *skipped* / *might run* / *not
  reached* and states the concrete outcome, including which unit it landed on.
- **Real diagnostics.** Unknown commands and conditions (with "did you mean"), unclosed
  brackets, the 255-character limit, conditionals on chat commands, `#showtooltip` in the
  wrong place, and the classic mistake of putting two `/cast` lines in one macro.
- **Searchable reference** for every command, condition and unit token, click to insert.
- **Shareable links.** The macro lives in the URL hash.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # parser, explainer and simulator
npm run typecheck
npm run build      # static output in dist/
```

No runtime dependencies. The build is a static site that can be hosted anywhere.

## Game versions

| Flavour | Interface | Status |
| --- | --- | --- |
| Retail (Modern) | 120100 | Supported |
| Forever (Classic+) | 16001 | **Provisional** |

WoW: Forever launches 4 November 2026. It reports `WOW_PROJECT_ID == WOW_PROJECT_MAINLINE`
and runs the modern macro engine over vanilla content, so **it shares Retail's macro
parser** — supporting it is a matter of tagging which conditionals are *meaningful*, not
forking the grammar.

Conditionals carry an availability tag per flavour: `yes`, `no` ("parses, but can never be
true here" — e.g. `[advflyable]`, since skyriding is a Dragonflight-era system), or
`unknown` ("unverified"). A flavour tag never produces a hard error, only a warning or an
info, because the published information about Forever is still mostly unofficial and the
beta was still moving when this was written. Anything flavour-specific should be
re-verified after launch.

Classic proper is not supported. It would be a genuine parser fork — spell ranks,
different stance indexes — which is why the parser reads feature flags from
`src/flavours.ts` rather than hardcoding behaviour.

## Spell data

`npm run data:spells` regenerates `src/data/spells.retail.json` from
[wago.tools](https://wago.tools/db2) DB2 exports (no auth needed). The output is committed;
the app never makes a network request. Downloads are cached in `.cache/`, so re-runs are
cheap.

`SpellName` on its own is every spell in the game — NPC abilities, internal triggers, test
spells — 11 MB and 414,000 rows, useless for validation. So the script keeps only spells
referenced by a table that implies a player can have them:

| Table | Covers |
| --- | --- |
| `SkillLineAbility` | professions, mounts, racials, pet abilities |
| `SpecializationSpells` | baseline spec abilities |
| `TraitDefinition` | the talent trees |

**It takes all three, and that is not optional.** `SkillLineAbility` alone looks
reasonable until you notice it contains *none* of Fireball's 273 spell ids — retail class
abilities are granted through the trait system, so a skill-line-only dataset confidently
reports that Fireball does not exist. That is the one failure this feature cannot afford.
`test/spells.test.ts` guards it by asserting the modern class kit is present and that
every spell in the bundled examples resolves.

The result is ~19,000 names in about 400 kB. It deliberately **over-includes**: validation
is soft, so staying quiet about a real spell costs far less than telling someone their
spell does not exist. An unrecognised name is always an **info**, never an error, and the
dataset will always lag a patch.

There is no `spells.forever.json`: wago.tools exposes only `wow` and `wowxptr` products,
with no 1.60.x build, so Forever spell data is not sourceable yet. The app handles its
absence by simply not hinting. If no Forever product appears, the fallback is to filter
the retail dataset down to vanilla-era skill lines — which would be approximate and must
be labelled as such rather than presented as authoritative.

## Layout

```
src/
  flavours.ts          Flavour definitions and feature flags
  parser/              text -> AST (+ validation). Every node carries source offsets.
  explain/             AST -> nested token/English rows. Pure, no DOM.
  sim/                 (AST, situation) -> per-clause verdicts. Three-valued.
  data/                Command, conditional and unit dictionaries; generated spell list
  ui/                  Editor overlay, explanation, simulator, reference, permalinks
scripts/               Spell dataset builder
test/                  Parser, explainer and simulator tests
```

Three design decisions worth knowing before changing anything:

1. **Source offsets are load-bearing.** Every AST node records absolute `start`/`end` into
   the source. That is what drives the highlight overlay, the hover/caret sync and the
   squiggles — not a convenience.
2. **Dictionaries do triple duty.** A conditional entry documents itself, produces its own
   English description, *and* evaluates itself against a simulated situation. Keeping those
   together is what stops the explainer and the simulator drifting apart.
3. **The simulator is three-valued.** `[known:X]`, `[equipped:X]` and `[bonusbar:N]` cannot
   be modelled from a panel of toggles, so they evaluate to `'unknown'` and surface as
   *might run*. It never guesses.

The highlight layer and the textarea must keep identical font metrics, padding and
`white-space`; those values live in shared CSS custom properties
(`--editor-font-size`, `--editor-line-height`, `--editor-padding`) for exactly that reason.
