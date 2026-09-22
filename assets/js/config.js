/**
 * Supabase connection used by the public site (read only) and by the admin
 * panel (authenticated writes).
 *
 * Both values are safe to publish: the anon key is a public client key and the
 * bucket policies decide what it may do. See docs/supabase-setup.md.
 *
 * Replace the two placeholders with the values from
 * Supabase dashboard -> Project settings -> API.
 */
export const SUPABASE_URL = 'https://YOUR-PROJECT-ref.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-PUBLIC-ANON-KEY';

/** Public storage bucket that holds the images the client uploads. */
export const BUCKET = 'web-assets';

/** Object inside the bucket that maps slot ids to uploaded file paths. */
export const MANIFEST_OBJECT = 'manifest.json';

/** Folder inside the bucket where uploads are stored. */
export const UPLOAD_PREFIX = 'slots';

export const isConfigured = () =>
  !SUPABASE_URL.includes('YOUR-PROJECT-ref') && !SUPABASE_ANON_KEY.includes('YOUR-PUBLIC');

export const publicUrl = (objectPath) =>
  `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;

/**
 * Performance clips are not in the repository (see README.md, "Performance
 * clips are not in the repository yet"). Each key is a video id set by
 * assets/js/videos.js via data-video; null means "not hosted yet", and the
 * site shows a placeholder in its place. Once a clip is hosted somewhere
 * public, paste its URL here to make it play again - no other file needs to
 * change.
 */
export const VIDEO_SOURCES = {
  prev1: null,
  prev2: null,
  prev3: null,
  miniaturaactuaciones: null,
  pasacalles: null,
  sacramentos: null
};
