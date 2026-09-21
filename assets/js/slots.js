/**
 * Applies the client's photo replacements on top of the exported markup.
 *
 * Every editable element carries `data-slot="<id>"` and keeps its original
 * local image as the attribute value, so the page renders correctly with no
 * network access, with Supabase down, or before anything has been uploaded.
 * Only slots present in the bucket manifest are swapped.
 */

import { MANIFEST_OBJECT, isConfigured, publicUrl } from './config.js';

const MANIFEST_TTL_SECONDS = 300;
const MANIFEST_TIMEOUT_MS = 2500;

async function loadManifest() {
  // Bucketed cache buster: at most one fetch per TTL window per visitor.
  const bucketed = Math.floor(Date.now() / (MANIFEST_TTL_SECONDS * 1000));
  // A slow bucket must never hold back the lazy loader.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${publicUrl(MANIFEST_OBJECT)}?v=${bucketed}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function apply(el, url) {
  if (el.tagName === 'IMG') {
    // A surviving srcset would win over the new src.
    el.removeAttribute('srcset');
    el.removeAttribute('data-srcset');
    el.removeAttribute('sizes');
    el.dataset.src = url;
    if (!el.classList.contains('ed-lazyload')) el.src = url;
    return;
  }

  if (el.tagName === 'VIDEO') {
    el.poster = url;
    return;
  }

  if (el.dataset.background !== undefined) {
    el.dataset.background = `url("${url}")`;
    if (!el.classList.contains('ed-lazyload')) el.style.backgroundImage = `url("${url}")`;
  }
}

export default async function initSlots() {
  const targets = document.querySelectorAll('[data-slot]');
  if (!targets.length || !isConfigured()) return;

  let manifest;
  try {
    manifest = await loadManifest();
  } catch {
    return; // Nothing uploaded yet, or Storage unreachable: keep the local images.
  }

  const overrides = manifest && manifest.slots ? manifest.slots : {};
  targets.forEach((el) => {
    const entry = overrides[el.dataset.slot];
    if (!entry || !entry.path) return;
    apply(el, publicUrl(entry.path));
  });
}
