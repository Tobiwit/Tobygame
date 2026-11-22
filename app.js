import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    getFirestore, collection, getDocs, doc, updateDoc, increment, writeBatch, serverTimestamp,
    setDoc, deleteDoc, query, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
    getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const HARDCODED_PASSWORD = "ohlala";

const firebaseConfig = {
    apiKey: "AIzaSyAP9HccB7Ri2KXobu5S1p_FJ7L6QeA2GHQ",
    authDomain: "tobygame-df9f1.firebaseapp.com",
    projectId: "tobygame-df9f1",
    storageBucket: "tobygame-df9f1.firebasestorage.app",
    messagingSenderId: "1070543180902",
    appId: "1:1070543180902:web:611bdb0b28e998fd7189a7",
    measurementId: "G-SGZFK0GKYT"
};

// Web Push public key. Public by design; the private half lives only in Vercel's env vars.
const VAPID_PUBLIC_KEY = 'BMeTGvgN90OweDa-hi8jNRj0YAmxa91RRKTGkZID8j2kyYKXsjpxqsrh58OhYOB61ilP4P8OrS5LgBFGxrVZY94';

let app;
let db;
let auth;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (error) {
    console.error("Firebase initialization error:", error);
}

/* =========================================================
   Sign-in
   Friends are signed in anonymously and silently: no screen, no password.
   The admin signs in with email + password on the hidden admin screen.
   Firestore rules decide what each can do.
   ========================================================= */
let currentUser = null;
let resolveAuthReady;
const authReady = new Promise(r => { resolveAuthReady = r; });
// Never block the app on sign-in for more than a few seconds.
setTimeout(() => resolveAuthReady(null), 6000);

function setupAuth() {
    if (!auth) { resolveAuthReady(null); return; }
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (user) {
            resolveAuthReady(user);
        } else {
            signInAnonymously(auth).catch((error) => {
                console.error('Anonymous sign-in failed:', error);
                resolveAuthReady(null);
            });
        }
        updateAdminUi();
    });
}

const isAdminUser = () => !!currentUser && !currentUser.isAnonymous;

/**
 * Create a document and stamp the caller's rate-limit doc in the same write.
 * The rules only accept the create if the previous stamp is old enough.
 */
async function createLogged(col, data, stamp) {
    await authReady;
    const ref = doc(collection(db, col));
    const batch = writeBatch(db);
    batch.set(ref, { ...data, createdAt: serverTimestamp() });
    if (currentUser) {
        batch.set(doc(db, 'limits', currentUser.uid), { [stamp]: serverTimestamp() }, { merge: true });
    }
    await batch.commit();
    notifyAdmin(stamp, ref.id);
    return ref;
}

/** Ask the Vercel function to push this to the admin. Fire and forget. */
function notifyAdmin(type, id) {
    if (!currentUser) return;
    currentUser.getIdToken()
        .then(token => fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ type, id }),
            keepalive: true,
        }))
        .catch(() => {});
}

const isRateLimited = (error) => error?.code === 'permission-denied';

/* =========================================================
   Colour themes
   c = field colour, c2/c3 = glow colours, on = text on the field
   ========================================================= */
// Flat cobalt field with a tangerine accent for primary buttons.
const BRAND = { name: 'brand', c: '#1E4FFF', c2: '#1E4FFF', c3: '#1E4FFF', on: '#ffffff', accent: '#F25C00', accentOn: '#ffffff' };

// Player palette, ordered so neighbouring players never look alike.
const PALETTE = [
    { name: 'tangerine',   c: '#F25C00', c2: '#FFC300', c3: '#FF3D00', on: '#ffffff' },
    { name: 'ultraviolet', c: '#5A33F0', c2: '#1EC8FF', c3: '#7B2CF5', on: '#ffffff' },
    { name: 'bubblegum',   c: '#E81E76', c2: '#FF9A3C', c3: '#C8106A', on: '#ffffff' },
    { name: 'jungle',      c: '#0C9F58', c2: '#C6F432', c3: '#067F55', on: '#ffffff' },
    { name: 'electric',    c: '#1769FF', c2: '#2BE3F2', c3: '#3A3CF0', on: '#ffffff' },
    { name: 'sunshine',    c: '#FFC21A', c2: '#FFF27A', c3: '#FF9500', on: '#1F1604', deep: '#7A5000' },
    { name: 'cherry',      c: '#E42232', c2: '#FF8A00', c3: '#B80F2C', on: '#ffffff' },
    { name: 'lagoon',      c: '#00968F', c2: '#7CF0C8', c3: '#00718F', on: '#ffffff' },
    { name: 'grape',       c: '#9230E0', c2: '#FF5FCB', c3: '#6A1FD0', on: '#ffffff' },
    { name: 'lime',        c: '#7ACC12', c2: '#E8FF5A', c3: '#2FA83A', on: '#13200A', deep: '#3B6A00' },
];

const THEMES = Object.fromEntries([BRAND, ...PALETTE].map(t => [t.name, t]));

const CATEGORIES = [
    { value: '🔥 Spicy', theme: 'cherry' },
    { value: '😈 Kinky', theme: 'grape' },
    { value: '🧨 Explosive group questions', theme: 'tangerine' },
    { value: '✨ Confidence', theme: 'sunshine' },
    { value: '💕 Love & Dating', theme: 'bubblegum' },
    { value: '🥂 Party', theme: 'lagoon' },
    { value: '💭 Deep / Emotional', theme: 'electric' },
    { value: '✨ Random', theme: 'ultraviolet' },
];

const themeMeta = document.querySelector('meta[name="theme-color"]');

function applyTheme(theme) {
    const t = theme || BRAND;
    const root = document.documentElement.style;
    root.setProperty('--c', t.c);
    root.setProperty('--c2', t.c2);
    root.setProperty('--c3', t.c3);
    root.setProperty('--on', t.on);
    root.setProperty('--accent', t.accent || t.c);
    root.setProperty('--accent-on', t.accentOn || t.on);
    root.setProperty('--deep', t.deep || 'color-mix(in oklab, var(--c) 74%, #000)');
    if (themeMeta) themeMeta.setAttribute('content', t.c);
}

/* =========================================================
   Menu halftone field
   The dots sit on a fixed offset (45°) grid and never move. Four invisible
   colour blobs drift over it on slow Lissajous paths; each dot's size is
   set by the strongest blob over it, so dots swell as a blob arrives and
   shrink away as it leaves. Drawn on a canvas, only while the menu is open.
   ========================================================= */
