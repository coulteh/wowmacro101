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
- **Real spell identity.** Spells show their actual in-game icon, and hovering (or
  tab-focusing) one gives cast time, range, cooldown, spell id, the owning class and a
  link to the full Wowhead tooltip.
- **Class awareness.** Pick your class in the Situation panel and a macro reaching for
  someone else's ability is called out: *"Consecration is a Paladin ability. Your class is
  set to Warrior."* Class-level only — `Mortal Strike` is an Arms talent but any Warrior
  gets a clean tooltip for it.
- **Situation simulator.** Toggle combat, modifiers, forms, and what each unit slot looks
  like. The explanation then marks each clause *runs* / *skipped* / *might run* / *not
  reached*, states the concrete outcome including which unit it landed on, and marks
  every individual condition ✓ / ✗ / ? so you can see *why* a clause was skipped.
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

| Version | Flavour id | Interface | Spell ranks | Data build |
| --- | --- | --- | --- | --- |
| Midnight (Retail) | `retail` | 120100 | no | `12.1.0` |
| Forever | `forever` | 16001 | no | `1.60.1` (pre-launch) |
| Classic Era | `era` | 11509 | **yes** | `1.15.9` |

The id `retail` is deliberately not renamed to `midnight`: permalinks, `localStorage` and
the `spells.retail.json` filename all depend on it. Only the label changes.

WoW: Forever launches 4 November 2026. It reports `WOW_PROJECT_ID == WOW_PROJECT_MAINLINE`
and runs the modern macro engine over vanilla content, so **it shares Midnight's macro
parser** — supporting it is a matter of tagging which conditionals are *meaningful*, not
forking the grammar. Its spell data comes from a pre-launch build and should be
regenerated after launch.

Classic Era is the one version that genuinely differs: **spell ranks**.
`/cast Fireball(Rank 3)` is a core Classic technique and modern WoW has no concept of it,
so the parser splits the rank off only where `features.spellRanks` is set in
`src/flavours.ts`. On Midnight and Forever the parentheses stay part of the name — which
is what the game does — and you get an info explaining why it will not match a spell.
That is a real mistake people make porting Classic macros forward.

