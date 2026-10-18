# Firebase Setup — ELLS Club Notice Board

The site now runs on **Firebase v10 (modular SDK)** with **Firebase Authentication**
for the admin console and **Cloud Firestore** for the notice board.

| Piece | File |
| --- | --- |
| Firebase init + config | `New folder/js/firebase-config.js` |
| Public notice board (read) | `New folder/js/notice-board.js` → `index.html` |
| Admin login + publish (write) | `New folder/js/admin.js` → `admin.html` |
| Security rules | `firestore.rules` |
| CLI project config | `firebase.json`, `.firebaserc` |

Firestore collection used: **`notices`**.

---

## 1. Create the admin user (once)

Firebase console → **Authentication** → *Get started* → **Users** → *Add user*:

* Email: `it.secretary@ells-club.com` (or any committee email you prefer)
* Password: a strong password known only to the IT Secretary

Then open the verification email and confirm the address — the rules require
`email_verified == true`.

> Sign-in uses **Email & Password** only. Enable it under
> **Authentication → Sign-in method → Email/Password**.

## 2. Create the Firestore database (once)

Firebase console → **Firestore Database** → *Create database* → production mode →
choose the `asia-south1` (or nearest) location.

The `notices` collection is created automatically the first time a notice is
published. Each document looks like:

```json
{
  "title": "Autumn-2026 General Meeting",
  "date": "2026-10-27",
  "description": "All registered members are requested ...",
  "createdAt": "<server timestamp>",
  "authorEmail": "it.secretary@ells-club.com",
  "authorUid": "<firebase uid>"
}
```

## 3. Publish the security rules

Firebase console → **Firestore Database → Rules** → paste `firestore.rules` →
**Publish**. Or with the CLI:

```bash
npm i -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

What the rules enforce:

* **read** — public, so `index.html` can render notices for everyone.
* **create** — only a signed-in, email-verified account whose address is on the
  admin allowlist **and** whose document matches the expected shape.
* **update / delete** — blocked from the browser (use the Firebase console).

⚠️ **Edit the allowlist** near the top of `firestore.rules`:

```js
request.auth.token.email in [
  'it.secretary@ells-club.com'
  // add further committee emails here
]
```

If you created the admin account with a different address, update this list —
otherwise publishes fail with *“Firestore blocked this write…”*.

## 4. How the two sides talk

**Admin (`admin.html`)**

1. `signInWithEmailAndPassword()` on submit; `onAuthStateChanged()` keeps the
   UI in sync, so a refresh keeps the session when “Keep me signed in” is on.
2. On success the login form is hidden and the **Admin Dashboard** appears.
3. **Publish Notice** → `addDoc(collection(db, 'notices'), {...})`.
4. The dashboard list is an `onSnapshot()` feed of the same collection, so it
   always shows exactly what visitors see.
5. **Log out** → `signOut(auth)`; the session and the live feed are torn down.

**Public site (`index.html`)**

`onSnapshot(query(collection(db, 'notices'), orderBy('date', 'desc')))` renders
the cards inside the **Event & Notice Schedule** section (`#noticeBoardGrid`).
Cards reuse the site's existing `event-card`, `event-date-badge`, `event-meta`
and `badge` classes, and the board shows dedicated loading / empty / error
states. New notices appear without a page reload.

## 5. Where the SDK is loaded from

The official v10.14.1 modular bundles are vendored in
`New folder/js/vendor/firebase/` (identical to the gstatic.com build, with only
the internal import path pointing at the local copy). Pages therefore load the
SDK from the site's own origin — no third-party script dependency and no CDN
blocklist issues.

To upgrade the SDK later, download the matching version's `firebase-app.js`,
`firebase-auth.js` and `firebase-firestore.js` from
`https://www.gstatic.com/firebasejs/<version>/`, drop them in that folder, and
replace the gstatic import inside `firebase-auth.js` / `firebase-firestore.js`
with `./firebase-app.js`.

## 6. Deploying the site

```bash
firebase deploy --only hosting      # serves the "New folder" directory
firebase deploy --only firestore    # rules + indexes
```

`firebase.json` points Hosting at `New folder`, so the site is published from
the same paths used locally.

> The Firebase web API key in `firebase-config.js` is **not** a secret; it only
> identifies the project. Access control lives in the security rules above.