const DOT_CELL = 9;      // grid spacing in CSS px
const DOT_SCALE = 0.36;  // max dot radius as a share of the spacing (< .5 keeps gaps)

// x / y: rest position as a share of the hero; ax / ay: drift in px; px / py: seconds per swing
const FIELD_BLOBS = [
    { color: '#F25C00', r: 120, x: 0.10, y: 0.12, ax: 70, ay: 50, px: 18, py: 23, phase: 0 },
    { color: '#FFC21A', r: 85,  x: 0.90, y: 0.90, ax: 60, ay: 45, px: 22, py: 17, phase: 2 },
    { color: '#E81E76', r: 65,  x: 0.22, y: 0.78, ax: 55, ay: 40, px: 16, py: 21, phase: 4 },
    { color: '#2BE3F2', r: 55,  x: 0.78, y: 0.20, ax: 50, ay: 55, px: 20, py: 15, phase: 1 },
];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const dotField = { canvas: null, ctx: null, w: 0, h: 0, dpr: 1, raf: 0, start: performance.now() };

function drawDotField(now) {
    const { ctx, w, h, dpr } = dotField;
    if (!ctx || !w || !h) return;
    const time = reduceMotion.matches ? 4 : (now - dotField.start) / 1000;
    const TAU = Math.PI * 2;

    const blobs = FIELD_BLOBS.map(b => {
        const pulse = 0.88 + 0.12 * Math.sin(time * TAU / (b.px * 0.8) + b.phase * 1.7);
        return {
            x: b.x * w + Math.sin(time * TAU / b.px + b.phase) * b.ax,
            y: b.y * h + Math.sin(time * TAU / b.py + b.phase * 1.3) * b.ay,
            r: b.r * pulse,
        };
    });
    const paths = FIELD_BLOBS.map(() => new Path2D());

    const rows = Math.ceil(h / DOT_CELL) + 1;
    const cols = Math.ceil(w / DOT_CELL) + 1;
    for (let row = 0; row < rows; row++) {
        const cy = row * DOT_CELL + DOT_CELL / 2;
        const shift = row % 2 ? DOT_CELL / 2 : 0;
        for (let col = -1; col < cols; col++) {
            const cx = col * DOT_CELL + DOT_CELL / 2 + shift;
            let best = 0;
            let owner = -1;
            for (let i = 0; i < blobs.length; i++) {
                const b = blobs[i];
                const dx = cx - b.x;
                const dy = cy - b.y;
                const d2 = dx * dx + dy * dy;
                if (d2 >= b.r * b.r) continue;
                const t = Math.pow(1 - Math.sqrt(d2) / b.r, 1.3);
                if (t > best) { best = t; owner = i; }
            }
            if (owner < 0) continue;
            const rad = Math.sqrt(best) * DOT_CELL * DOT_SCALE;
            if (rad < 0.3) continue;
            paths[owner].moveTo(cx + rad, cy);
            paths[owner].arc(cx, cy, rad, 0, TAU);
        }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    paths.forEach((path, i) => {
        ctx.fillStyle = FIELD_BLOBS[i].color;
        ctx.fill(path);
    });
}

function menuIsOpen() {
    return $('mainMenu')?.classList.contains('active') && !document.hidden;
}

function tickDotField(now) {
    if (!menuIsOpen()) { dotField.raf = 0; return; }
    drawDotField(now);
    dotField.raf = requestAnimationFrame(tickDotField);
}

function startDotField() {
    if (!dotField.ctx) return;
    if (reduceMotion.matches) { drawDotField(performance.now()); return; }
    if (!dotField.raf && menuIsOpen()) dotField.raf = requestAnimationFrame(tickDotField);
}

function setupDotField() {
    const canvas = $('dotField');
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return;
    dotField.canvas = canvas;
    dotField.ctx = ctx;

    const resize = () => {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        dotField.dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
        dotField.w = rect.width;
        dotField.h = rect.height;
        canvas.width = Math.round(rect.width * dotField.dpr);
        canvas.height = Math.round(rect.height * dotField.dpr);
        drawDotField(performance.now());
        canvas.classList.add('ready');
        startDotField();
    };
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', startDotField);
    reduceMotion.addEventListener?.('change', startDotField);
}

/* =========================================================
   Helpers
   ========================================================= */
const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
}

function initialOf(name) {
    const first = Array.from(String(name).trim())[0] || '?';
    return first.toUpperCase();
}

function icon(id) {
    return `<svg class="i"><use href="#i-${id}"/></svg>`;
}

function replayAnimation(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
}

// Shrink a display heading until no single word overflows and it fits in maxLines.
function fitText(el, max, min, maxLines = 2) {
    if (!el) return;
    let size = max;
    el.style.fontSize = size + 'px';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) / size || 0.9;
    while (size > min && (el.scrollWidth > el.clientWidth + 1 || el.offsetHeight > size * lineHeight * maxLines + 4)) {
        size -= 2;
        el.style.fontSize = size + 'px';
    }
}

function lsGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
function lsRemove(key) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

function flash(el, text, type, ms = 3000) {
    el.textContent = text;
    el.className = `message ${type}`;
    clearTimeout(el._t);
    if (ms) el._t = setTimeout(() => { el.textContent = ''; }, ms);
}

/* =========================================================
   State
   ========================================================= */
let currentVoteQuestions = [];
let currentVoteIndex = 0;
let gameQuestions = [];
let gamePlayers = [];
let currentPlayerIndex = 0;
let playerCardsList = [];
let playerColors = {}; // player name -> PALETTE index

let hasVotedInGame = false;
let skipUsedThisTurn = false;
let chaosActive = false;

// Preserve game state when editing players
let isEditingPlayers = false;
let savedGameQuestions = [];
let savedPlayerIndex = 0;

/* =========================================================
   Player colours
   ========================================================= */
function usedColorIndexes(except) {
    return new Set(playerCardsList.filter(n => n !== except).map(n => playerColors[n]));
}

function freeColorIndex(except) {
    const used = usedColorIndexes(except);
    const free = PALETTE.findIndex((_, i) => !used.has(i));
    return free >= 0 ? free : playerCardsList.length % PALETTE.length;
}

