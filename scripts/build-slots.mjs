/**
 * Builds the editable-image manifest and tags the page templates with
 * `data-slot`. Run build-i18n.mjs afterwards to carry the tags over to the
 * generated es/ and granaino/ trees.
 *
 * A slot is keyed by the image file name rather than by the Sitejet asset id,
 * so a photo exported under several asset ids is still a single slot. Both
 * text variants render the same template, so one upload in the admin panel
 * updates both at once.
 *
 * Usage: node scripts/build-slots.mjs [--check]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { listTemplates } from './lib/site.mjs';

const CHECK_ONLY = process.argv.includes('--check');
const TEMPLATES = listTemplates();

/** Brand assets and UI sprites are not client-editable content. */
const EXCLUDED = /(LogoPonteUnaMilnoh|^logo\.png$)/i;

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

const routesOf = (template) => template.variants.map((v) => `/${v}${template.route}`);
const sectionOf = (template) => SECTIONS[template.slug || 'index'] || template.slug;

/** path -> smallest known variant, used for the admin preview. */
const slots = new Map();

function addSlot(template, path, kind) {
  const name = fileName(path);
  if (EXCLUDED.test(name)) return;

  const id = slugify(name);
  const section = sectionOf(template);

  if (!slots.has(id)) {
    slots.set(id, {
      id,
      file: name,
      kind,
      section,
      label: `${section} · ${KIND_LABEL[kind]}`,
      fallback: path,
      pages: new Set()
    });
  }
  const slot = slots.get(id);
  for (const route of routesOf(template)) slot.pages.add(route);
  if (kind === 'background' && slot.kind === 'image') slot.kind = 'background';
}

for (const template of TEMPLATES) {
  const html = template.body;
  for (const m of html.matchAll(/data-background="url\(&quot;(\/images\/[^&]+)&quot;\)"/g)) addSlot(template, m[1], 'background');
  for (const m of html.matchAll(/poster="(\/images\/[^"]+)"/g)) addSlot(template, m[1], 'poster');
  for (const m of html.matchAll(/data-src="(\/images\/[^"]+)"/g)) addSlot(template, m[1], 'image');
  // `src` may follow a data-slot added by a previous run.
  for (const m of html.matchAll(/<img [^>]*?(?<![-\w])src="(\/images\/[^"]+)"/g)) addSlot(template, m[1], 'image');
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

for (const { file } of TEMPLATES) {
  const html = readFileSync(file, 'utf8');
  const out = tag(html);
  if (out === html) continue;
  touched++;
  if (!CHECK_ONLY) writeFileSync(file, out, 'utf8');
}

const json = JSON.stringify({ generatedBy: 'scripts/build-slots.mjs', slots: manifest }, null, 2) + '\n';
const current = (() => { try { return readFileSync('assets/data/slots.json', 'utf8'); } catch { return ''; } })();
if (!CHECK_ONLY) writeFileSync('assets/data/slots.json', json, 'utf8');

const bySection = manifest.reduce((acc, s) => ({ ...acc, [s.section]: (acc[s.section] || 0) + 1 }), {});
console.log(`${manifest.length} slots across ${Object.keys(bySection).length} sections`);
for (const [section, count] of Object.entries(bySection)) console.log(`  ${section.padEnd(26)} ${count}`);
console.log(`${touched} page(s) ${CHECK_ONLY ? 'would be' : ''} tagged`);
if (CHECK_ONLY && (touched || current !== json)) {
  console.log('templates or assets/data/slots.json are out of date');
  process.exit(1);
}
