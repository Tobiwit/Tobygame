import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, increment, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const HARDCODED_PASSWORD = "ohlala";

const firebaseConfig = {
    apiKey: "AIzaSyAP9HccB7Ri2KXobu5S1p_FJ7L6QeA2GHQ" ,
  authDomain: "tobygame-df9f1.firebaseapp.com",
  projectId: "tobygame-df9f1",
  storageBucket: "tobygame-df9f1.firebasestorage.app",
  messagingSenderId: "1070543180902",
  appId: "1:1070543180902:web:611bdb0b28e998fd7189a7",
  measurementId: "G-SGZFK0GKYT"
};

let app;
let db;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (error) {
    console.error("Firebase initialization error:", error);
}

let currentVoteQuestions = [];
let currentVoteIndex = 0;
let gameQuestions = [];
let gamePlayers = [];
let currentPlayerIndex = 0;
let playerCardsList = [];

let hasVotedInGame = false;

// Preserve game state when editing players
let isEditingPlayers = false;
let savedGameQuestions = [];
let savedPlayerIndex = 0;

function checkPassword() {
    const input = document.getElementById('passwordInput');
    const error = document.getElementById('passwordError');
    
    if (input.value === HARDCODED_PASSWORD) {
        localStorage.setItem('authorized', 'true');
        const nickname = localStorage.getItem('nickname');
        if (nickname) {
            showScreen('mainMenu');
        } else {
            showScreen('nicknameScreen');
        }
        error.textContent = '';
        input.value = '';
    } else {
        error.textContent = 'Incorrect password. Try again.';
        input.value = '';
    }
}

