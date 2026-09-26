/**
 * Entry point for the static site. Replaces webcard/static/app.bundle.js and
 * js/custom.js (jQuery + slick + Sitejet runtime) with focused vanilla modules.
 */
import initNav from './nav.js';
import initLazyload from './lazyload.js';
import initParallax from './parallax.js';
import initSliders from './slider.js';
import initLightbox from './lightbox.js';
import initMaps from './maps.js';
import initSlots from './slots.js';
import initVideos from './videos.js';
import initLangSwitch from './lang-switch.js';

function boot() {
  // Slot overrides run first so the lazy loader picks up the replaced sources.
  initSlots().finally(() => initLazyload());
  initNav();
  initParallax();
  initSliders();
  initLightbox();
  initMaps();
  initVideos();
  initLangSwitch();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