function assignColor(name) {
    const existing = playerColors[name];
    if (existing !== undefined && !usedColorIndexes(name).has(existing)) return;
    playerColors[name] = freeColorIndex(name);
}

function colorFor(name) {
    return PALETTE[playerColors[name] ?? 0];
}

function playerVars(name) {
    const p = colorFor(name);
    return `--pc:${p.c};--pc2:${p.c2};--pc-on:${p.on}`;
}

/* =========================================================
   Navigation
   ========================================================= */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const screen = $(screenId);
    screen.classList.add('active');

    const themeName = screen.dataset.theme;
    if (themeName) applyTheme(THEMES[themeName]);

    if (screenId === 'mainMenu') {
        renderGreeting();
        startDotField();
        updateInstallLink();
        maybeShowInstallHint();
    } else if (screenId === 'voteQuestionsScreen') {
        loadVoteQuestions();
    } else if (screenId === 'seeQuestionsScreen') {
        loadAllQuestions();
    } else if (screenId === 'tutorialScreen') {
        renderTutorialStep(false);
    } else if (screenId === 'adminScreen') {
        renderAdminState();
    } else if (screenId === 'startGameScreen') {
        if (gamePlayers.length === 0 && !isEditingPlayers) {
            playerCardsList = [];
            playerColors = {};
        }
        $('gameSetupMessage').textContent = '';
        renderSetupHeader();
        renderPlayerCards();
        if (window.matchMedia('(hover: hover)').matches) {
            $('playerNameInput').focus();
        }
    }
}

function renderGreeting() {
    const nickname = lsGet('nickname');
    const el = $('menuGreeting');
    el.textContent = nickname ? `Hey ${nickname}` : 'Hey there';
    fitText(el, window.innerHeight < 700 ? 54 : 64, 34, 2);
}

/* =========================================================
   Password + nickname
   ========================================================= */
function checkPassword() {
    const input = $('passwordInput');
    const error = $('passwordError');

    if (input.value.trim().toLowerCase() === HARDCODED_PASSWORD) {
        lsSet('authorized', 'true');
        error.textContent = '';
        input.value = '';
        showScreen(lsGet('nickname') ? 'mainMenu' : 'nicknameScreen');
    } else {
        error.textContent = 'Nope, that\'s not it. Try again.';
        input.value = '';
        input.focus();
    }
}

function setNickname() {
    const input = $('nicknameInput');
    const error = $('nicknameError');

    if (input.value.trim() !== '') {
        lsSet('nickname', input.value.trim());
        error.textContent = '';
        input.value = '';
        showScreen('mainMenu');
    } else {
        error.textContent = 'Please enter a name.';
        input.value = '';
    }
}

function changeNickname() {
    $('nicknameInput').value = lsGet('nickname') || '';
    showScreen('nicknameScreen');
}

/* =========================================================
   Add question
   ========================================================= */
function renderCategoryChoices() {
    const wrap = $('categoryChoices');
    wrap.innerHTML = CATEGORIES.map((cat, i) => {
        const t = THEMES[cat.theme];
        return `<label class="choice" style="--chip:${t.c};--chip-on:${t.on}">
            <input type="radio" name="questionCategory" value="${escapeHtml(cat.value)}" ${i === 0 ? 'checked' : ''}>
            <span>${escapeHtml(cat.value)}</span>
        </label>`;
    }).join('');
}

async function addQuestion() {
    const text = $('questionText').value.trim();
    const scale = $('scaleText').value.trim();
    const category = document.querySelector('input[name="questionCategory"]:checked')?.value || CATEGORIES[0].value;
    const message = $('addQuestionMessage');
    const nickname = lsGet('nickname');
    const btn = $('addQuestionBtn');

    if (!text) {
        flash(message, 'Write a question first.', 'error');
        return;
    }

    if (!scale) {
        flash(message, 'Add a scale, or keep the default (1 - 10).', 'error');
        return;
    }

    btn.disabled = true;
    try {
        await createLogged('questions', {
            text: text,
            category: category,
            scale: scale,
            likes: 0,
            dislikes: 0,
            nickname: nickname || '???'
        }, 'question');

        $('questionText').value = '';
        flash(message, 'Saved! It\'s in the deck now.', 'success');
    } catch (error) {
        console.error("Error adding question:", error);
        flash(message, isRateLimited(error)
            ? 'Easy there. One question every 15 seconds.'
            : 'Couldn\'t save that. Check your connection.', 'error', 0);
    } finally {
        btn.disabled = false;
    }
}

/* =========================================================
   Vote questions
   ========================================================= */
function categoryChip(category) {
    const cat = CATEGORIES.find(c => c.value === category);
    const color = cat ? THEMES[cat.theme].c : 'var(--c)';
    return `<span class="chip" style="--chip:${color}">${escapeHtml(category || 'Uncategorised')}</span>`;
}

function votesMeta(q, withAuthor = false) {
    const by = withAuthor && q.nickname ? `<span class="by">by ${escapeHtml(q.nickname)}</span>` : '';
    return `<div class="bubble-meta">
        <span>${icon('up')}${q.likes || 0}</span>
        <span>${icon('down')}${q.dislikes || 0}</span>
        ${by}
    </div>`;
}

function setVoteControls(enabled) {
    $('voteActions').querySelectorAll('.vote-action').forEach(b => { b.disabled = !enabled; });
    $('voteActions').hidden = !enabled;
}

async function loadVoteQuestions() {
    const message = $('voteMessage');
    const bubble = $('voteQuestion');
    message.textContent = '';
    $('voteEmpty').hidden = true;
    $('voteCount').hidden = true;
    bubble.hidden = false;
    bubble.className = 'bubble bubble--lg skeleton';
    bubble.innerHTML = '';
    setVoteControls(false);

    try {
        await authReady;
        const querySnapshot = await getDocs(collection(db, 'questions'));
        currentVoteQuestions = [];

        querySnapshot.forEach((d) => {
            if (!lsGet(`voted_${d.id}`)) {
                currentVoteQuestions.push({ id: d.id, ...d.data() });
            }
        });

        currentVoteQuestions = shuffleArray(currentVoteQuestions);
        currentVoteIndex = 0;
        displayCurrentVoteQuestion();
    } catch (error) {
        console.error("Error loading questions:", error);
        bubble.hidden = true;
        $('voteActions').hidden = false;
        flash(message, 'Couldn\'t reach the question database.', 'error', 0);
    }
}