function setNickname() {
    const input = document.getElementById('nicknameInput');
    const error = document.getElementById('nicknameError');
    
    if (input.value.trim() !== '') {
        localStorage.setItem('nickname', input.value.trim());
        showScreen('mainMenu');
        error.textContent = '';
        input.value = '';
    } else {
        error.textContent = 'Please enter a nickname.';
        input.value = '';
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    
    if (screenId === 'voteQuestionsScreen') {
        loadVoteQuestions();
    } else if (screenId === 'seeQuestionsScreen') {
        loadAllQuestions();
    } else if (screenId === 'startGameScreen') {
        if (gamePlayers.length === 0) {
            playerCardsList = [];
        }
        renderPlayerCards();
        document.getElementById('playerNameInput').focus();
    }
}

function loadCurrentPlayersForEdit() {
    isEditingPlayers = true;
    savedGameQuestions = [...gameQuestions];
    savedPlayerIndex = currentPlayerIndex;
    playerCardsList = [...gamePlayers];
    showScreen('startGameScreen');
}

async function addQuestion() {
    const text = document.getElementById('questionText').value.trim();
    const scale = document.getElementById('scaleText').value.trim();
    const category = document.getElementById('questionCategory').value;
    const message = document.getElementById('addQuestionMessage');
    const nickname = localStorage.getItem('nickname');
    
    if (!text) {
        message.textContent = 'Please enter a question.';
        message.className = 'message error';
        return;
    }

    if (!scale) {
        message.textContent = 'Please enter a scale or leave default (1 - 10).';
        message.className = 'message error';
        return;
    }
    
    try {
        await addDoc(collection(db, 'questions'), {
            text: text,
            category: category,
            scale: scale,
            likes: 0,
            dislikes: 0,
            createdAt: new Date(),
            nickname: nickname || '???'
        });
        
        document.getElementById('questionText').value = '';
        message.textContent = '✅ Question added successfully!';
        message.className = 'message success';
        
        setTimeout(() => {
            message.textContent = '';
        }, 3000);
    } catch (error) {
        console.error("Error adding question:", error);
        message.textContent = '❌ Error adding question. Check Firebase config.';
        message.className = 'message error';
    }
}

async function loadVoteQuestions() {
    const message = document.getElementById('voteMessage');
    const voteContent = document.getElementById('voteContent');
    
    try {
        const querySnapshot = await getDocs(collection(db, 'questions'));
        currentVoteQuestions = [];
        
        querySnapshot.forEach((doc) => {
            const voted = localStorage.getItem(`voted_${doc.id}`);
            if (!voted) {
                currentVoteQuestions.push({ id: doc.id, ...doc.data() });
            }
        });
        
        currentVoteQuestions = shuffleArray(currentVoteQuestions);
        currentVoteIndex = 0;
        
        if (currentVoteQuestions.length === 0) {
            voteContent.innerHTML = '<p style="text-align: center; padding: 40px; color: #888;">No more questions to vote on!</p>';
            message.textContent = '';
        } else {
            displayCurrentVoteQuestion();
            message.textContent = '';
        }
    } catch (error) {
        console.error("Error loading questions:", error);
        message.textContent = 'Error loading questions. Failed to connected to Database';
        message.className = 'message error';
    }
}

function displayCurrentVoteQuestion() {
    const voteQuestionDiv = document.getElementById('voteQuestion');
    
    if (currentVoteIndex >= currentVoteQuestions.length) {
        document.getElementById('voteContent').innerHTML = '<p style="text-align: center; padding: 40px; color: #888;">No more questions to vote on.</p>';
        return;
    }
    
    const question = currentVoteQuestions[currentVoteIndex];
    voteQuestionDiv.innerHTML = `
        <span class="category">${question.category}</span>
        <div class="text">${question.text} ${question.scale}</div>
        <div class="votes">
            <span>👍 ${question.likes}</span>
            <span>👎 ${question.dislikes}</span>
        </div>
    `;
}

async function voteInGame(voteType) {
    const question = gameQuestions[0];
    const voteButtons = document.getElementById('gameVoteButtons');

    

    try {
        const questionRef = doc(db, 'questions', question.id);

        if (voteType === 'like') {
            await updateDoc(questionRef, {
                likes: increment(1)
            });
        } else {
            await updateDoc(questionRef, {
                dislikes: increment(1)
            });
        }
        hasVotedInGame = true;
        voteButtons.style.display = 'none';
    } catch (error) {
        console.error("Error voting:", error);
    }
    
}

async function vote(voteType) {
    if (currentVoteIndex >= currentVoteQuestions.length) {
        return;
    }
    
    const question = currentVoteQuestions[currentVoteIndex];
    const message = document.getElementById('voteMessage');

    
    
    try {
        const questionRef = doc(db, 'questions', question.id);
        
        if (voteType === 'like') {
            await updateDoc(questionRef, {
                likes: increment(1)
            });
        } else {
            await updateDoc(questionRef, {
                dislikes: increment(1)
            });
        }
        
        localStorage.setItem(`voted_${question.id}`, 'true');
        
        currentVoteIndex++;
        
        if (currentVoteIndex >= currentVoteQuestions.length) {
            document.getElementById('voteContent').innerHTML = '<p style="text-align: center; padding: 40px; color: #27ae60; font-weight: 600;">✅ All done! No more questions to vote on.</p>';
        } else {
            displayCurrentVoteQuestion();
        }
        
        message.textContent = '';
    } catch (error) {
        console.error("Error voting:", error);
        message.textContent = '❌ Error submitting vote.';
        message.className = 'message error';
    }
}

async function loadAllQuestions() {
    const questionsList = document.getElementById('questionsList');
    
    try {
        const querySnapshot = await getDocs(collection(db, 'questions'));
        const questionsByCategory = {};
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (!questionsByCategory[data.category]) {
                questionsByCategory[data.category] = [];
            }
            questionsByCategory[data.category].push(data);
        });
        
        if (Object.keys(questionsByCategory).length === 0) {
            questionsList.innerHTML = '<p style="text-align: center; padding: 40px; color: #888;">No questions yet. Add some!</p>';
            return;
        }
        
        let html = '<div class="questions-list-container">';
        
        const categories = ["🔥 Spicy","😈 Kinky","🧨 Explosive group questions","✨ Confidence","💕 Love & Dating","🥂 Party","💭 Deep / Emotional","✨ Random"];
        categories.forEach(category => {
            if (questionsByCategory[category] && questionsByCategory[category].length > 0) {
                html += `<div class="category-group">
                    <h3>${category}</h3>`;
                
                questionsByCategory[category].forEach(q => {
                    html += `<div class="question-card">
                        <div class="text">${q.text} ${q.scale}</div>
                        <div class="votes">
                            <span>👍 ${q.likes}</span>
                            <span>👎 ${q.dislikes}</span>
                        </div>
                    </div>`;
                });
                
                html += '</div>';
            }
        });
        
        html += '</div>';
        questionsList.innerHTML = html;
    } catch (error) {
        console.error("Error loading questions:", error);
        questionsList.innerHTML = '<p style="text-align: center; padding: 40px; color: #e74c3c;">❌ Error loading questions. Check Firebase config.</p>';
    }
}

function addPlayer() {
    const input = document.getElementById('playerNameInput');
    const name = input.value.trim();
    
    if (!name) {
        return;
    }
    
    if (playerCardsList.includes(name)) {
        alert('Player already added!');
        return;
    }
    
    playerCardsList.push(name);
    input.value = '';
    renderPlayerCards();
    input.focus();
}

function removePlayer(index) {
    playerCardsList.splice(index, 1);
    renderPlayerCards();
}

