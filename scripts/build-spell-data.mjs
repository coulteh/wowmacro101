#!/usr/bin/env node
/**
 * Builds the bundled spell-name dataset from wago.tools DB2 exports.
 *
 * Run manually; the output is committed. The app never talks to the network.
 *
 *   node scripts/build-spell-data.mjs [--product wow] [--build 12.1.0.69933]
 *
 * Why a join: SpellName on its own is every spell in the game -- NPC abilities,
 * internal triggers, test spells -- over 10 MB and useless for validation. So we keep
 * only spells referenced by a table that implies "a player can have this".
 *
 * It takes three tables, not one. SkillLineAbility alone covers professions, mounts,
 * racials and pet abilities but almost none of the modern class kit -- Fireball has 273
 * spell ids and *none* of them appear in it, because retail class abilities are granted
 * through the trait/talent system. Missing Fireball is exactly the failure this feature
 * cannot afford, so TraitDefinition and SpecializationSpells go in too.
 *
 * We deliberately over-include: the app only ever emits a soft "not in our data" hint,
 * so staying quiet about a real spell costs far less than telling someone their spell
 * does not exist.
 */

import {
  createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync,
  writeFileSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, '.cache');

/**
 * wago.tools product keys mapped to our flavour ids. 'wow_cn_beta' is where the
 * 1.60.1 (interface 16001) Forever build line is filed -- an odd key, but the build
 * line, vanilla spell ids and absent Skyriding all match.
 */
const PRODUCT_FLAVOUR = {
  wow: 'retail',
  wow_cn_beta: 'forever',
  wow_classic_era: 'era',
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * wago.tools intermittently 504s, so every request gets a few patient retries.
 *
 * A table that does not exist for a build answers 4xx, which is not worth retrying --
 * with `allowMissing` we return null immediately so the caller can carry on.
 */
async function fetchWithRetry(url, { attempts = 4, label = url, allowMissing = false } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (allowMissing && res.status >= 400 && res.status < 500) return null;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      const wait = attempt * 5000;
      console.log(`  ${label}: ${lastError.message}, retrying in ${wait / 1000}s (${attempt}/${attempts - 1})`);
      await sleep(wait);
    }
  }
  throw new Error(`${label}: giving up after ${attempts} attempts (${lastError.message})`);
}

async function resolveBuild(product) {
  const res = await fetchWithRetry('https://wago.tools/api/builds', { label: 'builds api' });
  const builds = await res.json();
  const list = builds[product];
  if (!list?.length) {
    const available = Object.keys(builds).join(', ');
    throw new Error(`No builds for product "${product}". Available: ${available}`);
  }
  return list[0].version;
}

/**
 * wago.tools answers a missing table with HTTP 200 and a JSON error body, so the status
 * code is not enough -- we have to look at the content. Returns null when the table does
 * not exist for this build (SpecializationSpells on the classic lines, for example).
 */
function looksLikeMissingTable(path) {
  const head = readFileSync(path, { encoding: 'utf8', flag: 'r' }).slice(0, 200);
  return head.trimStart().startsWith('{') && /"errors?"\s*:/.test(head);
}

async function fetchTable(table, build, { required = true } = {}) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const target = join(CACHE_DIR, `${table}-${build}.csv`);

  if (!existsSync(target)) {
    const url = `https://wago.tools/db2/${table}/csv?build=${build}`;
    console.log(`  ${table}: downloading ${url}`);
    const res = await fetchWithRetry(url, { label: table, allowMissing: !required });
    if (!res) {
      console.log(`  ${table}: not present for this build, skipping`);
      return null;
    }
    const partial = `${target}.partial`;
    await pipeline(Readable.fromWeb(res.body), createWriteStream(partial));
    renameSync(partial, target);
  } else {
    console.log(`  ${table}: using cached ${target}`);
  }

  if (looksLikeMissingTable(target)) {
    rmSync(target);
    if (required) throw new Error(`${table} does not exist for build ${build}`);
    console.log(`  ${table}: not present for this build, skipping`);
    return null;
  }
  return target;
}

