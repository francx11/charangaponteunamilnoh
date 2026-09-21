/**
 * Replaces the jQuery "Menu V2" preset that shipped with the Sitejet runtime.
 * Keeps the exact class contract the stylesheets rely on:
 *   - `open open-menu` on <body>, `.ed-menu` and `.menu-trigger` for the drawer
 *   - `sticky` on `.menu-wrapper` plus the `--spacer-height` custom property
 *   - `active` on in-page menu links whose section is on screen
 */

const OPEN_CLASSES = ['open', 'open-menu'];

/**
 * Sitejet encodes the sticky mode in the `fill` property of the wrapper so the
 * stylesheet can drive the behaviour. Keep reading the same marker.
 */
function stickyMode(el) {
  switch (getComputedStyle(el).fill) {
    case 'rgb(255, 0, 0)': return 'banner';
    case 'rgb(0, 255, 0)': return 'menu';
    case 'rgb(0, 0, 255)': return 'instant';
    case 'rgb(255, 255, 255)': return 'reverse';
    default: return 'none';
  }
}

function setOpen(nodes, open) {
  nodes.forEach((n) => n && n.classList[open ? 'add' : 'remove'](...OPEN_CLASSES));
}

function initDrawer(wrapper) {
  const trigger = wrapper.querySelector('.menu-trigger');
  const menu = wrapper.querySelector('.ed-menu');
  if (!trigger) return;

  const nodes = [document.body, menu, trigger];
  setOpen(nodes, false);

  trigger.addEventListener('click', () => {
    setOpen(nodes, !document.body.classList.contains('open'));
  });

  // Any link inside the menu closes the drawer, like the original preset did.
  menu && menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(nodes, false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(nodes, false);
  });
}

function initSticky(wrapper) {
  const banner = document.querySelector('.banner');
  let mode = 'none';
  let triggerPos = 0;
  let offset = 0;
  let prevScroll = 0;

  wrapper.classList.remove('sticky');

  const spacer = (on) => {
    document.body.style.setProperty('--spacer-height', on ? `${wrapper.offsetHeight}px` : '');
  };

  const onScroll = () => {
    if (mode === 'none') return;
    const cur = window.scrollY;
    const reverse = mode === 'reverse';
    const stick = triggerPos <= cur && (!reverse || prevScroll > cur);
    wrapper.classList.toggle('sticky', stick);
    spacer(stick);
    prevScroll = cur;
  };

  const measure = () => {
    mode = stickyMode(wrapper);
    if (!wrapper.classList.contains('sticky')) {
      offset = wrapper.getBoundingClientRect().top + window.scrollY;
    }
    if (mode === 'banner' && !banner) mode = 'menu';
    if (mode === 'banner') {
      const rect = banner.getBoundingClientRect();
      triggerPos = rect.top + window.scrollY + rect.height;
    } else if (mode === 'menu' || mode === 'reverse') {
      triggerPos = offset + wrapper.offsetHeight;
    } else if (mode === 'instant') {
      triggerPos = offset;
    }
    onScroll();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(wrapper);
  measure();
}

function initSmoothScroll() {
  const links = document.querySelectorAll('.ed-menu a[href*="#"], .scroll a[href*="#"]');
  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      const hash = link.hash;
      if (!hash) return;

      // `#!next` scrolls to the element following the link's own block.
      const target = hash === '#!next'
        ? link.closest('.ed-element')?.nextElementSibling
        : document.getElementById(hash.slice(1));
      if (!target) return;

      // Only hijack same-page links; cross-page anchors must still navigate.
      const normalize = (p) => p.replace(/index\.html$/, '').replace(/\/+$/, '') || '/';
      const path = link.getAttribute('href').split('#')[0];
      if (path && normalize(path) !== normalize(location.pathname)) return;

      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, behavior: 'smooth' });
      history.replaceState(null, '', hash);
    });
  });
}

function initScrollSpy(wrapper) {
  const links = [...wrapper.querySelectorAll('.ed-menu a[href*="#"]')];
  const pairs = links
    .map((link) => ({ link, target: link.hash && document.getElementById(link.hash.slice(1)) }))
    .filter((p) => p.target);
  if (!pairs.length) return;

  const fallback = links.find((l) => l.classList.contains('active') && !l.classList.contains('wv-link-elm'));

  const check = () => {
    links.forEach((l) => l.classList.remove('active'));
    for (let i = pairs.length - 1; i >= 0; i--) {
      const { target, link } = pairs[i];
      const top = target.getBoundingClientRect().top + window.scrollY;
      if (window.scrollY >= top - window.innerHeight / 3 && target.offsetParent !== null) {
        link.classList.add('active');
        return;
      }
    }
    fallback && fallback.classList.add('active');
  };

  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check);
  check();
}

export default function initNav() {
  document.querySelectorAll('.menu-wrapper').forEach((wrapper) => {
    initDrawer(wrapper);
    initSticky(wrapper);
    initScrollSpy(wrapper);
  });
  initSmoothScroll();
}
