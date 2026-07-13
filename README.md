# Family Archive — a private-ish family tree on GitHub Pages

A static, free-to-host family tree website. No server, no database —
just a JSON file, some photos, and GitHub's own tools for editing.

---

## 1. Put this on GitHub

1. Create a **new GitHub repository** (e.g. `family-tree`). Keep it **Public**
   (GitHub Pages is only free for public repos on a free account).
2. Upload all the files in this folder to that repo, keeping the folder
   structure exactly as it is (`index.html` at the root, `assets/`, `data/`).
3. Go to **Settings → Pages**.
   - Source: `Deploy from a branch`
   - Branch: `main`, folder `/ (root)`
   - Save. After a minute or two your site is live at:
     `https://YOUR-USERNAME.github.io/family-tree/`
4. Send that link only to family — don't post it publicly anywhere.

That's it — hosting is free forever, no ongoing cost.

---

## 2. Change the password (do this before sharing the link!)

The default password is `family2026`. To set your own:

1. Open any browser, press F12 (or right-click → Inspect) to open DevTools,
   go to the **Console** tab.
2. Paste this, replacing `yourpassword` with the real one:
   ```js
   crypto.subtle.digest("SHA-256", new TextEncoder().encode("yourpassword"))
     .then(buf => console.log(Array.from(new Uint8Array(buf))
       .map(b => b.toString(16).padStart(2, "0")).join("")))
   ```
3. Copy the long string it prints out.
4. In `assets/app.js`, find this line near the top:
   ```js
   const PASSWORD_HASH = "7dce034e548b1e319664a6f0d28c30d61f3c5fb9765b76aa8c73bd5e391302fc";
   ```
   Replace the string with the one you copied. Commit the change.

**Important:** this password screen keeps out casual visitors and search
engines — it is **not real security**. Anyone with real technical skill
could bypass it, since the page and data are public. Don't put sensitive
info (SSNs, addresses, anything truly private) in the tree.

---

## 3. Add trusted family members as editors

1. Go to **Settings → Collaborators** in your repo.
2. Click **Add people**, enter their GitHub username or email.
3. They accept the invite (they'll need a free GitHub account —
   github.com/join takes two minutes).

Now they can edit files directly in the browser, no coding required.

---

## 4. How to add a person

Open `data/family.json` in the GitHub web editor (click the file, then the
pencil icon ✏️). Add a new entry to the `people` list:

```json
{
  "id": "p9",
  "name": "New Person",
  "born": "1990",
  "died": "",
  "photo": "assets/photos/new-person.jpg",
  "bio": "A short note about them.",
  "parents": ["p3", "p4"]
}
```

- `id` — must be unique, no spaces.
- `parents` — the `id`s of their parents (leave empty `[]` for the
  eldest generation). Two parents will automatically be drawn together
  as a couple.
- `photo` — leave as `""` to show their initials instead of a photo.
- Commit the change (green **Commit changes** button at the bottom).

## 5. How to add a photo

1. Go to the `assets/photos` folder in the repo.
2. Click **Add file → Upload files**, drag the photo in, and commit.
3. Edit that person's entry in `family.json` and set:
   `"photo": "assets/photos/whatever-you-named-it.jpg"`

Give photos simple names with no spaces (`grandma-eleanor.jpg`, not
`Grandma Eleanor (1).jpg`).

The site updates automatically 1–2 minutes after any commit.

---

## Troubleshooting

- **Site shows a blank tree:** check that `data/family.json` is valid JSON
  (a missing comma will break it) — GitHub will show a red error marker
  if so.
- **Photo doesn't show:** double-check the `photo` path matches the
  uploaded filename exactly, including capitalization.
- **Site not updating:** check the **Actions** tab in the repo for a
  green checkmark confirming the latest deploy succeeded.