function displayCurrentVoteQuestion() {
    const bubble = $('voteQuestion');
    const remaining = currentVoteQuestions.length - currentVoteIndex;

    if (remaining <= 0) {
        bubble.hidden = true;
        $('voteEmpty').hidden = false;
        $('voteCount').hidden = true;
        setVoteControls(false);
        return;
    }

    const question = currentVoteQuestions[currentVoteIndex];
    bubble.className = 'bubble bubble--lg';
    bubble.innerHTML = `
        ${categoryChip(question.category)}
        <p class="text">${escapeHtml(question.text)} <span class="scale">${escapeHtml(question.scale)}</span></p>
        ${votesMeta(question, true)}
    `;
    replayAnimation(bubble, 'enter');
    $('voteCount').textContent = `${remaining} left`;
    $('voteCount').hidden = false;
    setVoteControls(true);
}

let voteBusy = false;

async function vote(voteType) {
    if (voteBusy || currentVoteIndex >= currentVoteQuestions.length) return;
    voteBusy = true;

    const question = currentVoteQuestions[currentVoteIndex];
    const message = $('voteMessage');
    const bubble = $('voteQuestion');

    // Optimistic: animate away immediately, roll back if the write fails.
    lsSet(`voted_${question.id}`, 'true');
    bubble.classList.remove('enter');
    bubble.classList.add(voteType === 'like' ? 'out-like' : 'out-dislike');

    const write = authReady.then(() => updateDoc(doc(db, 'questions', question.id), {
        [voteType === 'like' ? 'likes' : 'dislikes']: increment(1)
    })).catch(error => {
        console.error("Error voting:", error);
        lsRemove(`voted_${question.id}`);
        flash(message, 'That vote didn\'t go through.', 'error');
    });

    setTimeout(() => {
        currentVoteIndex++;
        displayCurrentVoteQuestion();
        voteBusy = false;
    }, 200);

    await write;
}

/* =========================================================
   All questions
   ========================================================= */
let allQuestionsByCategory = {};
let activeFilter = 'all';

async function loadAllQuestions() {
    const questionsList = $('questionsList');
    questionsList.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    $('categoryFilter').innerHTML = '';
    $('questionsCount').hidden = true;

    try {
        await authReady;
        const querySnapshot = await getDocs(collection(db, 'questions'));
        allQuestionsByCategory = {};
        let total = 0;

        querySnapshot.forEach((d) => {
            const data = { id: d.id, ...d.data() };
            (allQuestionsByCategory[data.category] ||= []).push(data);
            total++;
        });

        if (total === 0) {
            questionsList.innerHTML = `<div class="empty">
                <h2 class="display display--sm">Empty deck</h2>
                <p>No questions yet. Be the first to add one.</p>
                <button class="btn btn--outline btn--auto" onclick="showScreen('addQuestionScreen')">${icon('pen')}Add a question</button>
            </div>`;
            return;
        }

        $('questionsCount').textContent = `${total} total`;
        $('questionsCount').hidden = false;
        activeFilter = 'all';
        renderCategoryFilter();
        renderQuestionsList();
    } catch (error) {
        console.error("Error loading questions:", error);
        questionsList.innerHTML = '<p class="message error">Couldn\'t reach the question database.</p>';
    }
}

function renderCategoryFilter() {
    const present = CATEGORIES.filter(c => allQuestionsByCategory[c.value]?.length);
    const chips = [{ value: 'all', label: 'All' }, ...present.map(c => ({ value: c.value, label: c.value }))];
    $('categoryFilter').innerHTML = chips.map(c =>
        `<button class="filter-chip" data-filter="${escapeHtml(c.value)}" aria-pressed="${c.value === activeFilter}">${escapeHtml(c.label)}</button>`
    ).join('');
}

function renderQuestionsList() {
    const list = CATEGORIES.filter(c => (activeFilter === 'all' || c.value === activeFilter) && allQuestionsByCategory[c.value]?.length);
    $('questionsList').innerHTML = list.map(cat => {
        const items = allQuestionsByCategory[cat.value];
        return `<section class="cat-group">
            <h2>${escapeHtml(cat.value)} <small>${items.length}</small></h2>
            <div class="cat-list">
                ${items.map(q => `<article class="bubble">
                    <p class="text">${escapeHtml(q.text)} <span class="scale">${escapeHtml(q.scale)}</span></p>
                    ${votesMeta(q, true)}
                    ${isAdminUser() ? `<button class="admin-delete" data-delete="${escapeHtml(q.id)}" aria-label="Delete question">${icon('x')}Delete</button>` : ''}
                </article>`).join('')}
            </div>
        </section>`;
    }).join('');
    $('questionsList').scrollTop = 0;
}

/* =========================================================
   Player setup
   ========================================================= */
function renderSetupHeader() {
    $('setupTitle').textContent = isEditingPlayers ? 'Edit players' : 'Who\'s playing?';
    $('setupSub').textContent = isEditingPlayers
        ? 'Add or remove people. The question deck stays as it is.'
        : 'Everyone gets their own colour.';
    $('startGameBtn').textContent = isEditingPlayers ? 'Back to the game' : 'Start game';
}

function addPlayer() {
    const input = $('playerNameInput');
    const name = input.value.trim();
    const message = $('gameSetupMessage');

    if (!name) return;

    if (playerCardsList.some(n => n.toLowerCase() === name.toLowerCase())) {
        flash(message, `${name} is already in.`, 'error', 2500);
        input.select();
        return;
    }

    message.textContent = '';
    assignColor(name);
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
    const container = $('playersList');
    container.innerHTML = playerCardsList.map((name, index) => `
        <div class="player-chip" style="${playerVars(name)}">
            <span class="av">${escapeHtml(initialOf(name))}</span>
            <span class="name">${escapeHtml(name)}</span>
            <button class="rm" onclick="removePlayer(${index})" aria-label="Remove ${escapeHtml(name)}">${icon('x')}</button>
        </div>
    `).join('');

    $('playersEmpty').hidden = playerCardsList.length > 0;
    const count = $('playerCount');
    count.hidden = playerCardsList.length === 0;
    count.textContent = `${playerCardsList.length} ${playerCardsList.length === 1 ? 'player' : 'players'}`;

    // The + button previews the colour the next player will get.
    const next = PALETTE[freeColorIndex()];
    const addBtn = $('addPlayerBtn');
    addBtn.style.setProperty('--pc', next.c);
    addBtn.style.setProperty('--pc-on', next.on);
}

