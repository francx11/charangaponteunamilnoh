# Supabase setup for the photo panel

The public site never talks to a database. It reads one JSON file from a public
Storage bucket and swaps the images listed in it. Everything else — the pages,
the original photos — is static and works with Supabase offline.

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
| File size limit | `8 MB` |
| Allowed MIME types | `image/jpeg, image/png, image/webp, image/avif, application/json` |

The panel writes two kinds of objects:

- `slots/<slot-id>.<ext>` — one file per replaced photo
- `manifest.json` — `{ "slots": { "<slot-id>": { "path": "...", "updatedAt": "..." } } }`

## 3. Policies

Public read, authenticated write. Run this in **SQL Editor**:

```sql
-- Anyone may read the bucket (the site is public).
create policy "web-assets public read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'web-assets');

-- Only signed-in users may add, replace or delete objects.
create policy "web-assets authenticated insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'web-assets');

create policy "web-assets authenticated update"
on storage.objects for update
to authenticated
using (bucket_id = 'web-assets')
with check (bucket_id = 'web-assets');

create policy "web-assets authenticated delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'web-assets');
```

## 4. Create the client's user

**Authentication → Users → Add user**: enter the client's email and a password,
and tick *Auto Confirm User*.

Then, under **Authentication → Sign In / Providers**, disable **Allow new users
to sign up**. Only the accounts you create can reach the panel — there is no
public registration.

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

## Free tier limits

1 GB of storage and 5 GB of egress per month, which is far beyond what
replacing a few dozen photos needs. The site's own videos are **not** in
Storage: they ship with the repository.
