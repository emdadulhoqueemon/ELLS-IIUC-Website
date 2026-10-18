# Firebase Setup — ELLS Club Notice Board

The site runs on **Firebase v10 (modular SDK)** with **Firebase Authentication**
for the admin console and **Cloud Firestore** for the notice board.

| Piece | File |
| --- | --- |
| Firebase init + config | `New folder/js/firebase-config.js` |
| Public notice board (read) | `New folder/js/notice-board.js` → `index.html` |
| Admin login, publish & delete | `New folder/js/admin.js` → `admin.html` |
| Security rules | `firestore.rules` |
| CLI project config | `firebase.json`, `.firebaserc` |

Firestore collection used: **`notices`**.

---

## The single admin account

| | |
| --- | --- |
| **Authorised email** | `emdadulhoquex@gmail.com` |
| Where it is enforced | `firestore.rules` → `isAdmin()` (real security boundary) |
| Where it is mirrored | `ADMIN_EMAILS` in `New folder/js/firebase-config.js` (UI guard) |

* **Read** on `notices` → public, so `index.html` works for visitors.
* **Create / update / delete** on `notices` → only `emdadulhoquex@gmail.com`.
* Any other signed-in account is rejected by the rules **and** signed straight
  back out by `admin.js` with an “not authorised” message.
* All other collections → denied.

> If the secretary ever changes, update **both** `firestore.rules` and
> `ADMIN_EMAILS`, then redeploy the rules.

## 1. Create the admin user (once)

Firebase console → **Authentication** → *Get started* → **Users** → *Add user*:

* Email: `emdadulhoquex@gmail.com`
* Password: a strong password you control

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
  "authorEmail": "emdadulhoquex@gmail.com",
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

---

# Testing in the Arena preview

The preview serves the site over HTTPS on a public `e2b.app` URL. Your **browser**
(not the sandbox) makes the Firebase calls, so Authentication and Firestore work
normally from the preview — no tunneling or local emulator needed.

### Before you start

1. The three console steps above are done (user created, Firestore created,
   rules published).
2. `firestore.rules` contains `emdadulhoquex@gmail.com`.
3. Open the preview → **`/admin.html`**.

### Test 1 — Login works

1. Enter `emdadulhoquex@gmail.com` + the password from step 1.
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

### Test 4 — Only the admin address may write ★

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
3. **Publish Notice** → `addDoc(collection(db, 'notices'), {...})`.
4. The **×** button → `deleteDoc(doc(db, 'notices', id))`.
5. The dashboard list is an `onSnapshot()` feed of the same collection, so it
   always shows exactly what visitors see.
6. **Log out** → `signOut(auth)`; the session and the live feed are torn down.

**Public site (`index.html`)**

`onSnapshot(query(collection(db, 'notices'), orderBy('date', 'desc')))` renders
the cards inside the **Event & Notice Schedule** section (`#noticeBoardGrid`).
Cards reuse the site's existing `event-card`, `event-date-badge`, `event-meta`
and `badge` classes, and the board shows loading / empty / error states.

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
