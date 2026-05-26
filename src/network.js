import { Client, Account, Databases, Permission, Role, Query } from 'appwrite';
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, DATABASE_ID, COLLECTION_ID } from './constants.js';
import { state } from './state.js';
import { updateUI, updateOnlineList } from './ui.js';

// =============================================
// APPWRITE KLIENT
// =============================================

export const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

export const account   = new Account(client);
export const databases = new Databases(client);

// =============================================
// INICIALIZACE
// =============================================

export async function initAppwriteAndJoin() {
    try {
        try { await account.get(); } catch { await account.createAnonymousSession(); }
        state.currentUser = await account.get();
        console.log('✅ Appwrite: přihlášen. ID:', state.playerId);

        const btn = document.getElementById('btn-play');
        btn.disabled = false;
        btn.textContent = 'Vstoupit do boje';
        btn.classList.add('ready');

        await fetchAllPlayers();
        subscribeToPlayers();
    } catch (err) {
        console.error('❌ Appwrite init chyba:', err);
        const btn = document.getElementById('btn-play');
        btn.textContent = '❌ Chyba připojení – obnovte stránku';
    }
}

// =============================================
// REALTIME SUBSCRIPTION
// =============================================

export function subscribeToPlayers() {
    if (state.realtimeUnsub) state.realtimeUnsub();
    state.realtimeUnsub = client.subscribe(
        `databases.${DATABASE_ID}.collections.${COLLECTION_ID}.documents`,
        handleRealtimeEvent,
    );
    console.log('📡 Realtime subscription aktivní');
}

export async function fetchAllPlayers() {
    try {
        const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
            Query.greaterThan('lastUpdate', Date.now() - 10000),
            Query.limit(100),
        ]);
        state.rawPlayers = {};
        res.documents.forEach(data => {
            state.rawPlayers[data.$id] = data;
            if (data.$id !== state.playerId) {
                state.activePlayers[data.$id] = { ...data };
            }
        });
        updateOnlineList();
    } catch (err) {
        console.error('fetchAllPlayers chyba:', err);
    }
}

function handleRealtimeEvent(response) {
    const { events, payload: data } = response;
    const pid = data.$id;

    if (events.some(e => e.includes('.delete'))) {
        delete state.rawPlayers[pid];
        delete state.activePlayers[pid];
        updateUI();
        updateOnlineList();
        return;
    }

    // Create / Update
    const age = Date.now() - (data.lastUpdate || 0);
    if (age > 10000) return;

    state.rawPlayers[pid] = data;

    if (pid !== state.playerId) {
        // Synchronizace střel
        if (data.activeBullets) {
            try {
                const bullets = JSON.parse(data.activeBullets);
                bullets.forEach(b => {
                    if (Date.now() - (b.timestamp || 0) < 1500 && !state.localBullets.some(lb => lb.id === b.id)) {
                        state.localBullets.push(b);
                    }
                });
            } catch { /* ignore parse errors */ }
        }

        // Kill credit
        if (state.localPlayer && data.killedBy === state.playerId && !state.localPlayer.countedKills[pid]) {
            state.localPlayer.countedKills[pid] = true;
            state.localPlayer.kills++;
            updateUI();
            updatePlayerOnAppwrite();
        }

        // Interpolace pozice
        if (!state.activePlayers[pid]) {
            state.activePlayers[pid] = { ...data };
        } else {
            Object.assign(state.activePlayers[pid], {
                targetX:       data.x,
                targetY:       data.y,
                targetAngle:   data.angle,
                hp:            data.hp,
                kills:         data.kills,
                currentWeapon: data.currentWeapon,
                color:         data.color,
                name:          data.name,
            });
        }
    }

    updateOnlineList();
}

// =============================================
// ZÁPIS DO DATABÁZE
// =============================================

export async function updatePlayerOnAppwrite() {
    if (!state.currentUser || !state.localPlayer || state.localPlayer.hp <= 0) return;

    const bulletsToSend = state.localBullets
        .filter(b => b.ownerId === state.playerId && !b.synced)
        .map(b => {
            b.synced = true;
            return { id: b.id, ownerId: b.ownerId, x: b.x, y: b.y, vx: b.vx, vy: b.vy, damage: b.damage, range: b.range, color: b.color, timestamp: b.timestamp };
        });

    const payload = {
        name:          state.localPlayer.name,
        x:             state.localPlayer.x,
        y:             state.localPlayer.y,
        angle:         state.localPlayer.angle,
        hp:            state.localPlayer.hp,
        color:         state.localPlayer.color,
        kills:         state.localPlayer.kills,
        currentWeapon: state.localPlayer.currentWeapon,
        activeBullets: JSON.stringify(bulletsToSend),
        lastUpdate:    Date.now(),
        killedBy:      '',
    };

    try {
        if (!state.playerDocCreated) {
            await databases.createDocument(DATABASE_ID, COLLECTION_ID, state.playerId, payload, [
                Permission.read(Role.any()),
                Permission.update(Role.any()),
                Permission.delete(Role.any()),
            ]);
            state.playerDocCreated = true;
        } else {
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID, state.playerId, payload);
        }
    } catch (err) {
        console.error('Sync chyba:', err);
        if (err.code === 404 || String(err.type).includes('not_found')) {
            state.playerDocCreated = false;
        }
    }
}

export async function removePlayerFromAppwrite() {
    if (!state.currentUser || !state.playerId) return;
    try {
        await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, state.playerId);
        state.playerDocCreated = false;
    } catch { /* ignore */ }
}

export async function setKilledBy(killerId) {
    if (!state.playerDocCreated) return;
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTION_ID, state.playerId, {
            hp: 0, killedBy: killerId, lastUpdate: Date.now(),
        });
        await new Promise(r => setTimeout(r, 700));
    } catch { /* ignore */ }
}

window.addEventListener('beforeunload', () => { removePlayerFromAppwrite(); });
