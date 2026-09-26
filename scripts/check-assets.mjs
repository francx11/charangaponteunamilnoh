/**
 * Resolves every local reference of every page against the file system and
 * reports what is missing. Run it after any change to the markup or assets:
 *   node scripts/check-assets.mjs
 */

import { readFileSync, existsSync, globSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = globSync(['es/**/index.html', 'granaino/**/index.html', 'gd/**/index.html', 'index.html', '404.html']);

const ASSET_PATTERNS = [
  /(?:src|href)="(\/[^"#?]+)"/g,
  /data-src="(\/[^"#?]+)"/g,
  /data-background="url\(&quot;(\/[^&]+)&quot;\)"/g,
  /url\((?:&quot;|")?(\/[^)&"']+)(?:&quot;|")?\)/g
];

const SRCSET_PATTERNS = [/srcset="([^"]+)"/g, /data-srcset="([^"]+)"/g];

const IGNORED = /^(https?:|mailto:|tel:|data:|#|\/\/)/;

// Performance clips: hosting is undecided, so the files are gitignored and
// never reach a fresh checkout. Skip them here instead of failing CI; drop
// each entry once it is served from wherever the video ends up living.
const PENDING_EXTERNAL = new Set([
  '/images/0/7825298/copy-bc98406d-fe84-4688-ab98-923e70bd66a1-video-convertercom_S4rOEk8N.mp4',
  '/images/0/7825329/Snapinsta.app_video_EE4B8691C48E558353507F5DAFE785A2_video_dashinit.mp4',
  '/images/0/7825338/snapinstaapp-video-fb40bfcd55fa7ba4acac90aab917a2a5-video-dashinit_KcmKsqsD.mp4',
  '/images/0/7848177/IMG_82471.mp4',
  '/images/0/7848240/VideoPasacallesTemerario.mp4',
  '/images/0/7909284/ActuacinPadul.mp4'
]);

const missing = new Map();
let checked = 0;
let pending = 0;

function record(page, ref) {
  if (!missing.has(ref)) missing.set(ref, new Set());
  missing.get(ref).add(page);
}

function verify(page, ref) {
  // Only site-absolute paths are checkable; data: URIs split out of a srcset
  // list are not references.
  if (!ref || !ref.startsWith('/') || IGNORED.test(ref)) return;
  const clean = decodeURI(ref.split('?')[0].split('#')[0]);
  if (PENDING_EXTERNAL.has(clean)) {
    pending++;
    return;
  }
  const local = clean.replace(/^\//, '');
  checked++;

  if (existsSync(local)) return;
  // Routes are directories served with an index.html.
  if (existsSync(join(local, 'index.html'))) return;
  record(page, ref);
}

for (const page of PAGES) {
  const html = readFileSync(page, 'utf8');

  for (const pattern of ASSET_PATTERNS) {
    for (const match of html.matchAll(pattern)) verify(page, match[1]);
  }
  for (const pattern of SRCSET_PATTERNS) {
    for (const match of html.matchAll(pattern)) {
      match[1].split(',').forEach((candidate) => verify(page, candidate.trim().split(/\s+/)[0]));
    }
  }
  // JSON payloads of galleries and sliders
  for (const match of html.matchAll(/&quot;image&quot;:&quot;(\/[^&]+)&quot;/g)) verify(page, match[1]);
}

// The stylesheets reference their own assets relatively to the site root.
for (const css of ['css/custom.240310232058.css', 'webcard/static/app.min.1714740336.css', 'assets/css/site.css', 'g/fonts.css']) {
  const text = readFileSync(css, 'utf8');
  for (const match of text.matchAll(/url\(["']?(\/[^)"']+)["']?\)/g)) verify(css, match[1]);
}

console.log(`checked ${checked} references across ${PAGES.length} pages`);
if (pending) console.log(`skipped ${pending} pending-hosting video reference(s)`);
if (!missing.size) {
  console.log('OK - no missing local assets');
  process.exit(0);
}

console.log(`MISSING ${missing.size} reference(s):`);
for (const [ref, pages] of missing) {
  console.log(`  ${ref}  <- ${[...pages].slice(0, 3).join(', ')}${pages.size > 3 ? ` (+${pages.size - 3})` : ''}`);
}
process.exit(1);
