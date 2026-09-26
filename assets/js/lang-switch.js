/**
 * Castellano / granaíno switch. It is a plain link to the same page in the
 * other variant, so it works without JavaScript; this module only lets the
 * thumb slide across before leaving, keeps the section the visitor was
 * reading (#hash), and remembers the choice for the root redirect.
 */
const STORAGE_KEY = 'variant';
const SLIDE_MS = 220;

function remember(variant) {
  try {
    localStorage.setItem(STORAGE_KEY, variant);
  } catch {
    // Private mode or blocked storage: the switch still works, it just isn't remembered.
  }
}

export default function initLangSwitch() {
  const links = document.querySelectorAll('a.lang-switch');

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      // Let the browser handle "open in new tab" and friends.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();

      remember(link.dataset.target);
      const url = link.href.split('#')[0] + window.location.hash;

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        window.location.assign(url);
        return;
      }
      link.classList.add('is-switching');
      window.setTimeout(() => window.location.assign(url), SLIDE_MS);
    });
  });

  // Coming back through the back/forward cache must not show the switch mid-slide.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) links.forEach((link) => link.classList.remove('is-switching'));
  });
}
