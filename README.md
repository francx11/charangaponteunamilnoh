# charangaponteunamilnoh.com

Static site for Charanga Ponte Una Milnoh, migrated off Sitejet/Plesk. No build
step, no framework, no server: plain HTML, one stylesheet per layer and a
handful of ES modules. The only runtime dependency is Supabase, and only for the
photos the client replaces from the admin panel — the site renders completely
without it.

## Layout

```
index.html            language redirect (es | gd)
404.html              copy of es/404 for GitHub Pages
admin/index.html      client photo panel at /admin/ (noindex)
es/  gd/              the 27 pages; gd is the "granaíno" locale, not Gaelic
assets/css/site.css   styles owned by the refactor (lightbox, slider, CTA)
assets/css/admin.css  admin panel styles
assets/js/*.js        vanilla replacements for the Sitejet runtime
assets/data/slots.json  generated catalogue of editable photos
css/custom.*.css      site styling exported from Sitejet
webcard/static/       layout framework CSS + FontAwesome faces
g/                    self-hosted Google Fonts
images/               all photos and videos
scripts/*.mjs         maintenance scripts (Node 22+, no dependencies)
docs/                 baseline audit and Supabase setup
```

## Local development

Any static file server works; paths are site-absolute, so the site must be
served from the repository root rather than opened with `file://`.

```bash
python -m http.server 8080
# http://127.0.0.1:8080/es/   http://127.0.0.1:8080/admin/
```

Edit HTML, CSS and JS directly. There is nothing to compile.

## Maintenance scripts

```bash
node scripts/check-assets.mjs        # every local reference resolves on disk
node scripts/sanitize.mjs            # strip CMS residue, wire the modules in
node scripts/build-slots.mjs         # regenerate slots.json and data-slot tags
node scripts/build-sitemap.mjs       # regenerate sitemap.xml
```

All four accept `--check` and exit non-zero when something is stale; CI runs
them on every push. `sanitize.mjs` and `build-slots.mjs` are idempotent, so
running them after editing the markup is always safe.

`404.html` is a copy of `es/404/index.html`. If that page changes, copy it
again.

## The JavaScript

`assets/js/main.js` boots six modules that replace `app.bundle.js` (jQuery +
slick, 386 KB) and `custom.js`:

| Module | Responsibility |
|---|---|
| `nav.js` | mobile drawer, sticky header, smooth scroll, scroll spy |
| `lazyload.js` | `IntersectionObserver` loader for `.ed-lazyload` |
| `parallax.js` | fixed-background tracking on the banners |
| `slider.js` | review carousel, built from the `data-parameters` JSON |
| `lightbox.js` | `<dialog>` gallery viewer |
| `maps.js` | keyless Google Maps iframe, mounted on scroll |
| `slots.js` | applies the client's photo replacements |

They depend on the classes the exported stylesheets expect (`open open-menu`,
`sticky`, `ed-lazyload`, `--spacer-height`), so changing those class names means
changing the modules too.

## Supabase

Full setup — bucket, policies, user — is in
[docs/supabase-setup.md](docs/supabase-setup.md). In short:

1. Create a project, copy the URL and anon key into `assets/js/config.js`.
2. Create a public bucket named `web-assets` with an 8 MB limit.
3. Apply the storage policies (public read, authenticated write).
4. Create the client's user and disable public sign-ups.

Both credentials are public client values. The `service_role` key must never
appear in this repository.

## Deployment

### GitHub Pages (the supported target)

1. Push to `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. `.github/workflows/deploy.yml` verifies the four checks above and deploys
   the repository as-is.
4. For the custom domain, set it under **Settings → Pages**, which creates a
   `CNAME` file, and point the DNS records at GitHub.

### Performance clips are not in the repository

Six performance videos (291 MB total, largest 81.9 MB) are referenced by
`es|gd/{galeria,actuaciones-de-escenario,pasacalles,sacramentos}` but are not
tracked in Git — the files are gitignored (`images/**/*.mp4`) and
`scripts/check-assets.mjs` explicitly skips their 12 references (6 files × 2
locales) instead of failing CI over assets that are intentionally absent.

They're hosted in the same Supabase bucket as the client's photos instead of
a separate service (see [docs/supabase-setup.md](docs/supabase-setup.md),
"Upload the performance clips"). `assets/js/videos.js` resolves each
`<video data-video="id">` against `VIDEO_SOURCES` in `assets/js/config.js`:
configured and uploaded, it plays; not yet, it shows a "Vídeo próximamente"
placeholder instead of a broken player. Nothing else needs editing once a
clip is uploaded — the URL is derived from the id automatically.

### Repository size

119 MB of tracked working tree, ~220 MB of Git objects. Small enough that
Cloudflare Pages' 25 MB/file limit is no longer the blocker it was when the
videos shipped in the repo — GitHub Pages remains the deploy target below
because the workflow is already built for it, not because Cloudflare Pages is
ruled out.

`ponteunamilnoh_backup.zip` (1.15 GB) is gitignored. Keep it somewhere outside
the repository as the archive of the original Sitejet export.

## What changed relative to the Sitejet export

- `api.php` is gone; the contact form it served is replaced by WhatsApp and
  email buttons.
- Cookiebot and the external events feed were removed at the owner's request.
  No tracking script remains, so no consent banner is required.
- The inline `webcard = {...}` block was removed from every page, which also
  stops leaking a Google Maps API key.
- 337 orphan image derivatives were deleted (702 MB).
- Fixed: the "Aviso Legal" footer link pointed at `/legal-notice`, a page that
  was never exported; and a dead inline script on 18 pages threw a
  `SyntaxError` on load.
- `/es/subpage` still resolves but is no longer listed in `sitemap.xml`: it is
  an empty Sitejet demo page.

Titles, descriptions, keywords, OpenGraph tags, canonicals, `hreflang` pairs,
viewport tags and icons are unchanged — verified page by page against the
baseline commit. [docs/audit-baseline.md](docs/audit-baseline.md) records what
the export looked like before any of this.
