# Supabase setup for the photo panel and performance clips

The public site never talks to a database. It reads one JSON file from a public
Storage bucket and swaps the images listed in it, and it plays the performance
clips straight from the same bucket. Everything else — the pages, the original
photos — is static and works with Supabase offline.

## 1. Create the project

1. Create a free project at <https://supabase.com/dashboard>.
2. Open **Project Settings → API** and copy:
   - **Project URL** (`https://<ref>.supabase.co`)
   - **anon public** key
3. Paste both into [`assets/js/config.js`](../assets/js/config.js). They are
   public client credentials: what they are allowed to do is decided by the
   policies below, not by secrecy. Never put the `service_role` key here.

## 2. Create the bucket

**Storage → New bucket**

| Field | Value |
|---|---|
| Name | `web-assets` |
| Public bucket | **enabled** |
| File size limit | `100 MB` |
| Allowed MIME types | `image/jpeg, image/png, image/webp, image/avif, application/json, video/mp4` |

The 100 MB limit is for the largest performance clip (82 MB); it doesn't loosen
what the admin panel accepts — `assets/js/admin.js` still rejects photos over
8 MB in the browser before anything is uploaded.

Three kinds of objects live here:

- `slots/<slot-id>.<ext>` — one file per replaced photo, written by the panel
- `manifest.json` — `{ "slots": { "<slot-id>": { "path": "...", "updatedAt": "..." } } }`
- `videos/<video-id>.mp4` — the six performance clips, uploaded once by hand
  (see "Upload the performance clips" below) — the admin panel doesn't touch
  these

## 3. Policies

Public read; writes only for accounts on an explicit admin allowlist. Being
signed in is **not** enough: if public sign-up were ever re-enabled by mistake,
a freshly registered account still couldn't touch the bucket. Run this in
**SQL Editor** (it is idempotent, so it also migrates a project that still has
the older "any authenticated user may write" policies):

```sql
-- Allowlist. Lives in a schema the Data API doesn't expose, with RLS on and no
-- grants, so no client can read or change it - only the SQL Editor can.
create schema if not exists private;

create table if not exists private.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table private.admins enable row level security;
revoke all on private.admins from public, anon, authenticated;

-- Policies run as the caller, who can't read private.admins; this function
-- does the lookup as its owner and only ever answers about the caller.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.admins where user_id = (select auth.uid()));
$$;
revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

-- Anyone may read the bucket (the site is public).
drop policy if exists "web-assets public read" on storage.objects;
create policy "web-assets public read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'web-assets');

-- Only allowlisted admins may add, replace or delete objects.
drop policy if exists "web-assets authenticated insert" on storage.objects;
drop policy if exists "web-assets authenticated update" on storage.objects;
drop policy if exists "web-assets authenticated delete" on storage.objects;
drop policy if exists "web-assets admin insert" on storage.objects;
drop policy if exists "web-assets admin update" on storage.objects;
drop policy if exists "web-assets admin delete" on storage.objects;

create policy "web-assets admin insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'web-assets' and (select private.is_admin()));

create policy "web-assets admin update"
on storage.objects for update
to authenticated
using (bucket_id = 'web-assets' and (select private.is_admin()))
with check (bucket_id = 'web-assets' and (select private.is_admin()));

create policy "web-assets admin delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'web-assets' and (select private.is_admin()));
```

Until someone is added to `private.admins` (next step), nobody can write -
the panel still signs in, but uploads fail with a policy error.

## 4. Create the panel's users

**Authentication → Users → Add user**: enter the person's email and a password,
and tick *Auto Confirm User*. (Or **Invite user**, which emails them a link to
set their own password.)

Then, under **Authentication → Sign In / Providers**, disable **Allow new users
to sign up**. There is no public registration.

Finally, put the account on the allowlist - an account that isn't there can
sign in but can't change anything:

```sql
insert into private.admins (user_id, note)
select id, 'client' from auth.users where email = 'person@example.com'
on conflict (user_id) do nothing;
```

To revoke someone, delete their row (`delete from private.admins where user_id
= '...'`) or delete the user in **Authentication → Users**; the row goes with
it. `select a.*, u.email from private.admins a join auth.users u on u.id =
a.user_id;` lists who has access.

## 5. Check it end to end