function cancelSetup() {
    if (isEditingPlayers) {
        isEditingPlayers = false;
        playerCardsList = [...gamePlayers];
        showScreen('gameScreen');
        displayGameQuestion(false);
    } else {
        showScreen('mainMenu');
    }
}

function loadCurrentPlayersForEdit() {
    isEditingPlayers = true;
    savedGameQuestions = [...gameQuestions];
    savedPlayerIndex = currentPlayerIndex;
    playerCardsList = [...gamePlayers];
    showScreen('startGameScreen');
}

async function startGame() {
    const message = $('gameSetupMessage');
    const btn = $('startGameBtn');

    if (playerCardsList.length === 0) {
        flash(message, 'Add at least one player.', 'error');
        return;
    }

    const previousCurrent = gamePlayers[savedPlayerIndex];
    gamePlayers = [...playerCardsList];

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Shuffling…';

    try {
        // Usage log + admin push. Never blocks the game if it fails or is rate limited.
        createLogged('usage', {
            nickname: lsGet('nickname') || 'Anonymous',
            playerCount: gamePlayers.length,
            playerNames: gamePlayers,
            editedPlayers: isEditingPlayers
        }, 'game').catch(error => console.warn('Usage not logged:', error.code || error));

        if (isEditingPlayers) {
            // Keep the question stack, and stay on the same player if they're still in.
            isEditingPlayers = false;
            gameQuestions = [...savedGameQuestions];
            const stillIn = gamePlayers.indexOf(previousCurrent);
            currentPlayerIndex = stillIn >= 0 ? stillIn : savedPlayerIndex % gamePlayers.length;
        } else {
            await authReady;
            const querySnapshot = await getDocs(collection(db, 'questions'));
            gameQuestions = [];

            querySnapshot.forEach((d) => {
                gameQuestions.push({ id: d.id, ...d.data() });
            });

            if (gameQuestions.length === 0) {
                flash(message, 'No questions yet. Add some first!', 'error', 0);
                return;
            }

            gamePlayers = shuffleArray(gamePlayers);
            gameQuestions = randomShuffleQuestions(gameQuestions);
            // Use weightedShuffleQuestions to prioritise higher rated questions.
            // gameQuestions = weightedShuffleQuestions(gameQuestions);
            currentPlayerIndex = 0;
            hasVotedInGame = false;
            skipUsedThisTurn = false;
            chaosActive = false;
        }

        showScreen('gameScreen');
        displayGameQuestion();
    } catch (error) {
        console.error("Error loading game questions:", error);
        flash(message, 'Couldn\'t connect to the question database.', 'error', 0);
    } finally {
        btn.disabled = false;
        btn.textContent = label;
    }
}

/* =========================================================
   Game
   ========================================================= */
function renderTurnOrder() {
    const n = gamePlayers.length;
    const visible = Math.min(n, 5);
    let html = '';
    for (let k = 0; k < visible; k++) {
        const name = gamePlayers[(currentPlayerIndex + k) % n];
        html += `<span class="av-dot${k === 0 ? ' current' : ''}" style="${playerVars(name)};z-index:${visible - k}">${escapeHtml(initialOf(name))}</span>`;
    }
    if (n > visible) html += `<span class="av-dot more">+${n - visible}</span>`;
    $('turnOrder').innerHTML = html;
}

function displayGameQuestion(animate = true) {
    if (gameQuestions.length === 0) {
        showGameOver();
        return;
    }

    const player = gamePlayers[currentPlayerIndex];
    const question = gameQuestions[0];
    applyTheme(colorFor(player));

    const nameEl = $('currentPlayer');
    nameEl.textContent = player;
    $('gameScreen').classList.toggle('chaos-on', chaosActive);
    $('heroInitial').textContent = initialOf(player);
    const nextName = gamePlayers.length > 1 ? gamePlayers[(currentPlayerIndex + 1) % gamePlayers.length] : '';
    $('nextUp').textContent = nextName ? `Up next: ${nextName}` : '';
    renderTurnOrder();
    fitText(nameEl, nameMaxSize(), 30, 2);

    const chip = $('gameCategory');
    chip.textContent = question.category || 'Question';

    const textEl = $('gameQuestionText');
    textEl.innerHTML = `${escapeHtml(question.text)} <span class="q-scale">${escapeHtml(question.scale)}</span>`;
    const len = `${question.text} ${question.scale}`.length;
    textEl.classList.toggle('is-long', len > 110 && len <= 180);
    textEl.classList.toggle('is-xlong', len > 180);

    $('gameVoteButtons').hidden = hasVotedInGame;
    $('gameVotedNote').hidden = !hasVotedInGame;

    const skipBtn = $('skipBtn');
    skipBtn.disabled = skipUsedThisTurn;
    $('skipsLeft').textContent = skipUsedThisTurn ? '0 left' : '1 left';

    $('chaosBtn').disabled = chaosActive;
    $('chaosModifierCard').hidden = !chaosActive;

    if (animate) {
        replayAnimation($('turnBlock'), 'swap');
        replayAnimation(textEl, 'swap');
    }
}

function nameMaxSize() {
    const base = window.innerHeight < 700 ? 70 : 84;
    return chaosActive ? Math.round(base * 0.62) : base;
}

// Resize the player name and animate from the old size (FLIP), anchored bottom-left.
function refitPlayerName() {
    const el = $('currentPlayer');
    const before = el.getBoundingClientRect();
    fitText(el, nameMaxSize(), 30, 2);
    const after = el.getBoundingClientRect();
    if (!after.height || !el.animate) return;
    const scale = before.height / after.height;
    if (Math.abs(scale - 1) < 0.02) return;
    el.animate(
        [{ transform: `scale(${scale})` }, { transform: 'none' }],
        { duration: 450, easing: 'cubic-bezier(.22, 1, .36, 1)' }
    );
}

function nextQuestion() {
    if (gameQuestions.length > 0) {
        gameQuestions.shift();
    }

    currentPlayerIndex = (currentPlayerIndex + 1) % gamePlayers.length;
    hasVotedInGame = false;
    skipUsedThisTurn = false;
    chaosActive = false;
    $('gameQuestion').scrollTop = 0;

    displayGameQuestion();
}

