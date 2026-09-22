/**
 * Strips the Sitejet CMS runtime from the exported pages and wires the vanilla
 * replacement modules in.
 *
 * The script is idempotent: running it twice leaves the pages unchanged. It
 * fails loudly if any SEO tag (title, description, OpenGraph, canonical,
 * hreflang, viewport) would be lost, since preserving them is a hard
 * requirement of the migration.
 *
 * Usage: node scripts/sanitize.mjs [--check]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const CHECK_ONLY = process.argv.includes('--check');

const PAGES = globSync(['es/**/index.html', 'gd/**/index.html', 'es/index.html', 'gd/index.html']);

const STYLESHEET_TAG = '<link rel="stylesheet" type="text/css" href="/assets/css/site.css"/>';
const SCRIPT_TAG = '<script type="module" src="/assets/js/main.js"></script>';

const CONTACT_CTA = [
  '<div class="contact-cta">',
  '<p class="contact-cta-note">Escríbenos y te contestamos enseguida.</p>',
  '<a href="https://wa.me/34644750197" target="_blank" rel="noopener" class="button center color-background color-active-primary bg-active-background button-large" style="border-color: rgb(108, 65, 154);"><strong>WhatsApp</strong></a>',
  '<a href="mailto:ponteunamilnoh@gmail.com" class="button center color-background color-active-primary bg-active-background button-large" style="border-color: rgb(108, 65, 154);"><strong>ponteunamilnoh@gmail.com</strong></a>',
  '</div>'
].join('');

/** Tags whose count must never drop. */
const SEO_PATTERNS = {
  title: /<title>/g,
  description: /<meta name="description"/g,
  keywords: /<meta name="keywords"/g,
  ogTags: /<meta property="og:/g,
  canonical: /<link rel="canonical"/g,
  hreflang: /<link rel="alternate" hreflang=/g,
  viewport: /<meta name="viewport"/g,
  icons: /<link rel="(icon|apple-touch-icon-precomposed)"/g,
  edIds: /id="ed-\d+"/g
};

function countAll(html) {
  return Object.fromEntries(
    Object.entries(SEO_PATTERNS).map(([key, re]) => [key, (html.match(re) || []).length])
  );
}

/**
 * Returns the index just past the `</div>` closing the `<div` that starts at
 * `start`. Script and style bodies are skipped so their contents can never be
 * mistaken for markup.
 */
function endOfDiv(html, start) {
  let depth = 0;
  let i = start;

  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      i = html.indexOf('-->', i);
      if (i === -1) break;
      i += 3;
      continue;
    }
    if (html.startsWith('<script', i) || html.startsWith('<style', i)) {
      const tag = html.startsWith('<script', i) ? '</script>' : '</style>';
      const close = html.indexOf(tag, i);
      i = close === -1 ? html.length : close + tag.length;
      continue;
    }
    if (html.startsWith('<div', i)) {
      depth++;
      i += 4;
      continue;
    }
    if (html.startsWith('</div>', i)) {
      depth--;
      i += 6;
      if (depth === 0) return i;
      continue;
    }
    i++;
  }
  throw new Error(`Unbalanced <div> starting at ${start}`);
}

function removeDivAt(html, openIndex) {
  return html.slice(0, openIndex) + html.slice(endOfDiv(html, openIndex));
}

/** Removes the whole element that owns the given marker, walking up `levels`. */
function removeElementByMarker(html, marker, levels = 0) {
  const pos = html.indexOf(marker);
  if (pos === -1) return html;

  let open = html.lastIndexOf('<div', pos);
  for (let i = 0; i < levels; i++) open = html.lastIndexOf('<div', open - 1);
  if (open === -1) return html;

  return removeDivAt(html, open);
}

/** Modules imported by main.js, preloaded so they are fetched in parallel. */
const MODULES = ['nav', 'lazyload', 'parallax', 'slider', 'lightbox', 'maps', 'slots', 'videos', 'config'];

/**
 * Anything inside the banner is above the fold, so it must not wait for the
 * module graph to boot before its request even starts. Give those elements
 * their real source at parse time, so the browser's preload scanner picks them
 * up, and preload the hero background.
 *
 * Returns the hero image url, if there is one, so the caller can preload it.
 */
