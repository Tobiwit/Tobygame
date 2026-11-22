# Question Game App

A mobile-optimized web app for playing a question-based game with friends. Features Firebase Firestore integration for shared questions and local game logic.

## Features

- **Password Gate**: Secure access with hardcoded password ("pineapple")
- **Add Questions**: Submit questions with categories (Funny, Truth, Dare, Personal)
- **Vote on Questions**: Like or dislike questions (prevents double voting)
- **View All Questions**: Browse questions sorted by category
- **Start Game**: Local multiplayer game with shuffled players and questions

## Firebase Setup

Before using the app, you need to configure Firebase:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use an existing one
3. Enable Firestore Database
4. Get your Firebase config from Project Settings
5. Open `app.js` and replace the placeholder values in `firebaseConfig`:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

6. In Firestore, create a collection named `questions` (it will be created automatically when you add your first question)

## Admin, notifications and security

Players never log in: the app signs every device in anonymously in the background.
The admin (you) signs in with email + password on a hidden screen: **long-press the logo on the main menu**.
`firestore.rules` enforces everything, including rate limits (one question per 15 s, one feedback per 30 s,
one game log per 10 s per device) and admin-only reading of `usage` and `feedback`.

Push notifications (new game, new question, new feedback) go to the admin's devices only, via the
Vercel function `api/notify.js` and Web Push. No Firebase Cloud Functions or Blaze plan needed.

One-time setup:

1. **Firebase console → Authentication → Sign-in method**: enable **Anonymous** and **Email/Password**.
2. **Authentication → Users → Add user**: your email + a password. Copy its **User UID**.
3. In `firestore.rules`, replace `ADMIN_UID` with that UID.
4. **Project settings → Service accounts → Generate new private key.** Keep the JSON file private.
5. **Vercel → Project → Settings → Environment Variables**, add:
   - `FIREBASE_SERVICE_ACCOUNT`: the whole JSON from step 4, on one line
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: from your local `.env.local` (never committed)
6. Push to GitHub so Vercel deploys, **then** publish the rules (Firestore → Rules → paste → Publish).
7. On your phone: open Tobygame **from the Home Screen**, long-press the logo, sign in, tap **Turn on** under Notifications.

## Usage

1. Enter the password: `pineapple`
2. Choose an option from the main menu
3. Add questions or vote on existing ones
4. Start a game with friends by entering player names

## Technologies

- Vanilla HTML5
- CSS3 (mobile-first responsive design)
- Vanilla JavaScript (ES6+)
- Firebase Firestore (v10)

## Password

Default password: `pineapple`

To change it, modify the `HARDCODED_PASSWORD` constant in `app.js`.