function skipQuestion() {
    if (skipUsedThisTurn) return;
    if (gameQuestions.length > 0) {
        gameQuestions.shift();
    }

    hasVotedInGame = false;
    skipUsedThisTurn = true;
    chaosActive = false;

    if (gameQuestions.length === 0) {
        showGameOver();
        return;
    }
    displayGameQuestion(false);
    replayAnimation($('gameQuestionText'), 'swap');
}

async function voteInGame(voteType) {
    const question = gameQuestions[0];
    if (!question || hasVotedInGame) return;

    hasVotedInGame = true;
    $('gameVoteButtons').hidden = true;
    $('gameVotedNote').hidden = false;

    try {
        await authReady;
        await updateDoc(doc(db, 'questions', question.id), {
            [voteType === 'like' ? 'likes' : 'dislikes']: increment(1)
        });
    } catch (error) {
        console.error("Error voting:", error);
        if (gameQuestions[0] === question) {
            hasVotedInGame = false;
            $('gameVoteButtons').hidden = false;
            $('gameVotedNote').hidden = true;
        }
    }
}

function showGameOver() {
    const players = [...gamePlayers];
    showScreen('gameOverScreen');
    applyTheme(players.length ? colorFor(players[currentPlayerIndex] ?? players[0]) : BRAND);
    $('gameOverPlayers').innerHTML = players.map((name, i) =>
        `<span class="av" style="${playerVars(name)};animation-delay:${120 + i * 60}ms" title="${escapeHtml(name)}">${escapeHtml(initialOf(name))}</span>`
    ).join('');
}

function endGame() {
    gameQuestions = [];
    gamePlayers = [];
    playerCardsList = [];
    playerColors = {};
    currentPlayerIndex = 0;
    isEditingPlayers = false;
    hasVotedInGame = false;
    skipUsedThisTurn = false;
    chaosActive = false;
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

function randomShuffleQuestions(questions) {
    return shuffleArray(questions);
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
    if (chaosActive) return;
    let randomModifier = CHAOS_MODIFIERS[Math.floor(Math.random() * CHAOS_MODIFIERS.length)];
    randomModifier = randomModifier.replace('[RandomPlayer]', getRandomPlayer());

    $('chaosModifierText').textContent = randomModifier;
    chaosActive = true;
    $('chaosBtn').disabled = true;
    $('gameScreen').classList.add('chaos-on');
    refitPlayerName();
    const card = $('chaosModifierCard');
    card.hidden = false;
    replayAnimation(card, 'swap');
    requestAnimationFrame(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

function getRandomPlayer() {
    if (gamePlayers.length === 0) return 'Player';

    const availablePlayers = gamePlayers.filter((_, index) => index !== currentPlayerIndex);

    if (availablePlayers.length === 0) return gamePlayers[currentPlayerIndex];

    return availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
}

/* =========================================================
   Feedback
   ========================================================= */
async function sendFeedback() {
    const input = $('feedbackInput');
    const message = $('feedbackMessage');
    const feedback = input.value.trim();
    const nickname = lsGet('nickname') || 'Anonymous';
    if (!feedback) {
        flash(message, 'Write something first.', 'error');
        return;
    }
    try {
        await createLogged('feedback', { feedback: feedback, nickname: nickname }, 'feedback');
        input.value = '';
        flash(message, 'Sent. Thank you!', 'success');
    } catch (error) {
        console.error('Error sending feedback:', error);
        flash(message, isRateLimited(error)
            ? 'Got it already. Give it 30 seconds before sending more.'
            : 'Couldn\'t send that. Check your connection.', 'error', 0);
    }
}

/* =========================================================
   Tutorial
   ========================================================= */
const tutorialSteps = [
    {
        image: 'assets/tutorial/step1_cards.png',
        text: 'Lay out a deck of cards (Ace through 10) in a straight line to create a numerical scale. If you don’t have cards, numbered scraps of paper work just fine. Give each player an identical object (like a coin or a token) or a face-down card to use as their "voting chip."'
    },
    {
        image: 'assets/tutorial/step2_vote.png',
        text: 'The active player (the Questioner) reads a question aloud. Note: If you don´t like the question, you are allowed one "skip" per turn. \nThe Questioner then closes their eyes. While their eyes are shut, every other player places their voting chip on the scale (1–10) based on their personal answer to the question.'
    },
    {
        image: 'assets/tutorial/step3_assign.png',
        text: 'Once everyone has voted, the Questioner opens their eyes and must try to match each vote to the correct player. You must assign votes one by one. Once you assign a card/vote to a player, you cannot take it back or change your mind. You can only assign one vote to each player, even if your first guess was wrong.'
    },
    {
        image: 'assets/tutorial/step4_specialcaseCount.png',
        text: 'For questions that require a specific count rather than a "rating" the Ace (1) represents a value of 0 or 1. The 10 represents 10 or more. The Questioner doesn’t need to guess the exact number (e.g., whether it’s a 0 or a 1), and players don’t have to clarify which one they meant.'
    },
    {
        image: 'assets/tutorial/step5_verifyAndDrink.png',
        text: 'As the Questioner assigns a vote to a player, that player must reveal if the guess was correct. If they guessed correctly, the assigned player takes a sip. If they guessed incorrectly, the Questioner takes a sip. If a player was never correctly identified, they never have to reveal what their actual answer was! The turn ends once everyone has been assigned a guess. Then its the next player’s turn.'
    }
];

let currentTutorialStep = 0;

function renderTutorialStep(animate = true) {
    const step = tutorialSteps[currentTutorialStep];
    const last = currentTutorialStep === tutorialSteps.length - 1;
    $('tutorialImage').src = step.image;
    $('tutorialImage').alt = `Illustration for step ${currentTutorialStep + 1}`;
    $('tutorialText').textContent = step.text;
    $('tutorialStepLabel').textContent = `Step ${currentTutorialStep + 1} of ${tutorialSteps.length}`;
    $('tutorialBackBtn').disabled = currentTutorialStep === 0;
    $('tutorialForwardBtn').innerHTML = last ? `Let's play ${icon('arrow')}` : `Next ${icon('arrow')}`;
    $('tutorialProgress').innerHTML = tutorialSteps.map((_, i) =>
        `<span class="${i <= currentTutorialStep ? 'on' : ''}"></span>`
    ).join('');
    if (animate) {
        replayAnimation($('tutorialText'), 'tut-swap');
        replayAnimation($('tutorialImage'), 'tut-swap');
    }
}

function tutorialBack() {
    if (currentTutorialStep > 0) {
        currentTutorialStep--;
        renderTutorialStep();
    }
}

function tutorialForward() {
    if (currentTutorialStep < tutorialSteps.length - 1) {
        currentTutorialStep++;
        renderTutorialStep();
    } else {
        currentTutorialStep = 0;
        showScreen('startGameScreen');
    }
}

/* =========================================================
   Add to Home Screen
   ========================================================= */
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const forceInstallHint = new URLSearchParams(location.search).has('installhint');
let deferredInstallPrompt = null;
let installTimer = null;

function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    updateInstallLink();
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallLink();
});

function updateInstallLink() {
    const link = $('installLink');
    if (!link) return;
    const canInstall = isIOS || !!deferredInstallPrompt || forceInstallHint;
    link.hidden = isStandalone() || !canInstall;
    link.textContent = isIOS || forceInstallHint ? 'Add to Home Screen' : 'Install app';
}

function maybeShowInstallHint() {
    if (isStandalone() || !(isIOS || forceInstallHint)) return;
    const until = Number(lsGet('installHintUntil')) || 0;
    if (!forceInstallHint && Date.now() < until) return;
    if (installTimer) return;
    installTimer = setTimeout(() => {
        installTimer = null;
        if ($('mainMenu').classList.contains('active')) openInstallSheet();
    }, 1200);
}

function showInstallHint() {
    if (deferredInstallPrompt && !isIOS) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.finally(() => {
            deferredInstallPrompt = null;
            updateInstallLink();
        });
        return;
    }
    openInstallSheet();
}

