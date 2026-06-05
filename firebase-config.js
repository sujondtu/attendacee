// Firebase web app config.
// This is public client config. Firestore security rules protect the data.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDV00e9x1P1KAMAuq335iLVmhCYXV9TuHU",
  authDomain: "attendance-65289.firebaseapp.com",
  projectId: "attendance-65289",
  storageBucket: "attendance-65289.firebasestorage.app",
  messagingSenderId: "190541186089",
  appId: "1:190541186089:web:e8ea4a5379775edf1bc838"
};

// Change this if you want separate cloud documents for separate courses/apps.
window.FIREBASE_ATTENDANCE_DOC_ID = "iut-attendance";

// Keep this true for a private attendance app. Enable Google sign-in
// in Firebase Authentication before turning on Firestore sync.
window.FIREBASE_REQUIRE_AUTH = true;

// Only this Google account is allowed to sign in and sync.
window.FIREBASE_ALLOWED_EMAIL = "abushaidsujondtu@gmail.com";