Conditionals carry an availability tag per flavour: `yes`, `no` ("parses, but can never
be true here"), or `unknown` ("unverified"). A flavour tag never produces a hard error,
only a warning or an info. Worked examples of each:

- `[flyable]` is **no** on both Forever and Classic Era. Blizzard has said flying will
  [never be in Forever](https://www.warcrafttavern.com/forever/news/flying-mounts-wont-exist-in-wow-forever/)
  — deliberate design, not a launch omission — and vanilla Azeroth has none either.
- `[spec:1]` is **no** on Classic Era: vanilla has no specialisations.
- `[talent:1/1]` is the one place Classic Era is *better* supported than Midnight, where
  row/column talents are legacy. It stays `unknown` on Forever, which runs a legacy
  talent panel on the retail trait system.
- `[group]`, `[known]` and `[channeling]` are **unknown** on Classic Era. Its client
  backported much of the modern macro system so they may well work, but no reliable
  source confirmed it. Tagged honestly rather than guessed — being wrong in the yes/no
  direction would be worse than admitting the gap.

## Spell data

`npm run data:spells` regenerates a dataset from [wago.tools](https://wago.tools/db2)
DB2 exports (no auth needed). The output is committed; the app never makes a network
request. Downloads are cached in `.cache/`, so re-runs are cheap. One command per version:

```sh
npm run data:spells                              # Midnight -> spells.retail.json
npm run data:spells -- --product wow_cn_beta     # Forever  -> spells.forever.json
npm run data:spells -- --product wow_classic_era # Era      -> spells.era.json
```

One parsing subtlety worth knowing if you extend the script: a quoted DB2 field can
contain newlines (`ChrSpecialization.Description_lang` does), so `readCsv` accumulates
lines until the quotes balance. Parsing line-by-line turned that table's 61 records into
140 broken ones and silently corrupted every spec-to-class lookup.

`wow_cn_beta` is where wago.tools files the 1.60.1 build line. The key is not obviously
Forever-named, but the build line matches interface 16001, the spell ids are vanilla, and
Skyriding and Dragonriding are absent — so it is Forever's data. `SpecializationSpells`
does not exist on either Classic-line build; the script detects the 4xx and carries on,
since vanilla has no specialisations anyway.

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

It deliberately **over-includes**: validation is soft, so staying quiet about a real
spell costs far less than telling someone their spell does not exist. An unrecognised
name is always an **info**, never an error, and the dataset will always lag a patch.

The same script resolves each spell's icon and metadata:

| Table | Gives |
| --- | --- |
| `SpellMisc` | icon file id, cast-time index, range index (base difficulty only) |
| `ManifestInterfaceData` | file id → icon name, e.g. `spell_fire_flamebolt` |
| `SpellCastTimes`, `SpellRange`, `SpellCooldowns` | the placeholder-free numbers |

`ManifestInterfaceData` is what makes this cheap — it removes any need for the 152 MB
community listfile. Result: 19,150 names, 99.7% with an icon, 5,839 distinct icons,
1,057 kB raw / ~310 kB gzipped in its own lazily-fetched chunk. The app shell stays at
about 21 kB and renders before the data arrives.

Where one name maps to several spell ids (8.3% of them — `Avenging Wrath` has four), the
build prefers an id the player actually learns over a talent-tree reference, then the
lowest id. The tooltip always shows the spell id and flags the ambiguity, because the
game resolves `/cast Fireball` against *your* spellbook and we cannot know it.

### Why there is no spell description

`Spell.db2` descriptions are templates, not text: **67%** contain `$` placeholders like
`"Deals $s1 Frost damage to the target."`, resolved at runtime from effect values,
scaling curves and caster stats we do not have. Rendering them would show visible junk,
and computing them would be frequently wrong. So the tooltip shows only facts that are
true as written, and links to Wowhead for the rest.

### Class ownership

Class comes from a union of four sources, because no single one is enough:

| Source | Covers |
| --- | --- |
| `SkillLineAbility.ClassMask` | class-restricted abilities |
| `SkillRaceClassInfo` | the class mask of a whole skill line |
| `SpecializationSpells` → `ChrSpecialization` | baseline spec abilities |
| `TraitDefinition` → `TraitNodeEntry` → `TraitNodeXTraitNodeEntry` → `TraitNode` → `TraitTreeLoadout` | the talent trees |

**The trait chain is not optional on Midnight.** Without it coverage is 6% and
`Mortal Strike`, `Rejuvenation` and `Fireball` have no owner at all, because modern class
abilities are granted through talents rather than skill lines. With it, coverage is 21.5%
and every class resolves, Evoker and Demon Hunter included.

Class-specific share of each dataset — **floors to catch a broken join, not targets**:

| | class-specific | the rest |
| --- | --- | --- |
| Midnight | 21.5% | professions, mounts, items, quest spells |
| Classic Era | 34.9% | as above |
| Forever | 24.2% | as above |

Two normalisations happen at read time, in `createSpellIndex`:

- A mask covering **every** class for that flavour becomes "no class". Classic Era tags
  professions with all nine, which would otherwise make Mining a nine-class ability.
- Bits are masked against the flavour's known class list, because Classic-line builds
  carry a Death Knight bit that vanilla has no business with. This is also why
  `src/data/classes.ts` hardcodes which classes each flavour has rather than deriving it.

The mask for a name is the **union across every same-named candidate**, so a name shared
by two classes never warns for either. That direction is deliberate: under-warning beats
falsely telling someone their own spell is not theirs. The warning only ever fires when
the class is positively known and does not match.

Class colours and icons come from `ChrClasses` — `ClassColorR/G/B` and
`IconFileDataID` — rather than being transcribed from memory, so Warrior really is
`#C69B6D` and Druid `#FF7C0A`. Icons resolve through the same
`ManifestInterfaceData` → render-CDN chain as spell icons.

In light mode those colours are mixed 45% with black. That number is load-bearing: it is
the lightest mix where all thirteen clear 4.5:1 contrast against the card background,
with Priest (pure white) the binding case at 4.74:1.

Each bundled example is tagged with the class it is written for, and loading one selects
that class — otherwise the app warns about its own examples using another class's
abilities.

### Known limitation: rank metadata

Each dataset holds one record per *name*, so where a name covers several ranks — 25.6% of
Classic Era names are ambiguous, against 8.3% on Midnight — the tooltip shows one
representative rank's cast time and cooldown, not the rank the macro asked for. Fixing it
means pulling `Spell.db2`'s `NameSubtext_lang` and keying by spell id rather than name.
The tooltip does flag the ambiguity rather than claiming certainty.

### Icons and privacy

Icons are **hotlinked from Blizzard's own CDN** (`render.worldofwarcraft.com`), not
copied into this repo. We host and redistribute nothing, which is the defensible
position for a non-commercial fan tool — bundling the 6,034 icons (~9.1 MB at 36 px)
would be the redistribution case instead.

The cost is that viewing a macro sends the viewer's IP to Blizzard, and the app is no
longer fully offline — icons simply go missing, with explanation and simulation
unaffected. The host lives in a single `ICON_BASE` constant in `src/data/spells.ts`, and
the dataset stores icon *names* rather than URLs, so switching to self-hosted files or a
caching proxy is a one-line change if hotlinking ever stops working.

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
