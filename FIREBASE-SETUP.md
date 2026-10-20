# Firebase Setup — ELLS Club Notice Board & Events

The site runs on **Firebase v10 (modular SDK)** with **Firebase Authentication**
for the admin console and **Cloud Firestore** for the notice board and the
events page.

| Piece | File |
| --- | --- |
| Firebase init + config | `New folder/js/firebase-config.js` |
| Public notice board (read) | `New folder/js/notice-board.js` → `index.html` |
| Public events feed (read) | `New folder/js/events-feed.js` → `events.html` |
| Admin login, publish & delete | `New folder/js/admin.js` → `admin.html` |
| Security rules | `firestore.rules` |
| CLI project config | `firebase.json`, `.firebaserc` |

Firestore collections used: **`notices`** and **`events`**.

---

## The authorised admin accounts

Both addresses are **full administrators with identical rights**.

| | |
| --- | --- |
| **Authorised emails** | `emdadulhoquex@gmail.com` (IT Secretary)<br>`ells.dell.iiuc95@gmail.com` (official ELLS club account) |
| Where it is enforced | `firestore.rules` → `isAdminEmail()` / `isAdmin()` (real security boundary) |
| Where it is mirrored | `ADMIN_EMAILS` in `New folder/js/firebase-config.js` (UI guard) |

* **Read** on `notices` and `events` → public, so `index.html` and `events.html`
  work for visitors.
* **Create / update / delete** on `notices` and `events` → only the two
  addresses above. They are the **only** accounts with write access anywhere in
  the rules, and each has the full set of permissions.
* Matching is case-insensitive, so `Ells.Dell.IIUC95@gmail.com` still matches.
* Either admin can update or delete documents created by the other; the stored
  `authorEmail` / `authorUid` keep pointing at whoever created the entry.
* Any other signed-in account is rejected by the rules **and** signed straight
  back out by `admin.js` with an “not authorised” message.
* All other collections → denied.

> If an admin changes, update **both** `firestore.rules` (`isAdminEmail()`) and
> `ADMIN_EMAILS`, then redeploy the rules.

## 1. Create the admin users (once)

Firebase console → **Authentication** → *Get started* → **Users** → *Add user*,
once per account:

* Email: `emdadulhoquex@gmail.com` — Password: a strong password you control
* Email: `ells.dell.iiuc95@gmail.com` — Password: a strong password you control

Make sure **Authentication → Sign-in method → Email/Password** is enabled.

## 2. Create the Firestore database (once)

Firebase console → **Firestore Database** → *Create database* → production mode →
choose `asia-south1` (or nearest) as the location.

The `notices` collection appears the first time a notice is published. Each
document looks like:

```json
{
  "title": "Autumn-2026 General Meeting",
  "date": "2026-10-27",
  "description": "All registered members are requested ...",
  "createdAt": "<server timestamp>",
  "authorEmail": "<signed-in admin email>",
  "authorUid": "<firebase uid>"
}
```

`authorEmail` is always the signed-in admin's address, so it will be either
`emdadulhoquex@gmail.com` or `ells.dell.iiuc95@gmail.com` — the rules reject any
other value.

The `events` collection appears the first time an event is published from the
**Event Management** section of `admin.html`. Each document looks like:

```json
{
  "title": "Lexicon Mastery",
  "category": "Organizing Track",
  "description": "A fast-paced vocabulary showdown ...",
  "date": "Wed, Oct 14",
  "time": "2:00 PM - 2:30 PM",
  "venue": "Department of English, Campus Hall",
  "registrationLink": "https://forms.gle/...",
  "createdAt": "<server timestamp>",
  "authorEmail": "<signed-in admin email>",
  "authorUid": "<firebase uid>"
}
```

`date` and `time` are display strings exactly as they should appear on the
public event cards; `registrationLink` is the URL behind the card's
**RSVP Now** button.

## 3. Publish the security rules

Firebase console → **Firestore Database → Rules** → paste `firestore.rules` →
**Publish**. Or with the CLI:

