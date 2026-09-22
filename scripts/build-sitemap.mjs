/**
 * Regenerates sitemap.xml from the pages actually present in the repository.
 *
 * Usage: node scripts/build-sitemap.mjs [--check]
 */

import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sep } from 'node:path';

const ORIGIN = 'https://charangaponteunamilnoh.com';
const CHECK_ONLY = process.argv.includes('--check');

/** Pages that must stay out of the index. */
const EXCLUDED = [/\/404$/, /\/subpage$/];

const toPosix = (p) => p.split(sep).join('/');
const routeOf = (page) => '/' + toPosix(page).replace(/\/index\.html$/, '');

// The commit date, not the filesystem mtime: a fresh checkout (CI, a fresh
// clone) stamps every file with the checkout time, which would make --check
// fail on every machine but the one that generated the file.
const lastCommitDate = (page) =>
  execFileSync('git', ['log', '-1', '--format=%cs', '--', page]).toString().trim();

const pages = globSync(['es/**/index.html', 'gd/**/index.html']).sort();

const urls = pages
  .map((page) => ({ page, route: routeOf(page) }))
  .filter(({ page, route }) => {
    if (EXCLUDED.some((re) => re.test(route))) return false;
    // Respect the page's own robots directive.
    return !/<meta name="robots" content="noindex/.test(readFileSync(page, 'utf8'));
  })
  .map(({ page, route }) => ({
    loc: ORIGIN + route,
    lastmod: lastCommitDate(page),
    priority: /^\/(es|gd)$/.test(route) ? '1.00' : '0.80'
  }));

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map(({ loc, lastmod, priority }) =>
    `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority></url>`),
  '</urlset>',
  ''
].join('\n');

const current = (() => { try { return readFileSync('sitemap.xml', 'utf8'); } catch { return ''; } })();

if (!CHECK_ONLY) writeFileSync('sitemap.xml', xml, 'utf8');
console.log(`${urls.length} URLs${CHECK_ONLY ? ' (check only)' : ' written to sitemap.xml'}`);
if (CHECK_ONLY && current !== xml) {
  console.log('sitemap.xml is out of date');
  process.exit(1);
}
