# Baseline audit — raw Sitejet/Plesk export

Snapshot taken before any modification, so every later deletion can be audited
against it.

- **Total:** 1264 files, 2.33 GB (2 327 705 230 bytes)
- **Source:** Sitejet website export served by Plesk (`charangaponteunamilnoh.com`)
- **Encoding:** all HTML/CSS/JS are UTF-8 **without** BOM

## 1. File types

| Ext | Files | Size |
|---|---:|---:|
| `.svg` | 518 | 4.99 MB |
| `.jpg` | 469 | 176.24 MB |
| `.png` | 131 | 47.30 MB |
| `.woff2` | 49 | 0.77 MB |
| `.jpeg` | 34 | 16.73 MB |
| `.html` | 28 | 0.60 MB |
| `.js` | 8 | 0.57 MB |
| `.css` | 3 | 0.49 MB |
| `.mp4` | 18 | 865.79 MB |
| `.ttf` / `.woff` / `.eot` | 3 | 0.41 MB |
| `.xml` | 1 | 3.5 KB |
| `.php` | 1 | 15.2 KB |
| `.zip` | 1 | 1105.96 MB |

## 2. Sitemap and routes

Root `index.html` is a 161-byte script that redirects to `/es` or `/gd` based on
`navigator.languages`. `sitemap.xml` declares 27 URLs.

`gd` is **not** Scottish Gaelic content: it is the site's "granaíno" joke locale.
Its pages carry `lang="gd"` and hold genuinely different copy (verified: `es` and
`gd` homepages and inner pages differ byte-wise). Both trees must be preserved.

| Route | File | In sitemap |
|---|---|---|
| `/es` | `es/index.html` | yes |
| `/es/subpage` | `es/subpage/index.html` | yes |
| `/es/biografia` | `es/biografia/index.html` | yes |
| `/es/galeria` | `es/galeria/index.html` | yes |
| `/es/contacto` | `es/contacto/index.html` | yes |
| `/es/aviso-legal` | `es/aviso-legal/index.html` | yes |
| `/es/servicios` | `es/servicios/index.html` | yes |
| `/es/sacramentos` | `es/sacramentos/index.html` | yes |
| `/es/despedidas-de-solter` | `es/despedidas-de-solter/index.html` | yes |
| `/es/actuaciones-de-escenario` | `es/actuaciones-de-escenario/index.html` | yes |
| `/es/pasacalles` | `es/pasacalles/index.html` | yes |
| `/es/fiestas-patronales` | `es/fiestas-patronales/index.html` | yes |
| `/es/procesiones` | `es/procesiones/index.html` | yes |
| `/es/politica-de-cookies` | `es/politica-de-cookies/index.html` | yes |
| `/es/politica-de-privacidad` | `es/politica-de-privacidad/index.html` | yes |
| `/es/404` | `es/404/index.html` | yes (should be dropped) |
| `/gd` | `gd/index.html` | yes |
| `/gd/biografia` … `/gd/procesiones` (10 more) | `gd/*/index.html` | yes |

`gd` has no `subpage`, `aviso-legal`, `politica-de-*` or `404` counterpart; its
footer links point back into the `es` legal pages.

## 3. Proprietary runtime to remove

| Path | Size | Role |
|---|---:|---|
| `webcard/static/app.bundle.1714740343.js` | 386 KB | jQuery + slick + maps + lazyload + parallax + form handling |
| `webcard/static/{381,1940,7729,5655,2101}.js` | 141 KB | Orphan webpack chunks, never referenced by any page |
| `webcard/vendor/slick/slick.min.js` | 41 KB | Carousel, loaded by the bundle |
| `js/custom.240322113204.js` | 20 KB | jQuery presets: "Menu V2", countdown, language flags |
| `api.php` | 15 KB | Server-side form mailer, captcha and API proxy — impossible on static hosting |
| `bundles/flag-icon-css/flags/**` | 516 files, 5 MB | Flag sprites; **zero references** in the HTML (only `custom.js` reads a `data-lang` attribute that no element carries) |

Inline in every `<head>`:

```js
webcard.id=513237; webcard.moduleId=…; webcard.isEdit=false;
webcard.googleMapsEmbedApiKey='AIzaSy…'; webcard.apiHost=location.host + '/api.php';
```

This block leaks a Google Maps API key on all 28 pages and must go.

## 4. Assets to keep

| Path | Size | Role |
|---|---:|---|
| `css/custom.240310232058.css` | 372 KB | The actual site styling |
| `webcard/static/app.min.1714740336.css` | 114 KB | Layout framework (flex containers, presets, FontAwesome) |
| `webcard/static/fonts/**`, `webcard/static/images/**` | 0.9 MB | FontAwesome faces referenced by the CSS with relative `url()` |
| `g/fonts.css` + `g/static/s/**` | 49 files, 0.8 MB | Self-hosted Josefin Sans, Lato, Roboto, Kanit, Inter Tight |

## 5. CMS residue in the markup (28 pages)

| Pattern | Occurrences | Action |
|---|---:|---|
| `ed-lazyload` | 137 | Keep markup, re-implement loader in vanilla JS |
| `ed-icon` (inline SVG) | 62 | Keep as-is |
| `data-src=` | 61 | Keep, handled by new lazyloader |
| `data-bind="customer.*"` | 60 | Remove attribute, keep text |
| `ed-gallery` | 56 | Keep markup, new vanilla lightbox |
| `wv-link-elm` | 54 | Keep (CSS hook) |
| `data-reference` | 41 | Remove |
| `contenteditable="false"` | 40 | Remove |
| `data-parallax-amount` | 30 | Keep, new vanilla parallax |
| `data-parameters` (maps) | 28 | Read lat/lng, replace canvas with keyless iframe |
| `data-background` | 27 | Keep, handled by new lazyloader |
| `ed-form` | 200 | Form replaced by WhatsApp/mailto CTA (user decision) |
| `<video>` / `ed-video` | 12 | Keep untouched |
| `ed-slider` / `slick` | 2 / 6 | Keep markup, new vanilla slider |

Every `id="ed-*"` must survive: the per-page `<style>` blocks target those ids
directly.

## 6. Third-party endpoints

| Endpoint | Decision |
|---|---|
| `consent.cookiebot.com/uc.js` | Remove (no tracking left once Sitejet is gone) |
| `admineventos.charangaponteunamilnoh.com/events.json` | Remove, together with its table block |
| `admineventos.charangaponteunamilnoh.com/script-wa.js` | Keep (client-owned WhatsApp widget) |
| Google Maps | Keep, as a keyless `output=embed` iframe |

## 7. Asset reference analysis

Reference set built from every `.html`, `.css` and `.js` outside `images/`.

- Distinct `/images/...` paths referenced: **317**
- Files present under `images/`: **652**
- Referenced files found on disk: **315** (403.9 MB)
- Orphan files: **337** (~702 MB) — Sitejet responsive derivatives that no page
  requests, plus duplicated `.mp4` copies under `images/1024/` and `images/1920/`
  (pages only reference `images/0/`)
- Unresolved references: 2, both satisfied inside `webcard/static/images/`
  (`fontawesome-webfont.c1e38fd9.svg`, `ku.7a2e2db3.svg`), resolved relatively
  from the CSS, not from `/images/`

## 8. Static-hosting blockers

1. `api.php` backs the contact form present on all 28 pages — no PHP on GitHub
   Pages or Cloudflare Pages.
2. Referenced videos total 288 MB across 6 files, the largest **81.9 MB**.
   Cloudflare Pages rejects any file over 25 MB, so **GitHub Pages is the only
   viable target** while the videos stay in the repository.
