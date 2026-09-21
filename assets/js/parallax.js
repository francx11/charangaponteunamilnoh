/**
 * Replaces the parallax of the Sitejet bundle for fixed background holders.
 *
 * Measured against the original runtime: the holder keeps
 * `background-attachment: fixed` from the stylesheet and the vertical
 * background position tracks the holder's viewport offset by a factor of
 * (100 - data-parallax-amount) / 100 — e.g. amount 85 gives 0.15. Updates stop
 * while the holder is off screen, exactly like the original.
 */

const DEFAULT_AMOUNT = 85;

function amountFor(holder) {
  const container = holder.closest('.ed-container');
  const inner = container && container.querySelector(':scope > .inner[data-parallax-amount]');
  const raw = inner ? parseFloat(inner.dataset.parallaxAmount) : NaN;
  return Number.isFinite(raw) ? raw : DEFAULT_AMOUNT;
}

export default function initParallax() {
  const holders = [...document.querySelectorAll('.wv-bg-fixed')];
  if (!holders.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const items = holders.map((el) => ({ el, factor: (100 - amountFor(el)) / 100 }));
  let ticking = false;

  const update = () => {
    ticking = false;
    items.forEach(({ el, factor }) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      el.style.backgroundPosition = `50% ${(rect.top * factor).toFixed(1)}px`;
    });
  };

  const request = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  update();
}
