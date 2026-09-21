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

function boot() {
  initLazyload();
  initNav();
  initParallax();
  initSliders();
  initLightbox();
  initMaps();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
