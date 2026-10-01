export interface Example {
  title: string;
  blurb: string;
  macro: string;
}

export const EXAMPLES: Example[] = [
  {
    title: 'Mouseover healing',
    blurb: 'Heal whoever you point at, fall back to your target, then to yourself.',
    macro: '#showtooltip\n/cast [@mouseover,help,nodead][help,nodead][@player] Flash Heal',
  },
  {
    title: 'Shift to focus',
    blurb: 'One interrupt button: your target normally, your focus with Shift.',
    macro: '#showtooltip\n/cast [mod:shift,@focus][] Counterspell',
  },
  {
    title: 'Modifier multi-spell',
    blurb: 'Three abilities on one key, chosen by which modifier you hold.',
    macro: '#showtooltip\n/cast [mod:alt] Kidney Shot; [mod:shift] Eviscerate; Sinister Strike',
  },
  {
    title: 'One-button travel',
    blurb: 'Picks the right druid form for where you are and what you are doing.',
    macro: '#showtooltip\n/cast [swimming] Aquatic Form; [flyable,nocombat] Flight Form; [combat] Cat Form; Travel Form',
  },
  {
    title: 'Trinkets and cooldowns',
    blurb: 'Fire both trinkets and a cooldown together. Items do not share the spell GCD.',
    macro: '#showtooltip Avenging Wrath\n/use 13\n/use 14\n/cast Avenging Wrath',
  },
  {
    title: 'Cast sequence',
    blurb: 'Steps through a rotation, resetting when you leave combat or pause.',
    macro: '#showtooltip\n/castsequence reset=combat/5 Steady Shot, Arcane Shot',
  },
  {
    title: 'Guard clause',
    blurb: 'Bail out early if there is nothing to attack, so the rest never runs.',
    macro: '/stopmacro [noexists]\n/startattack\n/cast [harm,nodead] Mortal Strike',
  },
  {
    title: 'Pet and player together',
    blurb: 'Sends the pet in and casts, both pointed at your current target.',
    macro: '#showtooltip\n/petattack [@target,harm]\n/cast [@target,harm] Shadow Bolt',
  },
  {
    title: 'Stop casting and swap',
    blurb: 'Interrupt your own cast to get an instant out immediately.',
    macro: '#showtooltip Counterspell\n/stopcasting\n/cast Counterspell',
  },
];