let lastFocus = null;

function openInstallSheet() {
    const sheet = $('installSheet');
    const backdrop = $('installBackdrop');
    if (!sheet.hidden) return;
    lastFocus = document.activeElement;
    sheet.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        sheet.classList.add('open');
        backdrop.classList.add('open');
        $('installGotIt').focus({ preventScroll: true });
    }));
}

function closeInstallSheet(snoozeDays) {
    const sheet = $('installSheet');
    const backdrop = $('installBackdrop');
    if (sheet.hidden) return;
    lsSet('installHintUntil', String(Date.now() + snoozeDays * 864e5));
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    setTimeout(() => {
        sheet.hidden = true;
        backdrop.hidden = true;
    }, 450);
    lastFocus?.focus?.({ preventScroll: true });
}

/* =========================================================
   Admin (hidden: long-press the menu logo)
   Everything here is also enforced by firestore.rules; hiding the
   screen is just tidiness, not security.
   ========================================================= */
let adminTab = 'games';
let adminData = { games: [], feedback: [] };

function updateAdminUi() {
    $('adminLink').hidden = !isAdminUser();
    if ($('adminScreen').classList.contains('active')) renderAdminState();
}

function openAdmin() {
    if (lsGet('authorized') !== 'true') return;
    showScreen('adminScreen');
}

function renderAdminState() {
    const admin = isAdminUser();
    $('adminLogin').hidden = admin;
    $('adminPanel').hidden = !admin;
    $('adminSub').textContent = admin ? `Signed in as ${currentUser.email}` : 'Only you can get in here.';
    if (admin) {
        loadAdmin();
        refreshPushStatus();
    }
}

async function adminSignIn() {
    const email = $('adminEmail').value.trim();
    const password = $('adminPassword').value;
    const error = $('adminError');
    const btn = $('adminSignInBtn');
    if (!email || !password) { error.textContent = 'Email and password, please.'; return; }
    btn.disabled = true;
    error.textContent = '';
    try {
        await signInWithEmailAndPassword(auth, email, password);
        $('adminPassword').value = '';
    } catch (e) {
        console.error('Admin sign-in failed:', e);
        error.textContent = e.code === 'auth/too-many-requests'
            ? 'Too many tries. Wait a minute.'
            : 'That didn\'t work.';
    } finally {
        btn.disabled = false;
    }
}

async function adminSignOut() {
    await signOut(auth); // onAuthStateChanged signs this device back in anonymously
    showScreen('mainMenu');
}

const DAY = 24 * 60 * 60 * 1000;

function when(ts) {
    const t = ts?.toMillis ? ts.toMillis() : 0;
    if (!t) return '';
    const diff = Date.now() - t;
    if (diff < 60e3) return 'just now';
    if (diff < 3600e3) return `${Math.floor(diff / 60e3)} min ago`;
    if (diff < DAY) return `${Math.floor(diff / 3600e3)} h ago`;
    if (diff < 2 * DAY) return 'yesterday';
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: diff > 300 * DAY ? 'numeric' : undefined });
}

