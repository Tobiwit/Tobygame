/**
 * POST /api/notify  { type: 'game' | 'question' | 'feedback', id: '<firestore doc id>' }
 *
 * Called by the app right after it saves something. Sends a Web Push to the
 * admin's devices only. Safe to expose because:
 *  - the caller must have a valid Firebase ID token (the app signs everyone in silently);
 *  - the text is built here from the saved document, so callers can't push arbitrary text;
 *  - each document can notify once, and only while it's fresh, so the endpoint can't be replayed.
 *
 * Vercel env vars: FIREBASE_SERVICE_ACCOUNT (JSON), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';

const SOURCES = { game: 'usage', question: 'questions', feedback: 'feedback' };
const FRESH_MS = 10 * 60 * 1000;
const ALREADY_EXISTS = 6;

function admin() {
    if (!getApps().length) {
        initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    }
    return { auth: getAuth(), db: getFirestore() };
}

const clip = (s, n) => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function compose(type, d) {
    const who = clip(d.nickname || 'Someone', 24);
    if (type === 'game') {
        const names = Array.isArray(d.playerNames) ? d.playerNames.map(n => clip(n, 20)) : [];
        const list = names.length > 6 ? `${names.slice(0, 6).join(', ')} +${names.length - 6}` : names.join(', ');
        return { title: `New game · ${d.playerCount ?? names.length} players`, body: `${list}\nStarted by ${who}` };
    }
    if (type === 'question') {
        return { title: `New question from ${who}`, body: `${clip(d.text, 140)} ${clip(d.scale, 20)}\n${clip(d.category, 20)}` };
    }
    return { title: `Feedback from ${who}`, body: clip(d.feedback, 180) };
}

// Pasted env values often carry stray spaces, newlines or quotes.
const env = (name) => (process.env[name] || '').trim().replace(/^["']|["']$/g, '');

/** Push to every admin device. Returns one result per device. */
async function pushToAdmins(db, payload) {
    const subs = await db.collection('adminPush').get();
    webpush.setVapidDetails(env('VAPID_SUBJECT') || 'https://tobygame.vercel.app', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
    return Promise.all(subs.docs.map(async (s) => {
        const { endpoint, keys } = s.data();
        const host = (() => { try { return new URL(endpoint).host; } catch { return '?'; } })();
        try {
            const r = await webpush.sendNotification({ endpoint, keys }, payload, { TTL: 60 * 60 * 24, urgency: 'high' });
            return { host, ok: true, status: r.statusCode };
        } catch (e) {
            // The device unsubscribed or the subscription expired: forget it.
            if (e.statusCode === 404 || e.statusCode === 410) await s.ref.delete();
            console.error('push failed', host, e.statusCode, e.body || e.message);
            return { host, ok: false, status: e.statusCode ?? null, error: String(e.body || e.message).slice(0, 200) };
        }
    }));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const missing = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'FIREBASE_SERVICE_ACCOUNT'].filter(n => !env(n));
    if (missing.length) {
        return res.status(200).json({ sent: false, reason: 'not-configured', missing });
    }

    try {
        const { auth, db } = admin();

        const token = (req.headers.authorization || '').replace(/^Bearer /, '');
        let caller;
        try {
            caller = await auth.verifyIdToken(token);
        } catch {
            return res.status(401).json({ error: 'Not signed in' });
        }

        // Admin-only test push with a full report, sent from the admin screen.
        if (req.body?.type === 'test') {
            const subs = await db.collection('adminPush').get();
            if (!subs.docs.some(d => d.data().uid === caller.uid)) {
                return res.status(403).json({ sent: false, reason: 'not-an-admin-device' });
            }
            if (req.body.publicKey !== env('VAPID_PUBLIC_KEY')) {
                return res.status(200).json({ sent: false, reason: 'key-mismatch' });
            }
            const results = await pushToAdmins(db, JSON.stringify({
                title: 'Test from Tobygame', body: 'Notifications work on this device.', tag: 'test', url: '/?admin',
            }));
            return res.status(200).json({ sent: results.some(r => r.ok), results });
        }

        const { type, id } = req.body || {};
        if (!SOURCES[type] || typeof id !== 'string' || !/^[A-Za-z0-9]{1,40}$/.test(id)) {
            return res.status(400).json({ error: 'Bad request' });
        }

        const snap = await db.collection(SOURCES[type]).doc(id).get();
        if (!snap.exists) return res.status(404).json({ error: 'Not found' });
        const data = snap.data();
        const created = data.createdAt?.toMillis?.() ?? 0;
        if (Date.now() - created > FRESH_MS) return res.status(200).json({ sent: false, reason: 'stale' });
        if (type === 'game' && data.editedPlayers) return res.status(200).json({ sent: false, reason: 'edit' });

        // One notification per document, ever.
        try {
            await db.collection('notified').doc(`${type}_${id}`).create({ at: FieldValue.serverTimestamp() });
        } catch (e) {
            if (e.code === ALREADY_EXISTS) return res.status(200).json({ sent: false, reason: 'already-sent' });
            throw e;
        }

        const results = await pushToAdmins(db, JSON.stringify({ ...compose(type, data), tag: type, url: '/?admin' }));
        if (!results.length) return res.status(200).json({ sent: false, reason: 'no-subscribers' });
        return res.status(200).json({ sent: results.some(r => r.ok), results });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Something went wrong' });
    }
}
