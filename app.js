import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const HARDCODED_PASSWORD = "pineapple";

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
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

function checkPassword() {
    const input = document.getElementById('passwordInput');
    const error = document.getElementById('passwordError');
    
    if (input.value === HARDCODED_PASSWORD) {
        localStorage.setItem('authorized', 'true');
        showScreen('mainMenu');
        error.textContent = '';
        input.value = '';
    } else {
        error.textContent = 'Incorrect password. Try again.';
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
    }
}

async function addQuestion() {
    const text = document.getElementById('questionText').value.trim();
    const category = document.getElementById('questionCategory').value;
    const message = document.getElementById('addQuestionMessage');
    
    if (!text) {
        message.textContent = 'Please enter a question.';
        message.className = 'message error';
        return;
    }
    
    try {
        await addDoc(collection(db, 'questions'), {
            text: text,
            category: category,
            likes: 0,
            dislikes: 0,
            createdAt: new Date()
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
        message.textContent = '❌ Error loading questions. Check Firebase config.';
        message.className = 'message error';
    }
}

function displayCurrentVoteQuestion() {
    const voteQuestionDiv = document.getElementById('voteQuestion');
    
    if (currentVoteIndex >= currentVoteQuestions.length) {
        document.getElementById('voteContent').innerHTML = '<p style="text-align: center; padding: 40px; color: #888;">All done! No more questions to vote on.</p>';
        return;
    }
    
    const question = currentVoteQuestions[currentVoteIndex];
    voteQuestionDiv.innerHTML = `
        <span class="category">${question.category}</span>
        <div class="text">${question.text}</div>
        <div class="votes">
            <span>👍 ${question.likes}</span>
            <span>👎 ${question.dislikes}</span>
        </div>
    `;
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
                likes: question.likes + 1
            });
        } else {
            await updateDoc(questionRef, {
                dislikes: question.dislikes + 1
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
        
        const categories = ['Funny', 'Truth', 'Dare', 'Personal'];
        categories.forEach(category => {
            if (questionsByCategory[category] && questionsByCategory[category].length > 0) {
                html += `<div class="category-group">
                    <h3>${category}</h3>`;
                
                questionsByCategory[category].forEach(q => {
                    html += `<div class="question-card">
                        <div class="text">${q.text}</div>
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

async function startGame() {
    const playersInput = document.getElementById('playerNames').value.trim();
    const message = document.getElementById('gameSetupMessage');
    
    if (!playersInput) {
        message.textContent = 'Please enter at least one player name.';
        message.className = 'message error';
        return;
    }
    
    gamePlayers = playersInput.split(',').map(name => name.trim()).filter(name => name);
    
    if (gamePlayers.length === 0) {
        message.textContent = 'Please enter valid player names.';
        message.className = 'message error';
        return;
    }
    
    try {
        const querySnapshot = await getDocs(collection(db, 'questions'));
        gameQuestions = [];
        
        querySnapshot.forEach((doc) => {
            gameQuestions.push(doc.data());
        });
        
        if (gameQuestions.length === 0) {
            message.textContent = 'No questions available. Add some first!';
            message.className = 'message error';
            return;
        }
        
        gamePlayers = shuffleArray(gamePlayers);
        gameQuestions = shuffleArray(gameQuestions);
        currentPlayerIndex = 0;
        
        showScreen('gameScreen');
        displayGameQuestion();
    } catch (error) {
        console.error("Error loading game questions:", error);
        message.textContent = '❌ Error loading questions. Check Firebase config.';
        message.className = 'message error';
    }
}

function displayGameQuestion() {
    if (gameQuestions.length === 0) {
        document.getElementById('gameQuestion').innerHTML = '<p style="color: #888;">No more questions! Game over.</p>';
        return;
    }
    
    const player = gamePlayers[currentPlayerIndex];
    const question = gameQuestions[0];
    
    document.getElementById('currentPlayer').textContent = player;
    document.getElementById('gameQuestion').innerHTML = `
        <span class="category">${question.category}</span>
        <div style="margin-top: 15px;">${question.text}</div>
    `;
}

function nextQuestion() {
    if (gameQuestions.length > 0) {
        gameQuestions.shift();
    }
    
    currentPlayerIndex = (currentPlayerIndex + 1) % gamePlayers.length;
    displayGameQuestion();
}

function skipQuestion() {
    currentPlayerIndex = (currentPlayerIndex + 1) % gamePlayers.length;
    displayGameQuestion();
}

function endGame() {
    gameQuestions = [];
    gamePlayers = [];
    currentPlayerIndex = 0;
    document.getElementById('playerNames').value = '';
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

window.checkPassword = checkPassword;
window.showScreen = showScreen;
window.addQuestion = addQuestion;
window.vote = vote;
window.startGame = startGame;
window.nextQuestion = nextQuestion;
window.skipQuestion = skipQuestion;
window.endGame = endGame;

window.addEventListener('DOMContentLoaded', () => {
    const authorized = localStorage.getItem('authorized');
    if (authorized === 'true') {
        showScreen('mainMenu');
    } else {
        showScreen('passwordScreen');
    }
});