```bash
npm i -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

---

# Testing in the Arena preview

The preview serves the site over HTTPS on a public `e2b.app` URL. Your **browser**
(not the sandbox) makes the Firebase calls, so Authentication and Firestore work
normally from the preview — no tunneling or local emulator needed.

### Before you start

1. The three console steps above are done (user created, Firestore created,
   rules published).
2. `firestore.rules` contains **both** `emdadulhoquex@gmail.com` and
   `ells.dell.iiuc95@gmail.com`.
3. Open the preview → **`/admin.html`**.

### Test 1 — Login works

1. Enter `emdadulhoquex@gmail.com` **or** `ells.dell.iiuc95@gmail.com` + its
   password from step 1.
2. Expect: the “Verifying secure session” splash clears, the login form
   disappears and the **Admin Console** dashboard opens with the email in the
   top-right chip.

*Fails?* `auth/invalid-credential` = wrong password or the user does not exist;
`auth/operation-not-allowed` = Email/Password sign-in is disabled;
`auth/network-request-failed` = a network/ad-blocker is blocking
`identitytoolkit.googleapis.com`.

### Test 2 — Publish writes to Firestore

1. Fill **Title**, **Date**, **Description** → **Publish Notice**.
2. Expect: a green “Notice published — it is now live on the public notice
   board” message, the form clears, and the notice appears in **Live Notices**.

3. Verify in the Firebase console: **Firestore Database → Data → notices** —
   the document must exist with `createdAt`, `authorEmail` and `authorUid`.

### Test 3 — The public board updates live

1. Open the preview root (`/index.html`) in a second tab and scroll to
   **Event & Notice Schedule**.
2. Publish or delete a notice in the admin tab.
3. Expect: the homepage changes **without a reload** (real-time `onSnapshot`),
   and the green “Live from the ELLS notice board” pill is visible.

### Test 4 — Only the admin accounts may write ★

**4a — the UI.** In the Firebase console create a second account, e.g.
`tester@example.com` (Authentication → Users → Add user). Sign out of the admin
console and sign in with it.

Expect: the dashboard **never opens**; you are signed straight out with
*“tester@example.com is not authorised to use the ELLS admin console.”*

**4b — the rules themselves.** The UI guard can be bypassed by anyone who
imports the SDK directly, so verify the server-side boundary too. In the
Firebase console open **Firestore Database → Rules → Rules Playground**:

| Field | Value |
| --- | --- |
| Location | `/databases/(default)/documents/notices/rules-probe` |
| Operation | `create` |
| Authenticated | **on** |
| UID | `probe-uid` |
| Token payload | `{"email": "tester@example.com", "email_verified": true}` |

Document data:

```json
{
  "title": "Rules probe",
  "date": "2026-10-20",
  "description": "Probing the Firestore security rules.",
  "createdAt": 1700000000,
  "authorEmail": "tester@example.com",
  "authorUid": "probe-uid"
}
```

Click **Run** → the result must be **Denied**.

Now change **only** the token payload to
`{"email": "emdadulhoquex@gmail.com", "email_verified": true}` and click
**Run** again → the result must be **Allowed**.

Repeat with **only** the token payload changed to
`{"email": "ells.dell.iiuc95@gmail.com", "email_verified": true}` → the result
must be **Allowed** as well: both accounts have identical write access.

Finally switch **Authenticated** off and Run once more → **Denied**
(anonymous visitors can never write).

> This is the definitive proof: same payload, only the email changed. Nothing
> in the browser can get around that.

### Test 5 — Delete is admin-only

1. Signed in as the admin, click **×** next to a notice → confirm the dialog.
2. Expect: the row disappears from the dashboard *and* from the public board,
   and the document is gone from Firestore.

> If you ever see *“Firestore blocked this action”* as the admin, the rules in
> the console are still the old version — republish `firestore.rules`.

### Reverting test data

Delete the tester account (Authentication → Users) and any scratch notices
(Firestore → `notices`) before demoing the site. The tester account holds no
write access, so it cannot pollute production data.

---

## 4. How the two sides talk

**Admin (`admin.html`)**

1. `signInWithEmailAndPassword()` on submit; `onAuthStateChanged()` keeps the
   UI in sync, so a refresh keeps the session when “Keep me signed in” is on.
2. Non-allowlisted accounts are signed out immediately.
3. **Publish Notice** → `addDoc(collection(db, 'notices'), {...})`;
   **Publish Event** → `addDoc(collection(db, 'events'), {...})`.
4. The **×** button → `deleteDoc(doc(db, 'notices' | 'events', id))`.
5. The dashboard lists are `onSnapshot()` feeds of the same collections, so they
   always show exactly what visitors see.
6. **Log out** → `signOut(auth)`; the session and the live feeds are torn down.

**Public site (`index.html`)**

`onSnapshot(query(collection(db, 'notices'), orderBy('date', 'desc')))` renders
the cards inside the **Event & Notice Schedule** section (`#noticeBoardGrid`).
Cards reuse the site's existing `event-card`, `event-date-badge`, `event-meta`
and `badge` classes, and the board shows loading / empty / error states.

