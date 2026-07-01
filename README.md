# Attendance Tracker

Mobile-first attendance tracker for two classes (IPE & ME). Single static site, no server, no build step. It saves locally first, can be installed as a PWA, and can optionally sync saved sessions through Firebase Firestore.

## Files

- `index.html` - app shell and styling
- `data.js` - pre-loaded rosters
- `app.js` - views, local storage, PWA registration, optional Firestore sync
- `firebase-config.js` - paste your Firebase project config here
- `manifest.webmanifest`, `sw.js`, `icon.svg` - PWA install/offline shell

## Local-Only Mode

The app works immediately with no Firebase setup. Data is stored in the current browser with `localStorage`; use **More > Backup all (JSON)** regularly.

## Firebase + PWA Setup

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Add a Web app in Firebase Project settings and copy the Firebase config object.
3. Enable **Authentication > Sign-in method > Google** (and optionally Email/Password).
4. In **Authentication > Settings > Authorized domains**, add your hosted domain (e.g. `yourusername.github.io`).
5. Create a **Firestore Database** in production mode.
6. In Firestore **Rules**, set the allowed email:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /attendanceTrackers/{docId} {
      allow read, write: if request.auth != null
        && request.auth.token.email == "abushaidsujondtu@gmail.com"
        && docId == "iut-attendance";
    }
  }
}
```

7. Paste your Firebase config into `firebase-config.js`:

```js
window.FIREBASE_CONFIG = {
  apiKey: "PASTE",
  authDomain: "PASTE",
  projectId: "PASTE",
  storageBucket: "PASTE",
  messagingSenderId: "PASTE",
  appId: "PASTE"
};

window.FIREBASE_ATTENDANCE_DOC_ID = "iut-attendance";
window.FIREBASE_REQUIRE_AUTH = true;
```

7. Host the folder on GitHub Pages.
8. Open the Pages URL on your phone.
9. Go to **More > Cloud sync**, create/sign in with the allowed email, then save attendance normally.
10. Use your phone browser's **Add to Home Screen** option to install it.

## Host on GitHub Pages

1. Push this folder to a GitHub repo.
2. Settings -> Pages -> Source: `main` branch, root `/`.
3. Open the published URL on your phone.

## Notes

- `firebase-config.js` is not a password. Firestore security rules protect the data.
- Do not use public Firestore rules like `allow read, write: if true` for this app.
- Firestore sync is optional. If Firebase is not configured, the app stays local-only.
- Firestore web offline persistence works after the Firebase SDK has loaded at least once online.

## Cloud Sync Troubleshooting

If the app shows a cloud sync error:

1. Deploy the latest files first. The service worker caches the app, so old phone builds can keep running until `sw.js` changes and the page is refreshed.
2. In Firebase Console, check **Authentication > Users** and confirm the signed-in email exactly matches your Firestore rule.
3. In **Authentication > Sign-in method**, confirm **Email/Password** is enabled.
4. In **Authentication > Settings > Authorized domains**, add your hosted domain, such as `yourusername.github.io`.
5. In **Firestore Database > Rules**, confirm you clicked **Publish**.
6. In **Firestore Database > Data**, confirm the document path is `attendanceTrackers/iut-attendance`.
7. In the app, go to **More > Cloud sync > Retry** after fixing Firebase settings.
8. If it still fails, tap **Copy info** in the Cloud sync sheet and paste that diagnostic text into the chat.
