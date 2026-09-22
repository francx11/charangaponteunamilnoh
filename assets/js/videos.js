/**
 * Performance clips ship outside the repository until hosting is decided
 * (see VIDEO_SOURCES in config.js). Every <video data-video="id"> either
 * gets its real source wired in, or is swapped for a static placeholder so a
 * broken player never reaches a visitor.
 */
import { VIDEO_SOURCES } from './config.js';

const LABEL = 'Vídeo próximamente';
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';

function placeholderFor(video) {
  const box = document.createElement('div');
  box.className = video.className ? `video-placeholder ${video.className}` : 'video-placeholder';

  const style = video.getAttribute('style');
  if (style) box.setAttribute('style', style);

  const width = video.getAttribute('width');
  if (width) box.style.width = width.includes('%') ? width : `${width}px`;

  const poster = video.getAttribute('poster');
  if (poster) {
    box.classList.add('has-poster');
    box.style.backgroundImage = `url("${poster}")`;
  }

  box.innerHTML = `${PLAY_ICON}<span>${LABEL}</span>`;
  return box;
}

export default function initVideos() {
  document.querySelectorAll('video[data-video]').forEach((video) => {
    const url = VIDEO_SOURCES[video.dataset.video];

    if (url) {
      const source = video.querySelector('source') || video.appendChild(document.createElement('source'));
      source.setAttribute('type', 'video/mp4');
      source.setAttribute('src', url);
      video.load();
      return;
    }

    video.replaceWith(placeholderFor(video));
  });
}