**Public events page (`events.html`)**

`js/events-feed.js` subscribes to the `events` collection and renders the
upcoming-event cards into `#eventsGrid` with the same `event-card` UI (date
badge, category badge, meta icons, RSVP button). Cards are ordered by the
month/day parsed from the display `date`, and the **RSVP Now** button links
directly to each event's `registrationLink` (opened in a new tab with
`rel="noopener noreferrer"`).

Each card is a **square poster + details** layout:

| Viewport | Layout |
| --- | --- |
| Desktop / tablet (> 768 px) | poster square on the left, details on the right |
| Mobile (≤ 768 px) | poster square on top, details stacked below |

The poster is always `aspect-ratio: 1 / 1; object-fit: cover`, so every card
lines up regardless of the uploaded image's dimensions. Events without a
poster (or whose poster URL fails to load) show a Midnight-Blue placeholder
panel with the soft-gold **ELLS** mark and the event's category.

## 4a. Event posters — ImgBB, not Firebase Storage

Posters are uploaded straight from the admin's device to the **free ImgBB
API**, and only the returned `display_url` is stored in Firestore. No image
binary ever reaches Firebase Storage, so the project stays on the free tier
with no billing risk.

```
POST https://api.imgbb.com/1/upload     (multipart/form-data)
     image = the chosen JPG/PNG file
     key   = IMGBB_API_KEY               (New folder/js/firebase-config.js)
→    { success: true, data: { display_url: "https://i.ibb.co/…" } }
```

* Accepted files: JPG / JPEG / PNG, **8 MB maximum** (`POSTER_MAX_BYTES`).
* The submit button shows **“Uploading poster…”** while the request is in
  flight, then **“Publishing…”** while the document is written.
* A failed upload aborts the publish — no half-saved event and a readable
  error message (wrong file type, too large, rate-limited, bad key, offline).
* The admin can drop an image onto the picker or choose it with the file
  browser, preview it at 1:1, and remove it before publishing.
* Firestore Rules treat `posterUrl` as optional and require it to be an
  `https://` string of at most 600 characters when present.

> **Key rotation:** replace `IMGBB_API_KEY` in
> `New folder/js/firebase-config.js`. The key is a public, browser-embedded
> credential (like the Firebase web API key); it only authorises uploads to
> your own ImgBB account, so rotate it if it is ever abused.

## 5. Where the SDK is loaded from

The official v10.14.1 modular bundles are vendored in
`New folder/js/vendor/firebase/` (identical to the gstatic.com build, with only
the internal import path pointing at the local copy). Pages therefore load the
SDK from the site's own origin — no third-party script dependency and no CDN
blocklist issues.

To upgrade later, download the matching version's `firebase-app.js`,
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
