import type { CommandDef, MetaCommandDef } from './types';

/** Inventory slot numbers people actually put in macros. */
const SLOT_NAMES: Record<string, string> = {
  '1': 'head', '2': 'neck', '3': 'shoulder', '5': 'chest', '6': 'belt', '7': 'legs',
  '8': 'boots', '9': 'bracers', '10': 'gloves', '11': 'ring 1', '12': 'ring 2',
  '13': 'trinket 1', '14': 'trinket 2', '15': 'back', '16': 'main hand', '17': 'off hand',
};

function describeUseArg(a: string): string {
  const slot = SLOT_NAMES[a.trim()];
  if (slot) return `use whatever is equipped in your ${slot} slot (inventory slot ${a.trim()})`;
  if (/^\d+$/.test(a.trim())) return `use the item in inventory slot ${a.trim()}`;
  return `use ${a}`;
}

// Slash command dictionary.
//
// args:
//   'conditional' - supports [condition] clauses separated by ';'
//   'text'        - raw chat text, conditionals are NOT parsed
//   'lua'         - raw Lua, conditionals are NOT parsed
//   'none'        - takes no arguments
// action(arg) -> plain-English phrase describing what the clause does.

export const COMMANDS: CommandDef[] = [
  // --- Casting -------------------------------------------------------------
  {
    names: ['/cast', '/spell'],
    category: 'Casting',
    args: 'conditional',
    requiresArg: true,
    short: 'Cast a spell',
    long: 'Casts the named spell. Only one spell can actually be cast per button press, so the first clause whose conditions pass wins.',
    syntax: '/cast [mod:shift,@focus][] Polymorph',
    action: (a: string) => (a ? `cast ${a}` : 'cast nothing (clause does nothing)'),
  },
  {
    names: ['/use'],
    category: 'Casting',
    args: 'conditional',
    requiresArg: true,
    short: 'Use an item (or spell)',
    long: 'Uses an item by name, by inventory slot number (13/14 = trinkets), by bag/slot, or by item:ID. Also works for spells.',
    syntax: '/use [combat] 13',
    action: (a: string) => (a ? describeUseArg(a) : 'use nothing'),
  },
  {
    names: ['/castsequence'],
    category: 'Casting',
    args: 'conditional',
    requiresArg: true,
    short: 'Step through a list of spells',
    long: 'Advances one step through a comma-separated list each time a cast succeeds. The sequence only moves forward on a successful cast, never on a failed one.',
    syntax: '/castsequence reset=combat/5 Spell One, Spell Two',
    action: (a: string) => (a ? `advance the sequence ${a}` : 'advance the sequence'),
  },
  {
    names: ['/castrandom'],
    category: 'Casting',
    args: 'conditional',
    requiresArg: true,
    short: 'Cast a random spell from a list',
    long: 'Picks one spell at random from the comma-separated list each press.',
    syntax: '/castrandom Spell One, Spell Two',
    action: (a: string) => `cast one of these at random: ${a}`,
  },
  {
    names: ['/userandom'],
    category: 'Casting',
    args: 'conditional',
    requiresArg: true,
    short: 'Use a random item from a list',
    long: 'Picks one item at random from the comma-separated list each press. Popular for mount macros.',
    syntax: '/userandom Mount One, Mount Two',
    action: (a: string) => `use one of these at random: ${a}`,
  },
  {
    names: ['/stopcasting'],
    category: 'Casting',
    args: 'conditional',
    requiresArg: false,
    short: 'Interrupt your own cast',
    long: 'Cancels whatever you are currently casting or channeling. Put it *before* the spell that should replace the cast.',
    syntax: '/stopcasting',
    action: () => 'stop your current cast',
  },
  {
    names: ['/stopspelltarget'],
    category: 'Casting',
    args: 'conditional',
    requiresArg: false,
    short: 'Cancel a pending ground-target reticle',
    long: 'Clears the "green circle" targeting cursor without casting.',
    syntax: '/stopspelltarget',
    action: () => 'cancel the pending ground-target reticle',
  },
  {
    names: ['/cancelqueuedspell', '/cqs'],
    category: 'Casting',
    args: 'conditional',
    requiresArg: false,
    short: 'Clear the queued spell',
    long: 'Removes the spell sitting in the queue waiting for the current cast to finish.',
    syntax: '/cancelqueuedspell',
    action: () => 'clear the queued spell',
  },
  {
    names: ['/stopmacro'],
    category: 'Flow',
    args: 'conditional',
    requiresArg: false,
    short: 'Abort the rest of the macro',
    long: 'Stops executing the remaining lines of this macro. With conditions, it is the macro equivalent of an early return.',
    syntax: '/stopmacro [noexists]',
    action: () => 'stop the macro here — later lines will not run',
  },
  {
    names: ['/cancelaura'],
    category: 'Casting',
    args: 'conditional',
    requiresArg: true,
    short: 'Remove a buff from yourself',
    long: 'Cancels the named buff on you. Useful for dropping shapeshifts, Ice Block, Divine Shield, etc.',
    syntax: '/cancelaura Ice Block',
    action: (a: string) => `remove the buff ${a} from yourself`,
  },
  {
    names: ['/cancelform'],
    category: 'Casting',
    args: 'conditional',
    requiresArg: false,
    short: 'Leave your current shapeshift form',
    long: 'Drops the shapeshift/stance you are currently in.',
    syntax: '/cancelform',
    action: () => 'drop your current shapeshift form',
  },

  // --- Targeting -----------------------------------------------------------
  {
    names: ['/target', '/tar'],
    category: 'Targeting',
    args: 'conditional',
    requiresArg: false,
    short: 'Change your target',
    long: 'Targets the named unit or player. With [@unit] and no name, targets that unit token.',
    syntax: '/target [@mouseover] ',
    action: (a: string) => (a ? `target ${a}` : 'change your target to the unit chosen above'),
    unitAction: (u) => `target ${u}`,
  },
  {
    names: ['/targetenemy'],
    category: 'Targeting',
    args: 'conditional',
    requiresArg: false,
    short: 'Cycle to the next enemy',
    long: 'Tabs to the next attackable enemy. Pass 1 to cycle backwards.',
    syntax: '/targetenemy [noexists]',
    action: (a: string) => (a === '1' ? 'cycle backwards through nearby enemies' : 'target the next nearby enemy'),
  },
  {
    names: ['/targetfriend'],
    category: 'Targeting',
    args: 'conditional',
    requiresArg: false,
    short: 'Cycle to the next friendly unit',
    long: 'Tabs to the next friendly unit. Pass 1 to cycle backwards.',
    syntax: '/targetfriend',
    action: () => 'target the next nearby friendly unit',
  },
  {
    names: ['/targetlasttarget'],
    category: 'Targeting',
    args: 'conditional',
    requiresArg: false,
    short: 'Go back to your previous target',
    long: 'Switches to whatever you had targeted before the current target.',
    syntax: '/targetlasttarget',
    action: () => 'switch back to your previous target',
  },
  {
    names: ['/cleartarget'],
    category: 'Targeting',
    args: 'conditional',
    requiresArg: false,
    short: 'Drop your target',
    long: 'Clears your current target entirely.',
    syntax: '/cleartarget [dead]',
    action: () => 'clear your current target',
  },
  {
    names: ['/assist', '/a'],
    category: 'Targeting',
    args: 'conditional',
    requiresArg: false,
    short: "Target your target's target",
    long: 'Assists the named unit — you end up targeting whatever they are targeting.',
    syntax: '/assist [@focus]',
    action: (a: string) => (a ? `assist ${a}` : 'assist the unit chosen above'),
    unitAction: (u) => `assist ${u}`,
  },
  {
    names: ['/focus'],
    category: 'Targeting',
    args: 'conditional',
    requiresArg: false,
    short: 'Set your focus target',
    long: 'Sets focus to the named unit, or to your current target if no unit is given.',
    syntax: '/focus [@mouseover,harm]',
    action: (a: string) => (a ? `set ${a} as your focus` : 'set your focus to the unit chosen above'),
    unitAction: (u) => `set ${u} as your focus`,
  },
  {
    names: ['/clearfocus'],
    category: 'Targeting',
    args: 'conditional',
    requiresArg: false,
    short: 'Clear your focus target',
    long: 'Removes your current focus.',
    syntax: '/clearfocus [@focus,dead]',
    action: () => 'clear your focus target',
  },

  // --- Combat --------------------------------------------------------------
  {
    names: ['/startattack'],
    category: 'Combat',
    args: 'conditional',
    requiresArg: false,
    short: 'Begin auto-attacking',
    long: 'Starts melee auto-attack if it is not already running. Safe to spam — it never toggles attack off.',
    syntax: '/startattack [harm,nodead]',
    action: () => 'start auto-attacking',
  },
  {
    names: ['/stopattack'],
    category: 'Combat',
    args: 'conditional',
    requiresArg: false,
    short: 'Stop auto-attacking',
    long: 'Turns melee auto-attack off.',
    syntax: '/stopattack',
    action: () => 'stop auto-attacking',
  },
  {
    names: ['/dismount'],
    category: 'Combat',
    args: 'conditional',
    requiresArg: false,
    short: 'Get off your mount',
    long: 'Dismounts you. Add [mounted] so the line is a no-op when you are on foot.',
    syntax: '/dismount [mounted]',
    action: () => 'dismount',
  },
  {
    names: ['/leavevehicle'],
    category: 'Combat',
    args: 'conditional',
    requiresArg: false,
    short: 'Exit the vehicle you are in',
    long: 'Leaves the current vehicle, if you are allowed to.',
    syntax: '/leavevehicle [canexitvehicle]',
    action: () => 'exit your vehicle',
    availability: { forever: 'unknown', era: 'no' },
    flavourNotes: {
      forever: 'Vehicles are a Wrath-era system; unconfirmed for Forever.',
      era: 'Vehicles are a Wrath-era system.',
    },
  },

  // --- Pet -----------------------------------------------------------------
  {
    names: ['/petattack'],
    category: 'Pet',
    args: 'conditional',
    requiresArg: false,
    short: 'Send your pet to attack',
    long: 'Orders your pet onto the given unit (or your current target).',
    syntax: '/petattack [@target,harm]',
    action: (a: string) => (a ? `send your pet to attack ${a}` : 'send your pet to attack the unit chosen above'),
    unitAction: (u) => `send your pet to attack ${u}`,
  },
  { names: ['/petfollow'], category: 'Pet', args: 'conditional', requiresArg: false, short: 'Pet follows you', long: 'Sets your pet to follow mode.', syntax: '/petfollow', action: () => 'order your pet to follow you' },
  { names: ['/petstay'], category: 'Pet', args: 'conditional', requiresArg: false, short: 'Pet holds position', long: 'Tells your pet to stay where it is.', syntax: '/petstay', action: () => 'order your pet to stay put' },
  { names: ['/petpassive'], category: 'Pet', args: 'conditional', requiresArg: false, short: 'Pet stance: passive', long: 'Pet will not attack on its own.', syntax: '/petpassive', action: () => 'set your pet to passive' },
  { names: ['/petdefensive'], category: 'Pet', args: 'conditional', requiresArg: false, short: 'Pet stance: defensive', long: 'Pet attacks things that attack you.', syntax: '/petdefensive', action: () => 'set your pet to defensive' },
  { names: ['/petautocaston'], category: 'Pet', args: 'conditional', requiresArg: true, short: 'Enable a pet ability autocast', long: 'Turns autocast on for the named pet ability.', syntax: '/petautocaston Claw', action: (a: string) => `enable autocast for ${a}` },
  { names: ['/petautocastoff'], category: 'Pet', args: 'conditional', requiresArg: true, short: 'Disable a pet ability autocast', long: 'Turns autocast off for the named pet ability.', syntax: '/petautocastoff Growl', action: (a: string) => `disable autocast for ${a}` },
  { names: ['/dismisspet', '/petdismiss'], category: 'Pet', args: 'conditional', requiresArg: false, short: 'Dismiss your pet', long: 'Sends your pet away.', syntax: '/dismisspet', action: () => 'dismiss your pet' },

  // --- Items / UI ----------------------------------------------------------
  {
    names: ['/equip'],
    category: 'Items',
    args: 'conditional',
    requiresArg: true,
    short: 'Equip an item',
    long: 'Equips the named item into its default slot. Cannot be done in combat.',
    syntax: '/equip [nocombat] Shield of Ages',
    action: (a: string) => `equip ${a}`,
  },
  {
    names: ['/equipslot'],
    category: 'Items',
    args: 'conditional',
    requiresArg: true,
    short: 'Equip an item into a specific slot',
    long: 'Equips an item into the numbered inventory slot (16 = main hand, 17 = off hand).',
    syntax: '/equipslot 17 Tome of Light',
    action: (a: string) => `equip into slot ${a}`,
  },
  {
    names: ['/equipset'],
    category: 'Items',
    args: 'conditional',
    requiresArg: true,
    short: 'Swap to a saved equipment set',
    long: 'Equips a set saved in the Equipment Manager.',
    syntax: '/equipset [nocombat] Healing',
    action: (a: string) => `equip the saved set "${a}"`,
    availability: { era: 'no' },
    flavourNotes: { era: 'The Equipment Manager arrived in Wrath.' },
  },
  {
    names: ['/click'],
    category: 'UI',
    args: 'conditional',
    requiresArg: true,
    short: 'Virtually click a button',
    long: 'Clicks a named UI button by frame name — the standard trick for firing another action button, or a hidden addon button.',
    syntax: '/click ActionButton1 LeftButton',
    action: (a: string) => `virtually click the button ${a}`,
  },
  {
    names: ['/swapactionbar'],
    category: 'UI',
    args: 'conditional',
    requiresArg: true,
    short: 'Toggle between two action bar pages',
    long: 'Switches back and forth between the two numbered action bar pages.',
    syntax: '/swapactionbar 1 2',
    action: (a: string) => `toggle between action bar pages ${a}`,
  },
  {
    names: ['/changeactionbar'],
    category: 'UI',
    args: 'conditional',
    requiresArg: true,
    short: 'Switch to an action bar page',
    long: 'Jumps directly to the numbered action bar page.',
    syntax: '/changeactionbar 2',
    action: (a: string) => `switch to action bar page ${a}`,
  },

  // --- Chat ----------------------------------------------------------------
  { names: ['/say', '/s'], category: 'Chat', args: 'text', requiresArg: true, short: 'Speak in /say', long: 'Says the text out loud to nearby players. Chat commands do NOT support [conditions].', syntax: '/say Pulling now!', action: (a: string) => `say "${a}" in /say` },
  { names: ['/yell', '/y'], category: 'Chat', args: 'text', requiresArg: true, short: 'Yell the text', long: 'Yells the text to a wide radius. Does NOT support [conditions].', syntax: '/yell Incoming!', action: (a: string) => `yell "${a}"` },
  { names: ['/party', '/p'], category: 'Chat', args: 'text', requiresArg: true, short: 'Speak in party chat', long: 'Sends the text to party chat. Does NOT support [conditions].', syntax: '/party Interrupting!', action: (a: string) => `send "${a}" to party chat` },
  { names: ['/raid', '/ra'], category: 'Chat', args: 'text', requiresArg: true, short: 'Speak in raid chat', long: 'Sends the text to raid chat. Does NOT support [conditions].', syntax: '/raid Bloodlust up', action: (a: string) => `send "${a}" to raid chat` },
  { names: ['/guild', '/g'], category: 'Chat', args: 'text', requiresArg: true, short: 'Speak in guild chat', long: 'Sends the text to guild chat.', syntax: '/guild Hello', action: (a: string) => `send "${a}" to guild chat` },
  { names: ['/emote', '/e', '/me'], category: 'Chat', args: 'text', requiresArg: true, short: 'Perform a custom emote', long: 'Emotes the text. Does NOT support [conditions].', syntax: '/emote waves.', action: (a: string) => `emote "${a}"` },
  { names: ['/whisper', '/w', '/tell', '/t'], category: 'Chat', args: 'text', requiresArg: true, short: 'Whisper a player', long: 'Sends a private message.', syntax: '/w Playername hi', action: (a: string) => `whisper ${a}` },

  // --- Scripting -----------------------------------------------------------
  {
    names: ['/run', '/script'],
    category: 'Scripting',
    args: 'lua',
    requiresArg: true,
    short: 'Run a line of Lua',
    long: 'Executes arbitrary Lua. It cannot cast spells or do anything else "protected" — Blizzard blocks that from scripts.',
    syntax: '/run print(UnitName("target"))',
    action: (a: string) => `run the Lua snippet: ${a}`,
  },
  {
    names: ['/dump'],
    category: 'Scripting',
    args: 'lua',
    requiresArg: true,
    short: 'Print a Lua value to chat',
    long: 'Evaluates the expression and dumps the result into the chat frame. Debugging only.',
    syntax: '/dump GetSpellCooldown(133)',
    action: (a: string) => `print the value of ${a} to chat`,
  },
];

// Metacommands (the "#" lines).
export const METACOMMANDS: MetaCommandDef[] = [
  {
    names: ['#showtooltip'],
    short: 'Pick the icon, tooltip and cooldown shown on the button',
    long: 'Decides which spell or item the button displays. With no argument it follows the first castable thing in the macro. With conditions it can show different spells in different situations.',
    syntax: '#showtooltip [mod:shift] Spell Two; Spell One',
  },
  {
    names: ['#show'],
    short: 'Pick the icon shown on the button (no cooldown swirl)',
    long: 'Like #showtooltip but only sets the icon — it does not pull in the tooltip or the cooldown sweep.',
    syntax: '#show Spell One',
  },
];

const BY_NAME = new Map<string, CommandDef>();
for (const cmd of COMMANDS) for (const n of cmd.names) BY_NAME.set(n.toLowerCase(), cmd);

export function lookupCommand(name: string): CommandDef | null {
  return BY_NAME.get(String(name).toLowerCase()) ?? null;
}

export function allCommandNames(): string[] {
  return [...BY_NAME.keys()];
}
