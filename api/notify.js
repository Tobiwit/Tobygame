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

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, FIREBASE_SERVICE_ACCOUNT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !FIREBASE_SERVICE_ACCOUNT) {
        return res.status(200).json({ sent: false, reason: 'not-configured' });
    }

    try {
        const { auth, db } = admin();

        const token = (req.headers.authorization || '').replace(/^Bearer /, '');
        try {
            await auth.verifyIdToken(token);
        } catch {
            return res.status(401).json({ error: 'Not signed in' });
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

        const subs = await db.collection('adminPush').get();
        if (subs.empty) return res.status(200).json({ sent: false, reason: 'no-subscribers' });

        webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@tobygame.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
        const payload = JSON.stringify({ ...compose(type, data), tag: type, url: '/?admin' });

        let sent = 0;
        await Promise.all(subs.docs.map(async (s) => {
            const { endpoint, keys } = s.data();
            try {
                await webpush.sendNotification({ endpoint, keys }, payload, { TTL: 60 * 60 * 24 });
                sent++;
            } catch (e) {
                // The device unsubscribed or the subscription expired: forget it.
                if (e.statusCode === 404 || e.statusCode === 410) await s.ref.delete();
                else console.error('push failed', e.statusCode, e.body);
            }
        }));
        return res.status(200).json({ sent: sent > 0, devices: sent });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Something went wrong' });
    }
}
