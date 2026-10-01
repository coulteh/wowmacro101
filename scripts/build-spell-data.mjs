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

import { createReadStream, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, '.cache');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** wago.tools intermittently 504s, so every request gets a few patient retries. */
async function fetchWithRetry(url, { attempts = 4, label = url } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
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

async function fetchTable(table, build) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const target = join(CACHE_DIR, `${table}-${build}.csv`);
  if (existsSync(target)) {
    console.log(`  ${table}: using cached ${target}`);
    return target;
  }
  const url = `https://wago.tools/db2/${table}/csv?build=${build}`;
  console.log(`  ${table}: downloading ${url}`);
  const res = await fetchWithRetry(url, { label: table });
  const partial = `${target}.partial`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(partial));
  renameSync(partial, target);
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
 */
const SPELL_ID_SOURCES = [
  { table: 'SkillLineAbility', columns: ['Spell'] },
  { table: 'SpecializationSpells', columns: ['SpellID', 'OverridesSpellID'] },
  { table: 'TraitDefinition', columns: ['SpellID', 'VisibleSpellID', 'OverridesSpellID'] },
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
  const out = arg('out', join(ROOT, 'src', 'data', `spells.${product === 'wow' ? 'retail' : product}.json`));

  console.log(`Building spell data for ${product} ${build}`);

  const wanted = new Set();
  for (const { table, columns } of SPELL_ID_SOURCES) {
    const path = await fetchTable(table, build);
    const before = wanted.size;
    await collectSpellIds(path, table, columns, wanted);
    console.log(`  ${table}: +${wanted.size - before} spell ids (${wanted.size} total)`);
  }

  const nameCsv = await fetchTable('SpellName', build);
  console.log('  joining…');
  const { names, total } = await collectNames(nameCsv, wanted);

  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'en'));
  const payload = {
    build,
    product,
    generatedAt: new Date().toISOString(),
    source: 'https://wago.tools/db2',
    sources: SPELL_ID_SOURCES.map((s) => s.table),
    note:
      'Spells referenced by SkillLineAbility, SpecializationSpells or TraitDefinition. '
      + 'Deliberately over-inclusive: used only for soft hints, never hard validation.',
    count: sorted.length,
    names: sorted,
  };
  writeFileSync(out, `${JSON.stringify(payload, null, 0)}\n`);

  console.log(`  ${total} spells scanned, ${wanted.size} player-facing ids, ${sorted.length} distinct names`);
  console.log(`  wrote ${out}`);
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  console.error(
    'If the builds API is unavailable, pass a build explicitly, e.g.\n'
    + '  node scripts/build-spell-data.mjs --build 12.1.0.69933',
  );
  process.exit(1);
});