/** Splits one CSV line, honouring quoted fields and escaped quotes. */
function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/** Streams a CSV, yielding rows as arrays plus a name->index map for the header. */
async function* readCsv(path) {
  const stream = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let columns = null;
  for await (const line of stream) {
    if (!line) continue;
    if (!columns) {
      columns = new Map(splitCsvLine(line).map((name, i) => [name, i]));
      yield { columns };
      continue;
    }
    yield { row: splitCsvLine(line) };
  }
}

function requireColumn(columns, table, ...candidates) {
  for (const name of candidates) {
    if (columns.has(name)) return columns.get(name);
  }
  throw new Error(
    `${table}: expected one of [${candidates.join(', ')}] but found [${[...columns.keys()].join(', ')}]`,
  );
}

/**
 * Tables that imply a spell is player-facing, and the columns holding a spell id.
 * Any one of them is enough to keep the spell.
 *
 * `learned` marks the tables that represent something a player actually trains or is
 * granted. When one name maps to several spell ids, those win over TraitDefinition,
 * which often points at passives and override variants rather than the castable spell.
 */
const SPELL_ID_SOURCES = [
  { table: 'SkillLineAbility', columns: ['Spell'], learned: true },
  { table: 'SpecializationSpells', columns: ['SpellID', 'OverridesSpellID'], learned: true },
  { table: 'TraitDefinition', columns: ['SpellID', 'VisibleSpellID', 'OverridesSpellID'], learned: false },
];

async function collectSpellIds(path, table, candidates, into) {
  let indexes = [];
  for await (const item of readCsv(path)) {
    if (item.columns) {
      indexes = candidates.filter((c) => item.columns.has(c)).map((c) => item.columns.get(c));
      if (!indexes.length) {
        throw new Error(
          `${table}: none of [${candidates.join(', ')}] present; found [${[...item.columns.keys()].join(', ')}]`,
        );
      }
      continue;
    }
    for (const idx of indexes) {
      const id = Number(item.row[idx]);
      if (Number.isFinite(id) && id > 0) into.add(id);
    }
  }
  return into;
}

/** spellId -> { iconFileDataId, castIndex, rangeIndex }, base difficulty only. */
async function collectSpellMisc(path, wanted) {
  const out = new Map();
  let i = {};
  for await (const item of readCsv(path)) {
    if (item.columns) {
      i = {
        spell: requireColumn(item.columns, 'SpellMisc', 'SpellID'),
        icon: requireColumn(item.columns, 'SpellMisc', 'SpellIconFileDataID'),
        cast: requireColumn(item.columns, 'SpellMisc', 'CastingTimeIndex'),
        range: requireColumn(item.columns, 'SpellMisc', 'RangeIndex'),
        difficulty: requireColumn(item.columns, 'SpellMisc', 'DifficultyID'),
      };
      continue;
    }
    // Per-difficulty rows exist; mixing them yields inconsistent icons.
    if (item.row[i.difficulty] !== '0') continue;
    const id = Number(item.row[i.spell]);
    if (!wanted.has(id) || out.has(id)) continue;
    out.set(id, {
      iconFileDataId: Number(item.row[i.icon]) || 0,
      castIndex: Number(item.row[i.cast]) || 0,
      rangeIndex: Number(item.row[i.range]) || 0,
    });
  }
  return out;
}

/** fileDataId -> icon name, e.g. 135812 -> 'spell_fire_flamebolt'. */
async function collectIconNames(path, wanted) {
  const out = new Map();
  let i = {};
  for await (const item of readCsv(path)) {
    if (item.columns) {
      i = {
        id: requireColumn(item.columns, 'ManifestInterfaceData', 'ID'),
        path: requireColumn(item.columns, 'ManifestInterfaceData', 'FilePath'),
        name: requireColumn(item.columns, 'ManifestInterfaceData', 'FileName'),
      };
      continue;
    }
    const id = Number(item.row[i.id]);
    if (!wanted.has(id)) continue;
    if (!/^interface[\\/]icons[\\/]?$/i.test(item.row[i.path].trim())) continue;
    out.set(id, item.row[i.name].replace(/\.blp$/i, '').toLowerCase());
  }
  return out;
}

