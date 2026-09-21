/**
 * Replaces slick for the `.ed-slider` blocks.
 *
 * The exported markup ships an empty `.slider-container` that carries the slide
 * list inside its `data-parameters` JSON, so slick built the DOM at runtime. We
 * rebuild the same slick-shaped DOM (slick-list > slick-track > slick-slide,
 * plus arrows and dots) because app.min.css already styles those class names.
 */

function parseParameters(el) {
  try {
    return JSON.parse(el.dataset.parameters || '{}');
  } catch {
    return {};
  }
}

function toMs(value, fallback) {
  if (typeof value === 'number') return value;
  const m = /^([\d.]+)\s*(ms|s)?$/.exec(String(value || '').trim());
  if (!m) return fallback;
  return m[2] === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
}

function build(container, params) {
  const items = Array.isArray(params.items) ? params.items : [];
  if (!items.length) return null;

  const list = document.createElement('div');
  list.className = 'slick-list draggable';
  const track = document.createElement('div');
  track.className = 'slick-track';
  track.style.display = 'flex';
  track.style.transition = `transform ${toMs(params.animationSpeed, 800)}ms ease`;

  items.forEach((item, i) => {
    const slide = document.createElement('div');
    slide.className = 'slick-slide' + (i === 0 ? ' slick-current slick-active' : '');
    slide.style.flex = '0 0 100%';
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = item.title || '';
    img.loading = i === 0 ? 'eager' : 'lazy';
    img.style.width = '100%';
    if (item.link) {
      const a = document.createElement('a');
      a.href = item.link;
      a.appendChild(img);
      slide.appendChild(a);
    } else {
      slide.appendChild(img);
    }
    track.appendChild(slide);
  });

  list.appendChild(track);
  container.appendChild(list);
  return { list, track, slides: [...track.children] };
}

function addControls(container, params, count, step, goTo) {
  if (params.nav !== false && count > 1) {
    ['prev', 'next'].forEach((dir) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `slick-${dir} slick-arrow`;
      btn.setAttribute('aria-label', dir === 'prev' ? 'Anterior' : 'Siguiente');
      btn.addEventListener('click', () => step(dir === 'prev' ? -1 : 1));
      container.appendChild(btn);
    });
  }

  if (!params.dots || count <= 1) return null;
  const dots = document.createElement('ul');
  dots.className = 'slick-dots';
  for (let i = 0; i < count; i++) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(i + 1);
    btn.addEventListener('click', () => goTo(i));
    li.appendChild(btn);
    dots.appendChild(li);
  }
  container.appendChild(dots);
  return dots;
}

function initSlider(container) {
  const params = parseParameters(container);
  const built = build(container, params);
  if (!built) return;

  const { track, slides } = built;
  const count = slides.length;
  let index = 0;
  let timer = null;

  const render = () => {
    track.style.transform = `translate3d(-${index * 100}%, 0, 0)`;
    slides.forEach((s, i) => s.classList.toggle('slick-current', i === index));
    slides.forEach((s, i) => s.classList.toggle('slick-active', i === index));
    if (dots) [...dots.children].forEach((li, i) => li.classList.toggle('slick-active', i === index));
  };

  const goTo = (target) => {
    index = params.loop === false
      ? Math.max(0, Math.min(count - 1, target))
      : (target % count + count) % count;
    render();
    restart();
  };
  const step = (delta) => goTo(index + delta);

  const dots = addControls(container, params, count, step, goTo);

  const speed = toMs(params.autoplaySpeed, 5000);
  const start = () => {
    if (!params.autoplay || count < 2) return;
    timer = window.setInterval(() => {
      index = params.loop === false ? Math.min(count - 1, index + 1) : (index + 1) % count;
      render();
    }, speed);
  };
  const stop = () => { if (timer) window.clearInterval(timer); timer = null; };
  const restart = () => { stop(); start(); };

  if (params.pauseOnHover !== false) {
    container.addEventListener('mouseenter', stop);
    container.addEventListener('mouseleave', start);
  }

  // Touch swipe
  let startX = null;
  container.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  container.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) step(dx > 0 ? -1 : 1);
    startX = null;
  });

  container.classList.add('slick-initialized', 'slick-slider');
  render();
  start();
}

export default function initSliders() {
  document.querySelectorAll('.ed-slider .slider-container[data-parameters]').forEach(initSlider);
}