async function loadAdmin() {
    const list = $('adminList');
    list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    try {
        const [games, feedback] = await Promise.all([
            getDocs(query(collection(db, 'usage'), orderBy('createdAt', 'desc'), limit(300))),
            getDocs(query(collection(db, 'feedback'), orderBy('createdAt', 'desc'), limit(100))),
        ]);
        adminData.games = games.docs.map(d => d.data()).filter(g => !g.editedPlayers);
        adminData.feedback = feedback.docs.map(d => d.data());
        renderAdminStats();
        renderAdminList();
    } catch (error) {
        console.error('Admin load failed:', error);
        list.innerHTML = `<p class="message error">${error.code === 'permission-denied'
            ? `This account isn't the admin in firestore.rules. Its user ID is <code>${escapeHtml(currentUser?.uid || '')}</code>.`
            : 'Couldn\'t load. Check your connection.'}</p>`;
    }
}

function renderAdminStats() {
    const now = Date.now();
    const since = (ms) => adminData.games.filter(g => now - (g.createdAt?.toMillis?.() ?? 0) < ms).length;
    const players = new Set(adminData.games.flatMap(g => (g.playerNames || []).map(n => String(n).trim().toLowerCase())));
    const stats = [
        [since(7 * DAY), 'games this week'],
        [since(30 * DAY), 'games this month'],
        [players.size, 'different players'],
    ];
    $('adminStats').innerHTML = stats.map(([n, label]) => `<div><strong>${n}</strong><span>${label}</span></div>`).join('');
}

function renderAdminList() {
    $('adminTabs').querySelectorAll('.filter-chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.tab === adminTab)));
    const list = $('adminList');
    if (adminTab === 'games') {
        list.innerHTML = adminData.games.length ? adminData.games.map(g => `<article class="bubble admin-item">
            <p class="text">${(g.playerNames || []).map(n => escapeHtml(n)).join(', ')}</p>
            <div class="bubble-meta">
                <span>${icon('users')}${g.playerCount ?? (g.playerNames || []).length}</span>
                <span class="by">${escapeHtml(g.nickname || '?')} · ${when(g.createdAt)}</span>
            </div>
        </article>`).join('') : '<p class="message">No games logged yet.</p>';
    } else {
        list.innerHTML = adminData.feedback.length ? adminData.feedback.map(f => `<article class="bubble admin-item">
            <p class="text">${escapeHtml(f.feedback)}</p>
            <div class="bubble-meta"><span class="by">${escapeHtml(f.nickname || '?')} · ${when(f.createdAt)}</span></div>
        </article>`).join('') : '<p class="message">No feedback yet.</p>';
    }
}

async function deleteQuestion(id, button) {
    if (!isAdminUser() || !confirm('Delete this question for everyone?')) return;
    button.disabled = true;
    try {
        await deleteDoc(doc(db, 'questions', id));
        const card = button.closest('.bubble');
        card.remove();
        for (const items of Object.values(allQuestionsByCategory)) {
            const i = items.findIndex(q => q.id === id);
            if (i >= 0) items.splice(i, 1);
        }
    } catch (error) {
        console.error('Delete failed:', error);
        button.disabled = false;
        alert('Couldn\'t delete that one.');
    }
}

/* ---------- Push notifications (admin device only) ---------- */
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlB64ToUint8Array(base64) {
    const padded = (base64 + '='.repeat((4 - base64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

async function pushDocId(endpoint) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

async function currentPushSubscription() {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
}

async function refreshPushStatus() {
    const status = $('pushStatus');
    const btn = $('pushBtn');
    if (!pushSupported()) {
        status.textContent = isIOS && !isStandalone()
            ? 'Open Tobygame from your Home Screen to turn these on.'
            : 'This browser can\'t do push notifications.';
        btn.hidden = true;
        return;
    }
    btn.hidden = false;
    const sub = await currentPushSubscription().catch(() => null);
    const on = !!sub && Notification.permission === 'granted';
    status.textContent = on
        ? 'On for this device: new games, questions and feedback.'
        : Notification.permission === 'denied'
            ? 'Blocked. Allow notifications for Tobygame in your phone\'s settings.'
            : 'Off for this device.';
    btn.textContent = on ? 'Turn off' : 'Turn on';
    btn.dataset.on = String(on);
}

async function togglePush() {
    const btn = $('pushBtn');
    btn.disabled = true;
    try {
        if (btn.dataset.on === 'true') {
            const sub = await currentPushSubscription();
            if (sub) {
                await deleteDoc(doc(db, 'adminPush', await pushDocId(sub.endpoint)));
                await sub.unsubscribe();
            }
        } else {
            if (await Notification.requestPermission() !== 'granted') return;
            const reg = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            const json = sub.toJSON();
            await setDoc(doc(db, 'adminPush', await pushDocId(json.endpoint)), {
                endpoint: json.endpoint,
                keys: json.keys,
                device: navigator.userAgent.slice(0, 160),
                createdAt: serverTimestamp(),
            });
        }
    } catch (error) {
        console.error('Push toggle failed:', error);
        $('pushStatus').textContent = 'That didn\'t work. Try again.';
    } finally {
        btn.disabled = false;
        refreshPushStatus();
    }
}

function setupAdminGesture() {
    const logo = document.querySelector('#mainMenu .hero-logo');
    let timer = 0;
    const cancel = () => clearTimeout(timer);
    logo.addEventListener('pointerdown', () => {
        cancel();
        timer = setTimeout(() => {
            navigator.vibrate?.(15);
            openAdmin();
        }, 800);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => logo.addEventListener(type, cancel));
    logo.addEventListener('contextmenu', (e) => e.preventDefault());

    // Tapping a notification brings the app forward on the admin screen.
    navigator.serviceWorker?.addEventListener('message', (e) => {
        if (e.data?.open === 'admin') openAdmin();
    });
}

/* =========================================================
   Globals for inline handlers
   ========================================================= */
Object.assign(window, {
    checkPassword, setNickname, changeNickname, showScreen, addQuestion, vote,
    startGame, nextQuestion, skipQuestion, endGame, voteInGame, toggleChaosModifier,
    getRandomPlayer, addPlayer, removePlayer, loadCurrentPlayersForEdit, cancelSetup,
    sendFeedback, showInstallHint, openAdmin, adminSignIn, adminSignOut, togglePush,
});

/* =========================================================
   Boot
   ========================================================= */
function boot() {
    setupAuth();
    setupDotField();
    setupAdminGesture();
    renderCategoryChoices();

    $('adminTabs').addEventListener('click', (e) => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        adminTab = chip.dataset.tab;
        renderAdminList();
    });
    $('questionsList').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-delete]');
        if (btn) deleteQuestion(btn.dataset.delete, btn);
    });

    $('tutorialBackBtn').addEventListener('click', tutorialBack);
    $('tutorialForwardBtn').addEventListener('click', tutorialForward);

    $('categoryFilter').addEventListener('click', (e) => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        activeFilter = chip.dataset.filter;
        $('categoryFilter').querySelectorAll('.filter-chip').forEach(c => {
            c.setAttribute('aria-pressed', String(c === chip));
        });
        renderQuestionsList();
    });

    $('installGotIt').addEventListener('click', () => closeInstallSheet(30));
    $('installLater').addEventListener('click', () => closeInstallSheet(3));
    $('installBackdrop').addEventListener('click', () => closeInstallSheet(3));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeInstallSheet(3);
    });

    if (lsGet('authorized') === 'true') {
        showScreen(lsGet('nickname') ? 'mainMenu' : 'nicknameScreen');
        // Opened from a notification (?admin).
        if (new URLSearchParams(location.search).has('admin') && lsGet('nickname')) openAdmin();
    } else {
        showScreen('passwordScreen');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
