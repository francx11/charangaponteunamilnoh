/**
 * Replaces the gallery lightbox of the Sitejet bundle.
 *
 * Gallery markup is left untouched: each `.ed-gallery-thumb > a` points at the
 * full size image and opens in a new tab without JavaScript, which stays the
 * fallback when the dialog element is unsupported.
 */

let dialog = null;
let items = [];
let current = 0;

function ensureDialog() {
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.className = 'vanilla-lightbox';
  dialog.innerHTML = `
    <button type="button" class="vl-close" aria-label="Cerrar">&times;</button>
    <button type="button" class="vl-prev" aria-label="Anterior">&#10094;</button>
    <figure class="vl-figure"><img alt=""><figcaption></figcaption></figure>
    <button type="button" class="vl-next" aria-label="Siguiente">&#10095;</button>
  `;
  document.body.appendChild(dialog);

  dialog.querySelector('.vl-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.vl-prev').addEventListener('click', () => show(current - 1));
  dialog.querySelector('.vl-next').addEventListener('click', () => show(current + 1));
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  document.addEventListener('keydown', (e) => {
    if (!dialog.open) return;
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });

  return dialog;
}

function show(index) {
  if (!items.length) return;
  current = (index % items.length + items.length) % items.length;
  const item = items[current];
  const img = dialog.querySelector('.vl-figure img');
  img.src = item.href;
  img.alt = item.title || '';
  const caption = dialog.querySelector('figcaption');
  caption.textContent = item.title && item.title !== 'Caption' ? item.title : '';
  caption.hidden = !caption.textContent;
}

export default function initLightbox() {
  const galleries = document.querySelectorAll('.ed-gallery');
  if (!galleries.length || typeof HTMLDialogElement === 'undefined') return;

  galleries.forEach((gallery) => {
    const links = [...gallery.querySelectorAll('.ed-gallery-thumb a[href]')];
    if (!links.length) return;

    links.forEach((link, i) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        ensureDialog();
        items = links.map((l) => ({ href: l.getAttribute('href'), title: l.getAttribute('title') }));
        show(i);
        dialog.showModal();
      });
    });
  });
}
