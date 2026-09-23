/**
 * Client photo manager.
 *
 * Reads the generated slot catalogue (assets/data/slots.json), shows the photo
 * currently in use for each slot and lets the client replace it. Uploads go to
 * the public Supabase bucket; the bucket's manifest.json is rewritten after
 * each change and is what the public site reads.
 */

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
const MIN_PASSWORD_LENGTH = 10;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const WEBP_QUALITY = 0.82;

// supabase-js is loaded by a classic <script> in admin/index.html from a pinned,
// vendored copy, so no third-party CDN ever runs code next to the session.
const { createClient } = window.supabase;

// Read before createClient: supabase-js consumes the fragment of a link
// coming from a password-reset email while it initialises.
const fromEmail = new URLSearchParams(window.location.hash.slice(1));
const linkError = fromEmail.get('error_code');
let recovering = fromEmail.get('type') === 'recovery';

const el = (id) => document.getElementById(id);
// Implicit flow so a reset link works on any device: the PKCE default would
// only accept it in the browser that asked for it, and the client is likely
// to request it on a computer and open the email on a phone.
const supabase = isConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: 'implicit' } })
  : null;

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

// Re-encodes any accepted image to WebP client-side so the bucket only ever
// stores one lightweight format. Falls back to the original file if the
// browser can't decode it (createImageBitmap throwing) or toBlob is
// unavailable, so an upload never hard-fails over this.
async function toWebp(file) {
  if (file.type === 'image/webp') return file;

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('toBlob returned null'))),
      'image/webp',
      WEBP_QUALITY
    );
  });

  const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
  return new File([blob], name, { type: 'image/webp' });
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
  notify(`Convirtiendo "${file.name}" a WebP…`);

  let payload = file;
  try {
    payload = await toWebp(file);
  } catch {
    // Browser couldn't re-encode it (old Safari, corrupt image…); ship the original instead.
  }

  const extension = (payload.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${UPLOAD_PREFIX}/${slot.id}.${extension}`;

  notify(`Subiendo "${file.name}"…`);

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, payload, { upsert: true, contentType: payload.type, cacheControl: '300' });
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

const VIEWS = ['login', 'forgot', 'reset', 'panel'];

function showView(name) {
  VIEWS.forEach((id) => {
    el(id).hidden = id !== name;
  });
  el('logout').hidden = name !== 'panel';
  if (name !== 'panel') el('user').textContent = '';
}

async function showPanel(session) {
  showView('panel');
  el('user').textContent = session.user.email;

  const response = await fetch('/assets/data/slots.json');
  catalogue = (await response.json()).slots;
  manifest = await readManifest();
  render();
}

function showLogin() {
  showView('login');
}

// A reset link signs the user in with a short-lived session whose only job
// here is to set a new password - don't open the panel until that's done.
function route(session) {
  if (recovering && session) {
    el('reset-username').value = session.user.email;
    showView('reset');
  } else if (session) showPanel(session);
  else showLogin();
}

async function requestReset(e) {
  e.preventDefault();
  const button = el('forgot-submit');
  button.disabled = true;
  const { error } = await supabase.auth.resetPasswordForEmail(el('forgot-email').value.trim(), {
    redirectTo: `${window.location.origin}/admin/`
  });
  button.disabled = false;

  // Same answer whether or not the address has an account, so this form
  // can't be used to find out who has access to the panel.
  if (!error) {
    notify('Si ese correo tiene acceso al panel, te llegará un enlace en unos minutos. Revisa también la carpeta de spam.');
  } else if (error.status === 429) {
    notify('Demasiados intentos seguidos. Espera unos minutos y vuelve a probarlo.', 'error');
  } else {
    notify('No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.', 'error');
  }
}

async function saveNewPassword(e) {
  e.preventDefault();
  const password = el('new-password').value;
  if (password.length < MIN_PASSWORD_LENGTH) {
    notify(`La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`, 'error');
    return;
  }
  if (password !== el('new-password-repeat').value) {
    notify('Las dos contraseñas no coinciden.', 'error');
    return;
  }

  const button = el('reset-submit');
  button.disabled = true;
  const { data, error } = await supabase.auth.updateUser({ password });
  button.disabled = false;

  if (error) {
    const reason =
      error.code === 'same_password' ? 'Tiene que ser distinta de la anterior.'
      : error.code === 'weak_password' ? 'Es demasiado fácil de adivinar; prueba con una más larga.'
      : 'El enlace puede haber caducado; pide uno nuevo.';
    notify(`No se pudo cambiar la contraseña. ${reason}`, 'error');
    return;
  }

  // Whoever else held a session (a lost phone, a leaked password) is out now.
  await supabase.auth.signOut({ scope: 'others' });
  recovering = false;
  el('reset-form').reset();
  await showPanel({ user: data.user });
  notify('Contraseña cambiada. Ya puedes usar la nueva para entrar.');
}

async function main() {
  // The CSP can't carry frame-ancestors from a <meta>, so refuse to run inside
  // a frame: nobody gets to overlay the login or the panel (clickjacking).
  if (window.top !== window.self) {
    document.body.textContent = '';
    return;
  }

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

  el('show-forgot').addEventListener('click', () => {
    notify('');
    el('forgot-email').value = el('email').value.trim();
    showView('forgot');
  });
  el('back-to-login').addEventListener('click', () => {
    notify('');
    showLogin();
  });
  el('forgot-form').addEventListener('submit', requestReset);
  el('reset-form').addEventListener('submit', saveNewPassword);

  el('logout').addEventListener('click', () => supabase.auth.signOut());
  el('search').addEventListener('input', (e) => {
    filter = e.target.value.trim().toLowerCase();
    render();
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') recovering = true;
    // updateUser fires USER_UPDATED mid-save; saveNewPassword routes itself.
    if (event === 'USER_UPDATED') return;
    notify('');
    route(session);
  });

  const { data } = await supabase.auth.getSession();

  // The client has read the fragment by now; keep tokens out of the address
  // bar and the history.
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // A reset link that didn't produce a session was rejected (tampered with,
  // or already used) even if Supabase didn't put an error in the fragment.
  if (linkError || (recovering && !data.session)) {
    recovering = false;
    showView('forgot');
    notify(
      linkError === 'otp_expired'
        ? 'El enlace ha caducado o ya se usó. Pide uno nuevo.'
        : 'El enlace no es válido. Pide uno nuevo.',
      'error'
    );
    return;
  }

  route(data.session);
}

main();