/** Simple id -> number lookup for the index tables. */
async function collectLookup(path, table, valueColumn) {
  const out = new Map();
  let idIdx = -1;
  let valIdx = -1;
  for await (const item of readCsv(path)) {
    if (item.columns) {
      idIdx = requireColumn(item.columns, table, 'ID');
      valIdx = requireColumn(item.columns, table, valueColumn);
      continue;
    }
    out.set(Number(item.row[idIdx]), Number(item.row[valIdx]) || 0);
  }
  return out;
}

/** spellId -> { cooldownMs, gcdMs }, base difficulty only. */
async function collectCooldowns(path, wanted) {
  const out = new Map();
  let i = {};
  for await (const item of readCsv(path)) {
    if (item.columns) {
      i = {
        spell: requireColumn(item.columns, 'SpellCooldowns', 'SpellID'),
        recovery: requireColumn(item.columns, 'SpellCooldowns', 'RecoveryTime'),
        category: requireColumn(item.columns, 'SpellCooldowns', 'CategoryRecoveryTime'),
        start: requireColumn(item.columns, 'SpellCooldowns', 'StartRecoveryTime'),
        difficulty: requireColumn(item.columns, 'SpellCooldowns', 'DifficultyID'),
      };
      continue;
    }
    if (item.row[i.difficulty] !== '0') continue;
    const id = Number(item.row[i.spell]);
    if (!wanted.has(id) || out.has(id)) continue;
    out.set(id, {
      cooldownMs: Math.max(Number(item.row[i.recovery]) || 0, Number(item.row[i.category]) || 0),
      gcdMs: Number(item.row[i.start]) || 0,
    });
  }
  return out;
}

/** name -> every player-facing spell id carrying it. */
async function collectNamesToIds(path, wanted) {
  const out = new Map();
  let total = 0;
  let idIdx = -1;
  let nameIdx = -1;
  for await (const item of readCsv(path)) {
    if (item.columns) {
      idIdx = requireColumn(item.columns, 'SpellName', 'ID');
      nameIdx = requireColumn(item.columns, 'SpellName', 'Name_lang', 'Name');
      continue;
    }
    total++;
    const id = Number(item.row[idIdx]);
    if (!wanted.has(id)) continue;
    const name = (item.row[nameIdx] ?? '').trim();
    if (!name) continue;
    if (!out.has(name)) out.set(name, []);
    out.get(name).push(id);
  }
  return { byName: out, total };
}

async function collectNames(path, wanted) {
  const names = new Set();
  let total = 0;
  let idIdx = -1;
  let nameIdx = -1;
  for await (const item of readCsv(path)) {
    if (item.columns) {
      idIdx = requireColumn(item.columns, 'SpellName', 'ID');
      nameIdx = requireColumn(item.columns, 'SpellName', 'Name_lang', 'Name');
      continue;
    }
    total++;
    const id = Number(item.row[idIdx]);
    if (!wanted.has(id)) continue;
    const name = (item.row[nameIdx] ?? '').trim();
    if (name) names.add(name);
  }
  return { names, total };
}

