/**
 * Supabase connection used by the public site (read only) and by the admin
 * panel (authenticated writes).
 *
 * Both values are safe to publish: the publishable key is a public client
 * key and the bucket policies decide what it may do. See
 * docs/supabase-setup.md.
 */
export const SUPABASE_URL = 'https://mxtjxrguvsfldjoqofuh.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Xttai6Y6FMsPRzTzoWnRHA_PX-pvIuR';

/** Public storage bucket that holds the images the client uploads. */
export const BUCKET = 'web-assets';

/** Object inside the bucket that maps slot ids to uploaded file paths. */
export const MANIFEST_OBJECT = 'manifest.json';

/** Folder inside the bucket where uploads are stored. */
export const UPLOAD_PREFIX = 'slots';

/** Folder inside the same bucket that holds the performance clips. */
export const VIDEO_PREFIX = 'videos';

export const isConfigured = () =>
  !SUPABASE_URL.includes('YOUR-PROJECT-ref') && !SUPABASE_ANON_KEY.includes('YOUR-PUBLIC');

export const publicUrl = (objectPath) =>
  `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;

/**
 * Performance clips are not in the repository (see README.md, "Performance
 * clips are not in the repository yet") - they live in the same Supabase
 * bucket as the client's photos, under videos/<id>.mp4. Each key is a video
 * id set by assets/js/videos.js via data-video. While Supabase isn't
 * configured yet, isConfigured() is false and every entry is null, so the
 * site shows a placeholder instead of a URL nobody uploaded to. Once the
 * project is set up and the six clips are uploaded (see
 * docs/supabase-setup.md), this resolves on its own - no other file needs
 * to change.
 */
const videoPath = (file) => (isConfigured() ? publicUrl(`${VIDEO_PREFIX}/${file}`) : null);

export const VIDEO_SOURCES = {
  prev1: videoPath('prev1.mp4'),
  prev2: videoPath('prev2.mp4'),
  prev3: videoPath('prev3.mp4'),
  miniaturaactuaciones: videoPath('miniaturaactuaciones.mp4'),
  pasacalles: videoPath('pasacalles.mp4'),
  sacramentos: videoPath('sacramentos.mp4')
};
