/**
 * Replaces the Google Maps JavaScript API block of the Sitejet bundle.
 *
 * The coordinates already live in the `data-parameters` JSON of `.map-canvas`,
 * so no API key is needed: we embed the keyless Maps iframe instead, and only
 * once the map scrolls into view.
 */

function parameters(el) {
  try {
    return JSON.parse(el.dataset.parameters || '{}');
  } catch {
    return {};
  }
}

function embedUrl(params) {
  const marker = (params.markers && params.markers[0]) || null;
  const center = params.center || marker;
  if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') return null;

  const query = marker && typeof marker.lat === 'number'
    ? `${marker.lat},${marker.lng}`
    : `${center.lat},${center.lng}`;
  const zoom = Number.isFinite(params.zoom) ? params.zoom : 13;

  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&hl=es&output=embed`;
}

function mount(canvas) {
  const params = parameters(canvas);
  const url = embedUrl(params);
  if (!url) return;

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.loading = 'lazy';
  iframe.title = (params.markers && params.markers[0] && params.markers[0].title) || 'Mapa';
  iframe.referrerPolicy = 'no-referrer-when-downgrade';
  iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;';
  iframe.setAttribute('allowfullscreen', '');

  canvas.textContent = '';
  canvas.appendChild(iframe);
}

export default function initMaps() {
  const canvases = document.querySelectorAll('.map-canvas[data-parameters]');
  if (!canvases.length) return;

  if (!('IntersectionObserver' in window)) {
    canvases.forEach(mount);
    return;
  }

  const io = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      mount(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '200px 0px' });

  canvases.forEach((c) => io.observe(c));
}