async function main() {
  const product = arg('product', 'wow');
  const build = arg('build') ?? (await resolveBuild(product));
  const flavour = PRODUCT_FLAVOUR[product];
  if (!flavour) {
    throw new Error(
      `Unknown product "${product}". Known: ${Object.keys(PRODUCT_FLAVOUR).join(', ')}`,
    );
  }
  const out = arg('out', join(ROOT, 'src', 'data', `spells.${flavour}.json`));

  console.log(`Building spell data for ${product} ${build}`);

  // Which spells count as player-facing, and which are actually trained/granted.
  const wanted = new Set();
  const learned = new Set();
  for (const source of SPELL_ID_SOURCES) {
    const path = await fetchTable(source.table, build, { required: false });
    if (!path) continue;
    const ids = await collectSpellIds(path, source.table, source.columns, new Set());
    const before = wanted.size;
    for (const id of ids) {
      wanted.add(id);
      if (source.learned) learned.add(id);
    }
    console.log(`  ${source.table}: +${wanted.size - before} spell ids (${wanted.size} total)`);
  }

  const { byName, total } = await collectNamesToIds(await fetchTable('SpellName', build), wanted);
  console.log(`  SpellName: ${byName.size} distinct player-facing names from ${total} rows`);

  const misc = await collectSpellMisc(await fetchTable('SpellMisc', build), wanted);
  const iconFileIds = new Set();
  for (const entry of misc.values()) {
    if (entry.iconFileDataId) iconFileIds.add(entry.iconFileDataId);
  }
  const iconNames = await collectIconNames(
    await fetchTable('ManifestInterfaceData', build), iconFileIds,
  );
  console.log(`  SpellMisc: ${misc.size} spells, ${iconFileIds.size} distinct icon files, ${iconNames.size} named`);

  const castTimes = await collectLookup(await fetchTable('SpellCastTimes', build), 'SpellCastTimes', 'Base');
  const ranges = await collectLookup(await fetchTable('SpellRange', build), 'SpellRange', 'RangeMax_0');
  const cooldowns = await collectCooldowns(await fetchTable('SpellCooldowns', build), wanted);

  // Icon names repeat heavily across spells, so intern them into a side table.
  const icons = [];
  const iconIndex = new Map();
  const internIcon = (name) => {
    if (!name) return -1;
    if (!iconIndex.has(name)) {
      iconIndex.set(name, icons.length);
      icons.push(name);
    }
    return iconIndex.get(name);
  };

  const spells = [];
  let ambiguousNames = 0;
  let withIcon = 0;
  for (const [name, ids] of byName) {
    const candidates = [...ids].sort((a, b) => a - b);
    // Prefer a spell the player actually learns over a talent-tree reference.
    const id = candidates.find((candidate) => learned.has(candidate)) ?? candidates[0];
    const ambiguous = candidates.length > 1;
    if (ambiguous) ambiguousNames++;

    const entry = misc.get(id);
    const icon = entry ? iconNames.get(entry.iconFileDataId) ?? null : null;
    if (icon) withIcon++;
    const cooldown = cooldowns.get(id);

    spells.push([
      name,
      id,
      internIcon(icon),
      entry ? castTimes.get(entry.castIndex) ?? 0 : 0,
      entry ? ranges.get(entry.rangeIndex) ?? 0 : 0,
      cooldown ? cooldown.cooldownMs : 0,
      cooldown ? cooldown.gcdMs : 0,
      ambiguous ? 1 : 0,
    ]);
  }
  spells.sort((a, b) => a[0].localeCompare(b[0], 'en'));

  const payload = {
    build,
    product,
    flavour,
    generatedAt: new Date().toISOString(),
    source: 'https://wago.tools/db2',
    sources: SPELL_ID_SOURCES.map((entry) => entry.table),
    note:
      'Spells referenced by SkillLineAbility, SpecializationSpells or TraitDefinition. '
      + 'Deliberately over-inclusive: used only for soft hints, never hard validation. '
      + 'Columns: name, id, iconIndex (-1 = none), castMs, rangeYd, cooldownMs, gcdMs, ambiguous.',
    count: spells.length,
    icons,
    spells,
  };
  writeFileSync(out, `${JSON.stringify(payload)}\n`);

  const kb = (statSync(out).size / 1024).toFixed(0);
  console.log(`  ${total} spells scanned, ${wanted.size} player-facing ids`);
  console.log(`  ${spells.length} names, ${withIcon} with an icon, ${icons.length} distinct icons`);
  console.log(`  ${ambiguousNames} names map to more than one spell id (${(100 * ambiguousNames / spells.length).toFixed(1)}%)`);
  console.log(`  wrote ${out} (${kb} kB)`);
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  console.error(
    'If the builds API is unavailable, pass a build explicitly, e.g.\n'
    + '  node scripts/build-spell-data.mjs --build 12.1.0.69933',
  );
  process.exit(1);
});
