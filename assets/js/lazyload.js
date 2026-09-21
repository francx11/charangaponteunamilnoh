/**
 * Replaces the Sitejet lazy loader. The markup is untouched:
 *   <img class="ed-lazyload" data-src data-srcset>
 *   <div class="ed-lazyload background-image-holder" data-background='url("...")'>
 *
 * Removing the `ed-lazyload` class after loading is required, not cosmetic: the
 * per-page stylesheets carry rules like
 *   #ed-x > .background-image-holder:not(.ed-lazyload) { background-image: ... }
 * that only apply once the class is gone.
 */

function reveal(el) {
  if (el.tagName === 'IMG') {
    if (el.dataset.srcset) el.srcset = el.dataset.srcset;
    if (el.dataset.src) el.src = el.dataset.src;
  } else if (el.dataset.background) {
    el.style.backgroundImage = el.dataset.background;
  }
  el.classList.remove('ed-lazyload');
}

export default function initLazyload() {
  const targets = document.querySelectorAll('.ed-lazyload');
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    targets.forEach(reveal);
    return;
  }

  const io = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      reveal(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '300px 0px' });

  targets.forEach((el) => io.observe(el));
}
