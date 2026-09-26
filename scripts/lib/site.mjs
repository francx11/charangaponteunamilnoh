/**
 * Shared knowledge about the page templates and their text variants, used by
 * build-i18n.mjs (renders them) and the scripts that edit the templates.
 *
 * Both variants are Spanish: "granaino" is the same site written in Granada
 * slang, not a separate language, so every page is served with lang="es".
 */

import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';

/** Output directory per variant. The first one is the default. */
export const VARIANTS = ['es', 'granaino'];
export const DEFAULT_VARIANT = VARIANTS[0];

/** Old URL prefixes that now redirect to a variant. */
export const LEGACY_PREFIXES = { gd: 'granaino' };

export const TEMPLATE_GLOB = 'src/pages/**/index.html';
export const TRANSLATIONS = 'i18n/translations.csv';

const toPosix = (p) => p.split(sep).join('/');

/**
 * A template may start with `<!-- variants: es -->` to be rendered for a
 * subset of the variants; without it, it is rendered for all of them.
 */
const FRONT_MATTER = /^<!-- variants: ([a-z, ]+) -->\n/;

export function listTemplates() {
  return globSync(TEMPLATE_GLOB).sort().map((file) => {
    const raw = readFileSync(file, 'utf8');
    const slug = toPosix(file).replace(/^src\/pages\/?/, '').replace(/\/?index\.html$/, '');
    const match = FRONT_MATTER.exec(raw);
    const variants = match ? match[1].split(',').map((v) => v.trim()) : VARIANTS;
    for (const v of variants) {
      if (!VARIANTS.includes(v)) throw new Error(`${file}: unknown variant "${v}"`);
    }
    return {
      file: toPosix(file),
      slug,
      route: slug ? `/${slug}` : '',
      variants,
      body: match ? raw.slice(match[0].length) : raw
    };
  });
}

export const outputPath = (prefix, slug) => (slug ? `${prefix}/${slug}/index.html` : `${prefix}/index.html`);

/**
 * RFC 4180 CSV. Also accepts what a Spanish-locale Excel saves: a UTF-8 BOM,
 * CRLF line endings and `;` as the separator.
 */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else {
      cell += c;
    }
  }
  if (quoted) throw new Error('CSV: unterminated quoted cell');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** key -> { es, granaino } */
export function readTranslations(path = TRANSLATIONS) {
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8'));
  const columns = header.map((h) => h.trim());
  if (columns[0] !== 'key') throw new Error(`${path}: first column must be "key"`);
  for (const v of VARIANTS) {
    if (!columns.includes(v)) throw new Error(`${path}: missing "${v}" column`);
  }

  const strings = new Map();
  rows.forEach((cells, n) => {
    const key = cells[0].trim();
    if (strings.has(key)) throw new Error(`${path}:${n + 2}: duplicate key "${key}"`);
    strings.set(key, Object.fromEntries(VARIANTS.map((v) => [v, cells[columns.indexOf(v)] ?? ''])));
  });
  return strings;
}