function eagerLoadBanner(html) {
  const bannerStart = html.search(/<div class="ed-element ed-container banner[^"]*"/);
  if (bannerStart === -1) return { html, hero: null };

  const bannerEnd = endOfDiv(html, bannerStart);
  const banner = html.slice(bannerStart, bannerEnd);
  let hero = null;

  let out = banner;

  // Background holders: write the real image into the inline style.
  out = out.replace(
    /<div([^>]*?)class="([^"]*?)ed-lazyload([^"]*?)"([^>]*?)data-background="url\(&quot;([^&]+)&quot;\)"([^>]*?)style="background-image: url\(&quot;[^"]*?&quot;\);"/g,
    (full, a, c1, c2, b, url, d) => {
      hero = hero || url;
      const classes = `${c1}${c2}`.replace(/\s+/g, ' ').trim();
      return `<div${a}class="${classes}"${b}data-background="url(&quot;${url}&quot;)"${d}style="background-image: url(&quot;${url}&quot;);"`;
    }
  );

  // Images: promote data-src/data-srcset to src/srcset.
  out = out.replace(/<img([^>]*?)class="([^"]*?)ed-lazyload([^"]*?)"([^>]*?)>/g, (full, a, c1, c2, b) => {
    const src = /data-src="([^"]+)"/.exec(full);
    if (!src) return full;
    const srcset = /data-srcset="([^"]+)"/.exec(full);
    const classes = `${c1}${c2}`.replace(/\s+/g, ' ').trim();

    let tag = classes ? `<img${a}class="${classes}"${b}>` : `<img${a.replace(/\s+$/, ' ')}${b.replace(/^\s+/, '')}>`;
    tag = tag.replace(/\s*src="[^"]*"/, ` src="${src[1]}"`);
    tag = srcset
      ? tag.replace(/\s*srcset="[^"]*"/, ` srcset="${srcset[1]}"`)
      : tag.replace(/\s*srcset="[^"]*"/, '');
    if (!/fetchpriority=/.test(tag)) tag = tag.replace('<img', '<img fetchpriority="high"');
    return tag;
  });

  return { html: html.slice(0, bannerStart) + out + html.slice(bannerEnd), hero };
}

/** The route directory a page lives in, used to name videos that have no data-slot. */
function routeSlug(file) {
  const segments = file.split(/[\\/]/).filter((s) => s && s !== 'index.html' && s !== 'es' && s !== 'gd');
  return segments[0] || 'video';
}

/**
 * Tags every <video> with data-video, the id assets/js/videos.js uses to look
 * up VIDEO_SOURCES. Reuses the existing data-slot when the video's poster is
 * itself an admin-managed slot; otherwise falls back to the page's route.
 */
function tagVideos(html, file) {
  return html.replace(/<video\b([^>]*)>/g, (full, attrs) => {
    if (/\bdata-video=/.test(attrs)) return full;
    const slot = /data-slot="([^"]+)"/.exec(attrs);
    const id = slot ? slot[1] : routeSlug(file);
    return `<video data-video="${id}"${attrs}>`;
  });
}