function renderPlayerCards() {
    const container = document.getElementById('playersList');
    container.innerHTML = '';
    
    playerCardsList.forEach((name, index) => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
            <span>${name}</span>
            <button class="remove-player-btn" onclick="removePlayer(${index})">✕</button>
        `;
        container.appendChild(card);
    });
}

async function startGame() {
    const message = document.getElementById('gameSetupMessage');
    
    if (playerCardsList.length === 0) {
        message.textContent = 'Please add at least one player.';
        message.className = 'message error';
        return;
    }
    
    gamePlayers = [...playerCardsList];
    
    if (gamePlayers.length === 0) {
        message.textContent = 'Please enter valid player names.';
        message.className = 'message error';
        return;
    }
    
    try {
        // --- USAGE TRACKING START ---
        if (!isEditingPlayers) {
            const nickname = localStorage.getItem('nickname') || 'Anonymous';
            await addDoc(collection(db, 'usage'), {
                nickname: nickname,
                playerCount: gamePlayers.length,
                playerNames: gamePlayers,
                createdAt: new Date()
            });
        }
        // --- USAGE TRACKING END ---
        // If editing players, preserve the question stack and position
        if (isEditingPlayers) {
            isEditingPlayers = false;
            gameQuestions = [...savedGameQuestions];
            currentPlayerIndex = savedPlayerIndex;
        } else {
            // Starting fresh game - load new questions
            const querySnapshot = await getDocs(collection(db, 'questions'));
            gameQuestions = [];
            
            querySnapshot.forEach((doc) => {
                gameQuestions.push({ id: doc.id, ...doc.data() });
            });
            
            if (gameQuestions.length === 0) {
                message.textContent = 'No questions available. Add some first!';
                message.className = 'message error';
                return;
            }
            
            gamePlayers = shuffleArray(gamePlayers);
            gameQuestions = weightedShuffleQuestions(gameQuestions);
            currentPlayerIndex = 0;
        }
        
        showScreen('gameScreen');
        displayGameQuestion();
    } catch (error) {
        console.error("Error loading game questions:", error);
        message.textContent = 'Error loading questions. Couldnt connect to Database';
        message.className = 'message error';
    }
}

function displayGameQuestion() {
    if (gameQuestions.length === 0) {
        document.getElementById('gameQuestion').innerHTML = '<p style="color: #888;">No more questions! Game over.</p>';
        document.getElementById('gameVoteButtons').style.display = 'none';
        return;
    }
    
    const player = gamePlayers[currentPlayerIndex];
    const question = gameQuestions[0];
    
    document.getElementById('currentPlayer').textContent = player;
    
    // Find or create the question content div (but NOT the vote buttons)
    let questionContent = document.querySelector('#gameQuestion > .question-content');
    if (!questionContent) {
        questionContent = document.createElement('div');
        questionContent.className = 'question-content';
        // Insert after the vote bubbles
        document.getElementById('gameQuestion').insertBefore(questionContent, document.getElementById('gameVoteButtons').nextSibling);
    }
    
    questionContent.innerHTML = `
        <span class="category">${question.category}</span>
        <div style="margin-top: 15px;">${question.text} ${question.scale}</div>
    `;
    
    const voteButtons = document.getElementById('gameVoteButtons');
    if (hasVotedInGame) {
        voteButtons.style.display = 'none';
    } else {
        voteButtons.style.display = 'block';
    }
}

function nextQuestion() {
    if (gameQuestions.length > 0) {
        gameQuestions.shift();
    }
    
    currentPlayerIndex = (currentPlayerIndex + 1) % gamePlayers.length;
    hasVotedInGame = false;

    const skipBtn = document.querySelector('.skip-btn');
    skipBtn.style.display = 'block';
    
    // Reset chaos modifier
    const chaosBtn = document.querySelector('.chaos-btn');
    const chaosCard = document.getElementById('chaosModifierCard');
    chaosBtn.style.display = 'block';
    chaosCard.style.display = 'none';

    displayGameQuestion();
}

function skipQuestion() {
    if (gameQuestions.length > 0) {
        gameQuestions.shift();
    }
    
    hasVotedInGame = false;
    document.querySelector('.skip-btn').style.display = 'none';
    
    // Reset chaos modifier
    const chaosBtn = document.querySelector('.chaos-btn');
    const chaosCard = document.getElementById('chaosModifierCard');
    chaosBtn.style.display = 'block';
    chaosCard.style.display = 'none';
    
    displayGameQuestion();
}

function endGame() {
    gameQuestions = [];
    gamePlayers = [];
    currentPlayerIndex = 0;
    //document.getElementById('playerNames').value = '';
    showScreen('mainMenu');
}

function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

function weightedShuffleQuestions(questions) {
    const questionsWithWeights = questions.map(q => {
        const likes = q.likes || 0;
        const dislikes = q.dislikes || 0;
        const totalVotes = likes + dislikes;
        
        let weight;
        if (totalVotes === 0) {
            weight = 1;
        } else {
            const ratio = likes / totalVotes;
            weight = Math.pow(ratio + 0.1, 2);
        }
        
        return { question: q, weight: weight };
    });
    
    const weightedList = [];
    questionsWithWeights.forEach(item => {
        const count = Math.max(1, Math.round(item.weight * 10));
        for (let i = 0; i < count; i++) {
            weightedList.push(item.question);
        }
    });
    
    const shuffled = shuffleArray(weightedList);
    
    const uniqueQuestions = [];
    const seenIds = new Set();
    
    for (const q of shuffled) {
        if (!seenIds.has(q.id)) {
            uniqueQuestions.push(q);
            seenIds.add(q.id);
        }
    }
    
    return uniqueQuestions;
}

async function gameVote(voteType) {
    if (gameQuestions.length === 0) {
        return;
    }
    
    const question = gameQuestions[0];
    const message = document.getElementById('gameVoteMessage');
    
    const hasVoted = localStorage.getItem(`voted_${question.id}`);
    if (hasVoted) {
        message.textContent = 'You already voted on this question!';
        message.className = 'message error';
        setTimeout(() => {
            message.textContent = '';
        }, 2000);
        return;
    }
    
    try {
        const questionRef = doc(db, 'questions', question.id);
        
        if (voteType === 'like') {
            await updateDoc(questionRef, {
                likes: increment(1)
            });
            question.likes = (question.likes || 0) + 1;
        } else {
            await updateDoc(questionRef, {
                dislikes: increment(1)
            });
            question.dislikes = (question.dislikes || 0) + 1;
        }
        
        localStorage.setItem(`voted_${question.id}`, 'true');
        
        message.textContent = '✅ Vote recorded!';
        message.className = 'message success';
        
        document.getElementById('gameVoteButtons').style.display = 'none';
        
        setTimeout(() => {
            message.textContent = '';
        }, 2000);
    } catch (error) {
        console.error("Error voting:", error);
        message.textContent = '❌ Error submitting vote.';
        message.className = 'message error';
    }
}

const CHAOS_MODIFIERS = [
    "Everyone picks the number for the person on their left",
    "Everyone picks the number for the person on their right",
    "Everyone picks the number for the question asker",
    "All players put their card in sequence from highest to lowest",
    "Everyone answers for [RandomPlayer]",
    "Everyone answers for [RandomPlayer]",
    "[RandomPlayer] answers twice and lies about one answer",
    "The person on your right can change your answer if they don't agree",
    "Answer how you think the group would rate you",
    "First person you assign is worth three sips",
    "Answer what your parents would answer for you",
    "Answer what your Ex would answer for you",
];

function toggleChaosModifier() {
    const card = document.getElementById('chaosModifierCard');
    const btn = event.target.closest('.chaos-btn');
    const text = document.getElementById('chaosModifierText');
    
    // Generate modifier with random player names
    let randomModifier = CHAOS_MODIFIERS[Math.floor(Math.random() * CHAOS_MODIFIERS.length)];
    
    // Replace placeholder text with actual random player
    randomModifier = randomModifier.replace('[RandomPlayer]', getRandomPlayer());
    
    text.textContent = randomModifier;
    btn.style.display = 'none';
    card.style.display = 'block';
}

function getRandomPlayer() {
    if (gamePlayers.length === 0) return 'Player';
    
    const availablePlayers = gamePlayers.filter((_, index) => index !== currentPlayerIndex);
    
    if (availablePlayers.length === 0) return gamePlayers[currentPlayerIndex];
    
    return availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
}

window.checkPassword = checkPassword;
window.setNickname = setNickname;
window.showScreen = showScreen;
window.addQuestion = addQuestion;
window.vote = vote;
window.gameVote = gameVote;
window.startGame = startGame;
window.nextQuestion = nextQuestion;
window.skipQuestion = skipQuestion;
window.endGame = endGame;
window.voteInGame = voteInGame;
window.toggleChaosModifier = toggleChaosModifier;
window.getRandomPlayer = getRandomPlayer;
window.addPlayer = addPlayer;
window.removePlayer = removePlayer;
window.loadCurrentPlayersForEdit = loadCurrentPlayersForEdit;

window.addEventListener('DOMContentLoaded', () => {
    const authorized = localStorage.getItem('authorized');
    const nickname = localStorage.getItem('nickname');
    if (authorized === 'true') {
        if (nickname) {
            showScreen('mainMenu');
        } else {
            showScreen('nicknameScreen');
        }
        
    } else {
        showScreen('passwordScreen');
    }
    
    // Add Enter key support for player input
    const playerInput = document.getElementById('playerNameInput');
    if (playerInput) {
        playerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addPlayer();
            }
        });
    }
});
