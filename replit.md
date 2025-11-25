# Question Game App

## Overview

A mobile-optimized web application for playing a multiplayer question-based game. Users can collaboratively add questions to a shared database, vote on questions, and play a local turn-based game where players answer randomly selected questions. The app features password-protected access and uses Firebase Firestore for real-time question storage and voting.

## Recent Changes (November 25, 2025)

- Initial implementation of complete question game app
- All features implemented: password gate, add questions, vote questions, see questions, start game
- Fixed vote race condition by using Firebase atomic increment() operator for concurrent voting
- Mobile-first responsive design with gradient background and card-based UI
- Single-page app architecture with smooth screen transitions

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Single Page Application (SPA) with Screen-based Navigation**
- Uses vanilla JavaScript with ES6+ modules for client-side logic
- Screen management system that shows/hides different views without page reloads
- Each feature (password gate, add question, voting, game play) exists as a separate screen div
- CSS animations provide smooth transitions between screens
- Mobile-first responsive design using CSS3

**Rationale**: Lightweight vanilla JS approach keeps the app fast and dependency-free, ideal for a simple game application. Screen-based navigation provides a native app-like experience on mobile devices.

### Authentication & Authorization

**Password Gate with Local Storage**
- Single hardcoded password (`"pineapple"`) validates all users
- Authorization state stored in browser's localStorage
- No user accounts or individual authentication
- Password screen is the default entry point

**Rationale**: Simple shared-password approach is sufficient for a casual game among friends. Avoids complexity of user management while providing basic access control.

### Data Storage & State Management

**Hybrid Storage Strategy**
- **Firebase Firestore**: Persistent storage for questions, categories, and vote counts
- **Local JavaScript Variables**: Temporary game state (player list, current turn, question order)
- **Browser localStorage**: Authorization persistence

**Firestore Schema**:
```
questions/
  {documentId}/
    - text: string
    - category: string (Funny|Truth|Dare|Personal)
    - likes: number
    - dislikes: number
    - timestamp: server timestamp
```

**Rationale**: Firestore enables real-time collaboration on question database across multiple devices, while local storage handles ephemeral game sessions that don't need persistence.

### Game Logic Architecture

**Client-Side Game Engine**
- Players entered locally (not stored in database)
- Questions fetched from Firestore and shuffled client-side
- Turn-based progression tracked with index counters
- No server-side game state or multiplayer synchronization

**Vote Tracking**:
- Vote counts stored in Firestore with atomic increment operations
- Client-side prevention of double voting (session-based, not persistent)
- Questions sorted by vote ratio for quality filtering

**Rationale**: Fully client-side game logic eliminates server costs and latency. Each game session is independent, allowing multiple groups to play simultaneously without interference.

### UI/UX Design Patterns

**Mobile-First Responsive Design**
- Touch-friendly button sizes and spacing
- Gradient background with card-based content layout
- Emoji icons for visual clarity and fun
- Fade-in animations for screen transitions

**Screen Flow**:
1. Password Gate → Main Menu
2. Main Menu → (Add Question | Vote Questions | See Questions | Start Game)
3. Each feature screen has a "Back" button to Main Menu

## External Dependencies

### Firebase Firestore (v10.7.1)
- **Purpose**: Real-time NoSQL database for question storage and voting
- **Integration**: ES6 module imports from CDN
- **Collections**: `questions` collection with automatic document IDs
- **Operations**: 
  - `addDoc()` for creating questions
  - `getDocs()` with `query()` and `orderBy()` for retrieving questions
  - `updateDoc()` with `increment()` for atomic vote counting

**Configuration Required**: 
- Firebase project must be created in Firebase Console
- Firestore must be enabled
- Config object in `app.js` must be updated with project credentials:
  - apiKey
  - authDomain
  - projectId
  - storageBucket
  - messagingSenderId
  - appId

### No Additional Dependencies
- No frontend frameworks (React, Vue, etc.)
- No build tools or bundlers required
- No backend server or API layer
- No CSS frameworks

**Rationale**: Zero-dependency approach (except Firebase) ensures maximum simplicity, fast load times, and easy deployment on any static hosting platform including Replit.