/**
 * Client photo manager.
 *
 * Reads the generated slot catalogue (assets/data/slots.json), shows the photo
 * currently in use for each slot and lets the client replace it. Uploads go to
 * the public Supabase bucket; the bucket's manifest.json is rewritten after
 * each change and is what the public site reads.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  BUCKET,
  MANIFEST_OBJECT,
  UPLOAD_PREFIX,
  isConfigured,
  publicUrl
} from './config.js';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

const el = (id) => document.getElementById(id);
const supabase = isConfigured() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let catalogue = [];
let manifest = { slots: {} };
let filter = '';

function notify(message, kind = 'ok') {
  const box = el('notice');
  box.textContent = message;
  box.className = `notice ${kind}`;
  box.hidden = !message;
}

function currentUrl(slot) {
  const entry = manifest.slots[slot.id];
  if (!entry || !entry.path) return slot.fallback;
  return `${publicUrl(entry.path)}?v=${encodeURIComponent(entry.updatedAt || '')}`;
}

function matchesFilter(slot) {
  if (!filter) return true;
  const haystack = `${slot.section} ${slot.label} ${slot.file} ${slot.pages.join(' ')}`.toLowerCase();
  return haystack.includes(filter);
}

function render() {
  const container = el('sections');
  container.textContent = '';

  const bySection = new Map();
  catalogue.filter(matchesFilter).forEach((slot) => {
    if (!bySection.has(slot.section)) bySection.set(slot.section, []);
    bySection.get(slot.section).push(slot);
  });

  if (!bySection.size) {
    const empty = document.createElement('p');
    empty.className = 'notice';
    empty.textContent = 'No hay fotos que coincidan con la búsqueda.';
    container.appendChild(empty);
    return;
  }

  for (const [section, slots] of bySection) {
    const wrapper = document.createElement('section');
    wrapper.className = 'section';

    const heading = document.createElement('h2');
    heading.textContent = section;
    wrapper.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'grid';
    slots.forEach((slot) => grid.appendChild(renderSlot(slot)));
    wrapper.appendChild(grid);
    container.appendChild(wrapper);
  }
}

function renderSlot(slot) {
  const custom = Boolean(manifest.slots[slot.id]);
  const card = document.createElement('article');
  card.className = 'slot';
  card.dataset.slot = slot.id;

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  thumb.style.backgroundImage = `url("${currentUrl(slot)}")`;

  const badge = document.createElement('span');
  badge.className = custom ? 'badge custom' : 'badge';
  badge.textContent = custom ? 'Foto cambiada' : 'Foto original';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const title = document.createElement('strong');
  title.textContent = slot.label;
  const pages = document.createElement('span');
  pages.textContent = slot.pages.join(' · ');
  meta.append(title, pages);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = ACCEPTED.join(',');
  picker.hidden = true;
  picker.addEventListener('change', () => {
    if (picker.files[0]) upload(slot, picker.files[0], card);
    picker.value = '';
  });

  const replace = document.createElement('button');
  replace.className = 'button';
  replace.type = 'button';
  replace.textContent = 'Cambiar foto';
  replace.addEventListener('click', () => picker.click());
  actions.append(replace, picker);

  if (custom) {
    const reset = document.createElement('button');
    reset.className = 'link';
    reset.type = 'button';
    reset.textContent = 'Volver a la original';
    reset.addEventListener('click', () => restore(slot, card));
    actions.appendChild(reset);
  }

  card.append(thumb, badge, meta, actions);

  // Drag and drop anywhere on the card.
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    card.classList.add('dragover');
  });
  card.addEventListener('dragleave', () => card.classList.remove('dragover'));
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('dragover');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) upload(slot, file, card);
  });

  return card;
}

async function readManifest() {
  const { data, error } = await supabase.storage.from(BUCKET).download(MANIFEST_OBJECT);
  if (error) return { slots: {} }; // First run: the manifest does not exist yet.
  try {
    const parsed = JSON.parse(await data.text());
    return parsed && parsed.slots ? parsed : { slots: {} };
  } catch {
    return { slots: {} };
  }
}

async function writeManifest() {
  const body = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(MANIFEST_OBJECT, body, { upsert: true, contentType: 'application/json', cacheControl: '60' });
  if (error) throw error;
}

async function upload(slot, file, card) {
  if (!ACCEPTED.includes(file.type)) {
    notify(`"${file.name}" no es una imagen válida. Usa JPG, PNG, WebP o AVIF.`, 'error');
    return;
  }
  if (file.size > MAX_BYTES) {
    notify(`"${file.name}" pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo son 8 MB.`, 'error');
    return;
  }

  card.classList.add('busy');
  notify(`Subiendo "${file.name}"…`);

  const extension = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${UPLOAD_PREFIX}/${slot.id}.${extension}`;

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '300' });
    if (error) throw error;

    // A slot can change extension; drop the previous object so nothing is orphaned.
    const previous = manifest.slots[slot.id];
    if (previous && previous.path && previous.path !== path) {
      await supabase.storage.from(BUCKET).remove([previous.path]);
    }

    manifest.slots[slot.id] = { path, updatedAt: new Date().toISOString() };
    await writeManifest();
    notify(`Foto actualizada: ${slot.section} · ${slot.label}. Puede tardar unos minutos en verse en la web.`);
    render();
  } catch (error) {
    notify(`No se pudo subir la foto: ${error.message || error}`, 'error');
  } finally {
    card.classList.remove('busy');
  }
}

async function restore(slot, card) {
  card.classList.add('busy');
  try {
    const entry = manifest.slots[slot.id];
    if (entry && entry.path) await supabase.storage.from(BUCKET).remove([entry.path]);
    delete manifest.slots[slot.id];
    await writeManifest();
    notify(`Restaurada la foto original de ${slot.section} · ${slot.label}.`);
    render();
  } catch (error) {
    notify(`No se pudo restaurar: ${error.message || error}`, 'error');
  } finally {
    card.classList.remove('busy');
  }
}

async function showPanel(session) {
  el('login').hidden = true;
  el('panel').hidden = false;
  el('user').textContent = session.user.email;

  const response = await fetch('/assets/data/slots.json');
  catalogue = (await response.json()).slots;
  manifest = await readManifest();
  render();
}

function showLogin() {
  el('panel').hidden = true;
  el('login').hidden = false;
}

async function main() {
  if (!supabase) {
    notify('Supabase todavía no está configurado. Añade la URL y la clave anónima en assets/js/config.js.', 'error');
    el('login').hidden = true;
    return;
  }

  el('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = el('login-submit');
    button.disabled = true;
    const { error } = await supabase.auth.signInWithPassword({
      email: el('email').value.trim(),
      password: el('password').value
    });
    button.disabled = false;
    if (error) notify('Email o contraseña incorrectos.', 'error');
  });

  el('logout').addEventListener('click', () => supabase.auth.signOut());
  el('search').addEventListener('input', (e) => {
    filter = e.target.value.trim().toLowerCase();
    render();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    notify('');
    if (session) showPanel(session);
    else showLogin();
  });

  const { data } = await supabase.auth.getSession();
  if (data.session) showPanel(data.session);
  else showLogin();
}

main();