1. Open `/admin.html` and sign in.
2. Replace one photo; the card badge turns into *Foto cambiada*.
3. Open the page listed on that card and hard-reload. The new photo is served
   from `https://<ref>.supabase.co/storage/v1/object/public/web-assets/slots/...`.
4. Press *Volver a la original*: the object is deleted and the page falls back
   to the local image straight away.

Visitors may keep seeing the previous photo for up to 5 minutes: the manifest is
requested with a time-bucketed cache buster (`MANIFEST_TTL_SECONDS` in
[`assets/js/slots.js`](../assets/js/slots.js)).

## 6. Upload the performance clips

The six clips aren't in the repository (see README.md, "Performance clips are
not in the repository yet") but are still on the machine that did this
migration, gitignored, under `images/0/...`. Unlike photos, this is a one-time
manual upload — the admin panel doesn't manage videos.

In **Storage → web-assets**, create a `videos/` folder and upload each file
**renamed** to match its id (`assets/js/config.js` builds the URL from the id,
not the original filename):

| Video id | Local file | Upload as |
|---|---|---|
| `prev1` | `images/0/7825298/copy-bc98406d-…-S4rOEk8N.mp4` | `videos/prev1.mp4` |
| `prev2` | `images/0/7825329/Snapinsta.app_video_…-dashinit.mp4` | `videos/prev2.mp4` |
| `prev3` | `images/0/7825338/snapinstaapp-video-…-KcmKsqsD.mp4` | `videos/prev3.mp4` |
| `miniaturaactuaciones` | `images/0/7909284/ActuacinPadul.mp4` | `videos/miniaturaactuaciones.mp4` |
| `pasacalles` | `images/0/7848240/VideoPasacallesTemerario.mp4` | `videos/pasacalles.mp4` |
| `sacramentos` | `images/0/7848177/IMG_82471.mp4` | `videos/sacramentos.mp4` |

Once `assets/js/config.js` has real Supabase credentials, `VIDEO_SOURCES`
resolves these automatically — nothing else to edit. A clip whose object
isn't uploaded yet keeps showing the "Vídeo próximamente" placeholder; upload
it whenever it's ready, there's no need to do all six at once.

## How slots are generated

[`scripts/build-slots.mjs`](../scripts/build-slots.mjs) scans the pages and
writes [`assets/data/slots.json`](../assets/data/slots.json), tagging each
editable element with `data-slot="<id>"`. The id is derived from the **image
file name**, not from the Sitejet asset id, because the `es` and `gd` trees
reference the same photo under different asset ids — so one upload updates both
locales.

Re-run it after adding images to the markup:

```bash
node scripts/build-slots.mjs        # tags pages and rewrites slots.json
node scripts/build-slots.mjs --check  # reports what would change
```

Slot ids are stable as long as the file names are. Renaming an image file
orphans its uploaded override; delete the stale object in Storage if that
happens.

## Upgrading supabase-js

The admin panel doesn't load supabase-js from a CDN: a pinned copy of the UMD
build lives in [`assets/vendor/`](../assets/vendor/), so nothing outside this
repository ever runs next to a signed-in session, and the CSP in
[`admin.html`](../admin.html) can stay at `script-src 'self'`. To upgrade:

```bash
V=2.x.y   # the new version
curl -fL "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@$V/dist/umd/supabase.js"   -o "assets/vendor/supabase-js-$V.umd.js"
# Compare with the "hash" jsDelivr lists for /dist/umd/supabase.js:
curl -s "https://data.jsdelivr.com/v1/packages/npm/@supabase/supabase-js@$V?structure=flat"
openssl dgst -sha256 -binary "assets/vendor/supabase-js-$V.umd.js" | openssl base64
```

Then point the `<script>` in `admin.html` at the new file, delete the old one,
and sign in to the panel once to check it still works.

## Free tier limits

1 GB of storage and 5 GB of egress **per month, for the whole project** —
photos and videos share the same cap. The 291 MB of clips fit storage
comfortably; egress is the one to watch, since a single visitor watching all
six clips uses ~291 MB and the cap resets monthly. Ordinary local traffic
should stay well under it; if a clip ever gets shared widely and traffic
spikes, Supabase's paid tier (from $25/month) lifts the cap — nothing to
migrate, same bucket, same URLs.
