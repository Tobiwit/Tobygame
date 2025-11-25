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
