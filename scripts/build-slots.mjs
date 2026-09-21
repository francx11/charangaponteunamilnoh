/**
 * Builds the editable-image manifest and tags the markup with `data-slot`.
 *
 * A slot is keyed by the image file name rather than by the Sitejet asset id,
 * because the Spanish and "granaíno" trees reference the same photo under two
 * different asset ids. Keying by file name means one upload in the admin panel
 * updates both locales at once.
 *
 * Usage: node scripts/build-slots.mjs [--check]
 */

import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';

const CHECK_ONLY = process.argv.includes('--check');
const PAGES = globSync(['es/**/index.html', 'gd/**/index.html']);

/** Brand assets and UI sprites are not client-editable content. */
const EXCLUDED = /(LogoPonteUnaMilnoh|^logo\.png$|ONGRv2|OFFGRv2)/i;

const SECTIONS = {
  'index': 'Inicio',
  'galeria': 'Galería',
  'biografia': 'Biografía',
  'contacto': 'Contacto',
  'sacramentos': 'Sacramentos',
  'pasacalles': 'Pasacalles',
  'fiestas-patronales': 'Fiestas Patronales',
  'despedidas-de-solter': 'Despedidas de Solter@',
  'procesiones': 'Procesiones',
  'actuaciones-de-escenario': 'Actuaciones de escenario',
  'servicios': 'Servicios',
  'subpage': 'Subpágina',
  'aviso-legal': 'Aviso Legal',
  'politica-de-cookies': 'Política de Cookies',
  'politica-de-privacidad': 'Política de Privacidad',
  '404': 'Error 404'
};

const KIND_LABEL = { background: 'Fondo', poster: 'Portada de vídeo', image: 'Foto' };

const fileName = (path) => decodeURIComponent(path.split('/').pop());

const slugify = (name) => name
  .replace(/\.[a-z0-9]+$/i, '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase();

const toPosix = (page) => page.split(sep).join('/');
const routeOf = (page) => '/' + toPosix(page).replace(/\/index\.html$/, '');
const sectionOf = (page) => {
  const parts = toPosix(page).split('/');
  const locale = parts[0];
  const key = parts.length > 2 ? parts[1] : 'index';
  return { locale, section: SECTIONS[key] || key };
};

/** path -> smallest known variant, used for the admin preview. */
const slots = new Map();

function addSlot(page, path, kind) {
  const name = fileName(path);
  if (EXCLUDED.test(name)) return;

  const id = slugify(name);
  const { locale, section } = sectionOf(page);

  if (!slots.has(id)) {
    slots.set(id, {
      id,
      file: name,
      kind,
      section,
      label: `${section} · ${KIND_LABEL[kind]}`,
      fallback: path,
      pages: new Set(),
      locales: new Set()
    });
  }
  const slot = slots.get(id);
  slot.pages.add(routeOf(page));
  slot.locales.add(locale);
  if (kind === 'background' && slot.kind === 'image') slot.kind = 'background';
  // Prefer the Spanish tree for the label and the fallback path.
  if (locale === 'es' && !slot.esSeen) {
    slot.esSeen = true;
    slot.section = section;
    slot.label = `${section} · ${KIND_LABEL[slot.kind]}`;
    slot.fallback = path;
  }
}

for (const page of PAGES) {
  const html = readFileSync(page, 'utf8');
  for (const m of html.matchAll(/data-background="url\(&quot;(\/images\/[^&]+)&quot;\)"/g)) addSlot(page, m[1], 'background');
  for (const m of html.matchAll(/poster="(\/images\/[^"]+)"/g)) addSlot(page, m[1], 'poster');
  for (const m of html.matchAll(/data-src="(\/images\/[^"]+)"/g)) addSlot(page, m[1], 'image');
  for (const m of html.matchAll(/<img src="(\/images\/[^"]+)"/g)) addSlot(page, m[1], 'image');
}

// Number the slots inside each section so the panel reads "Galería · Foto 3".
const perSection = new Map();
const manifest = [...slots.values()]
  .sort((a, b) => a.section.localeCompare(b.section) || a.file.localeCompare(b.file))
  .map((slot) => {
    const count = (perSection.get(slot.section + slot.kind) || 0) + 1;
    perSection.set(slot.section + slot.kind, count);
    return {
      id: slot.id,
      label: `${KIND_LABEL[slot.kind]} ${count}`,
      section: slot.section,
      kind: slot.kind,
      file: slot.file,
      fallback: slot.fallback,
      pages: [...slot.pages].sort()
    };
  });

// ---- Tag the markup -------------------------------------------------------
const byFile = new Map(manifest.map((s) => [s.file, s.id]));
let touched = 0;

function tag(html) {
  let out = html;

  // <img src|data-src="...">
  out = out.replace(/<img ([^>]*?)(src|data-src)="(\/images\/[^"]+)"/g, (full, pre, attr, path) => {
    const id = byFile.get(fileName(path));
    if (!id || full.includes('data-slot=')) return full;
    return `<img data-slot="${id}" ${pre}${attr}="${path}"`;
  });

  // Background holders
  out = out.replace(/<div ([^>]*?)data-background="url\(&quot;(\/images\/[^&]+)&quot;\)"/g, (full, pre, path) => {
    const id = byFile.get(fileName(path));
    if (!id || full.includes('data-slot=')) return full;
    return `<div data-slot="${id}" ${pre}data-background="url(&quot;${path}&quot;)"`;
  });

  // <video poster="...">
  out = out.replace(/<video ([^>]*?)poster="(\/images\/[^"]+)"/g, (full, pre, path) => {
    const id = byFile.get(fileName(path));
    if (!id || full.includes('data-slot=')) return full;
    return `<video data-slot="${id}" ${pre}poster="${path}"`;
  });

  return out;
}

for (const page of PAGES) {
  const html = readFileSync(page, 'utf8');
  const out = tag(html);
  if (out === html) continue;
  touched++;
  if (!CHECK_ONLY) writeFileSync(page, out, 'utf8');
}

const json = JSON.stringify({ generatedBy: 'scripts/build-slots.mjs', slots: manifest }, null, 2) + '\n';
if (!CHECK_ONLY) writeFileSync('assets/data/slots.json', json, 'utf8');

const bySection = manifest.reduce((acc, s) => ({ ...acc, [s.section]: (acc[s.section] || 0) + 1 }), {});
console.log(`${manifest.length} slots across ${Object.keys(bySection).length} sections`);
for (const [section, count] of Object.entries(bySection)) console.log(`  ${section.padEnd(26)} ${count}`);
console.log(`${touched} page(s) ${CHECK_ONLY ? 'would be' : ''} tagged`);
