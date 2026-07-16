# Family Archive — a private-ish family tree

A static family tree site hosted on GitHub Pages, with the people and photos
stored in [Supabase](https://supabase.com) so family can add and edit from the
website itself — no GitHub account, no JSON editing.

There is no build step. `index.html` loads `assets/style.css` and
`assets/app.js`, and that's the whole app.

---

## How the tree is drawn

Everyone is a row in the Supabase `people` table. A row points at its parent
with `parent_id`, and that's what forms the tree. Spouses are *fields on the
person* (`spouse_name`, `spouse_photo_url`) rather than rows of their own, so a
married couple shares one card.

The layout is computed in JavaScript (`layout()` in `assets/app.js`), not by
CSS. Every card is the same 150px square, leaves are assigned columns left to
right, and each parent is centred over its own children. That's what keeps
sibling spacing even and every generation on its own line, however lopsided the
family gets. The result is drawn onto a pan/zoom canvas, so a tree that's too
wide for the screen is explored by zooming in rather than by shrinking the
whole page.

To change the spacing or card size, edit the constants at the top of `app.js`
(`CARD`, `GAP_X`, `GAP_Y`) — `--card-size` in `style.css` must match `CARD`.

## The `people` table

| column             | meaning                                        |
| ------------------ | ---------------------------------------------- |
| `id`               | primary key                                    |
| `name`             | the person                                     |
| `spouse_name`      | optional; shown on the same card               |
| `parent_id`        | `id` of their parent, or empty for the eldest  |
| `photo_url`        | set by uploading through the site              |
| `spouse_photo_url` | same, for the spouse                           |
| `created_at`       | used to order siblings left to right           |

Photos live in the Supabase `photos` storage bucket.

## Using the site

It opens on an **overview**: the eldest and their children, with every branch
below folded behind a **number badge** saying how many people are inside. Tap a
badge to open that branch, or **Expand all** to unfold the whole tree at once
(**Collapse** folds it back).

That default exists because the family outgrew the screen. Flat, the tree is
several thousand pixels wide, and shrinking that onto a phone gives ten-pixel
cards nobody can read. Folded it's a short row you can walk. A phone fits about
two cards at readable size, so seven siblings will never all be legible at once
— that's the screen, not the layout.

- **Drag** to move, **scroll or pinch** to zoom, **Fit** to frame what's open.
- **Search** a name to jump to anyone, including people inside a folded branch —
  it unfolds the way to them automatically.
- **Photos** toggle: cards show initials by default, photos when switched on.
  Remembered per browser. Full-size photos are always on the person's card
  either way.
- **Tap a card** to open a person: view and upload photos, add a child or
  sibling, edit names, or remove them.
- **+ on a card** adds a child of that person.

Removing a person is blocked while they still have children, so nobody gets
orphaned — remove or re-attach the children first.

## Photos

Uploading opens a cropper: drag to move, pinch or slider to zoom. What's saved
is a 600px square JPEG, not the phone's original, so a tree full of faces still
loads quickly. The circle is what a card shows; the corners are kept for the
person's own card.

The `photos` bucket needs policies allowing the site to read and write it —
without them every upload fails with a row-level security error that looks
nothing like a permissions problem. See `storage.objects` in the Supabase
dashboard.

---

## Change the password before sharing

The default is `family2026`. To set your own, get the SHA-256 of the new
password — in any browser open DevTools (F12) → Console and run:

```js
crypto.subtle.digest("SHA-256", new TextEncoder().encode("yourpassword"))
  .then(buf => console.log(Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0")).join("")))
```

Paste the result into `PASSWORD_HASH` near the top of `assets/app.js`, and commit.

## What this password is and isn't

**It is not security.** The page, the password hash, and the Supabase key are
all public in this repo, and the tree is readable and writable by anyone who
takes the trouble. The password only keeps out casual visitors; `robots.txt`
and the `noindex` tag only ask search engines not to list the page.

So: share the link with family, not publicly, and keep genuinely sensitive
details (addresses, dates of birth you'd not want public, anything
identity-theft-shaped) out of the tree.

If you want this properly locked down later, the pieces are Supabase Auth for
real logins plus row-level security policies on `people` and the `photos`
bucket, which would replace the password gate entirely.

## Hosting

Settings → Pages → deploy from `main` / root. The site updates a minute or two
after each commit; the Actions tab shows whether the deploy succeeded.