function sanitize(html, file) {
  const before = countAll(html);
  let out = html;

  // 1. Sitejet runtime configuration (also leaks the Google Maps API key).
  out = out.replace(/<script>if \(!webcard\)[\s\S]*?<\/script>/g, '');

  // 2. Proprietary bundles.
  out = out.replace(/<script src="\/webcard\/static\/app\.bundle[^"]*"><\/script>/g, '');
  out = out.replace(/<script src="\/js\/custom[^"]*"><\/script>/g, '');

  // 3. Cookiebot consent manager: no tracking is left to consent to.
  out = out.replace(/<script id="Cookiebot"[\s\S]*?<\/script>/g, '');

  // 4. External events feed: the table block and the fetch script.
  out = removeElementByMarker(out, '<div class="inner " id="dates">', 1);
  while (out.includes('admineventos.charangaponteunamilnoh.com/events.json')) {
    const next = removeElementByMarker(out, 'admineventos.charangaponteunamilnoh.com/events.json');
    if (next === out) break;
    out = next;
  }

  // 5. Dead inline script shipped by the export: it tried to hide the WhatsApp
  //    widget while the drawer is open but contains a placeholder comment where
  //    the condition should be, so it has always thrown a SyntaxError.
  out = out.replace(/<script>[\s\S]*?Lógica para verificar[\s\S]*?<\/script>/g, '');

  // 6. CMS editor hooks. They only mattered inside the Sitejet editor.
  out = out.replace(/\s+data-bind="[^"]*"/g, '');
  out = out.replace(/\s+data-reference="[^"]*"/g, '');
  out = out.replace(/\s+contenteditable="[^"]*"/g, '');

  // 7. Dead footer link: /legal-notice is the Sitejet default slug and was
  //    never exported. The page lives at /es/aviso-legal.
  out = out.replace(/href="\/legal-notice"/g, 'href="/es/aviso-legal"');

  // 8. Empty preconnect left behind by the exporter.
  out = out.replace(/<link rel="preconnect" href="" \/>/g, '');

  // 9. The PHP-backed form is replaced by direct contact actions.
  out = out.replace(/<form method="POST"[\s\S]*?<\/form>/g, CONTACT_CTA);

  // 10. Above-the-fold content must not depend on the module graph.
  const eager = eagerLoadBanner(out);
  out = eager.html;

  // 10b. Videos need an id so assets/js/videos.js can find their config entry.
  out = tagVideos(out, file);

  // 11. Wire in the replacement stylesheet and modules.
  if (!out.includes('/assets/css/site.css')) {
    out = out.replace(/(<link rel="stylesheet"[^>]*id="customcss"\/>)/, `$1${STYLESHEET_TAG}`);
  }
  if (!out.includes('/assets/js/main.js')) {
    out = out.replace('</body>', `${SCRIPT_TAG}</body>`);
  }
  if (!out.includes('rel="modulepreload"')) {
    const preloads = MODULES.map((m) => `<link rel="modulepreload" href="/assets/js/${m}.js"/>`).join('');
    out = out.replace(STYLESHEET_TAG, `${STYLESHEET_TAG}${preloads}`);
  }
  if (eager.hero && !out.includes('rel="preload" as="image"')) {
    out = out.replace(STYLESHEET_TAG, `${STYLESHEET_TAG}<link rel="preload" as="image" fetchpriority="high" href="${eager.hero}"/>`);
  }

  // 12. Guard rails.
  const after = countAll(out);
  for (const key of Object.keys(SEO_PATTERNS)) {
    if (key === 'edIds') continue;
    if (after[key] < before[key]) {
      throw new Error(`${file}: lost ${before[key] - after[key]} "${key}" tag(s)`);
    }
  }
  if (!out.includes('/assets/js/main.js')) throw new Error(`${file}: module script not injected`);
  if (!out.includes('/assets/css/site.css')) throw new Error(`${file}: stylesheet not injected`);
  if (/webcard\.|app\.bundle|Cookiebot|custom\.240322113204|Lógica para verificar/.test(out)) {
    throw new Error(`${file}: proprietary runtime reference survived`);
  }
  const untaggedVideos = (out.match(/<video\b(?![^>]*data-video=)[^>]*>/g) || []).length;
  if (untaggedVideos) throw new Error(`${file}: ${untaggedVideos} <video> element(s) missing data-video`);

  return { out, before, after };
}

let changed = 0;
for (const file of PAGES) {
  const html = readFileSync(file, 'utf8');
  const { out, before, after } = sanitize(html, file);
  const idsLost = before.edIds - after.edIds;
  if (out !== html) {
    changed++;
    if (!CHECK_ONLY) writeFileSync(file, out, 'utf8');
  }
  const delta = html.length - out.length;
  console.log(
    `${out === html ? 'unchanged' : 'cleaned  '} ${file.padEnd(42)} -${String(delta).padStart(6)} bytes, ed-ids ${after.edIds} (-${idsLost})`
  );
}
console.log(`\n${changed}/${PAGES.length} pages ${CHECK_ONLY ? 'would change' : 'rewritten'}`);
