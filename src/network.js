import { Client, Account, Databases, Permission, Role, Query } from 'appwrite';
import { 
    APPWRITE_ENDPOINT, 
    APPWRITE_PROJECT_ID, 
    DATABASE_ID, 
    COLLECTION_ID,
    ROOMS_COLLECTION_ID,
    MESSAGES_COLLECTION_ID 
} from './constants.js';
import { state } from './state.js';
import { 
    updateUI, 
    updateOnlineList, 
    updateRoomsList, 
    updateSublobbyPlayers, 
    updateSublobbyChat, 
    showScreen 
} from './ui.js';

// =============================================
// APPWRITE KLIENT
// =============================================

export const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

export const account   = new Account(client);
export const databases = new Databases(client);

let roomKeepAliveInterval = null;

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
        
        await fetchActiveRooms();
    } catch (err) {
        console.error('❌ Appwrite init chyba:', err);
        const btn = document.getElementById('btn-play');
        btn.textContent = '❌ Chyba připojení – obnovte stránku';
    }
}

// =============================================
// REALTIME SUBSCRIPTION (HRÁČI)
// =============================================

export function subscribeToPlayers() {
    if (state.realtimeUnsub) state.realtimeUnsub();
    state.realtimeUnsub = client.subscribe(
        `databases.${DATABASE_ID}.collections.${COLLECTION_ID}.documents`,
        handleRealtimeEvent,
    );
    console.log('📡 Realtime subscription aktivní pro hráče');
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
                // Pouze pokud sdílíme stejný roomId
                if (state.currentRoomId && data.roomId === state.currentRoomId) {
                    state.activePlayers[data.$id] = { ...data };
                }
            }
        });
        updateOnlineList();
        if (state.currentRoomId) updateSublobbyInfo();
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
        if (state.currentRoomId) updateSublobbyInfo();
        return;
    }

    // Věk zprávy
    const age = Date.now() - (data.lastUpdate || 0);
    if (age > 12000) return;

    state.rawPlayers[pid] = data;

    if (pid !== state.playerId) {
        // Synchronizace střel (pouze pokud jsme ve stejné místnosti)
        if (state.currentRoomId && data.roomId === state.currentRoomId) {
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
        }

        // Kill credit
        if (state.localPlayer && data.killedBy === state.playerId && !state.localPlayer.countedKills[pid]) {
            state.localPlayer.countedKills[pid] = true;
            state.localPlayer.kills++;
            updateUI();
            updatePlayerOnAppwrite();
        }

        // Interpolace pozice
        if (state.currentRoomId && data.roomId === state.currentRoomId) {
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
        } else {
            // Hráč odešel z naší místnosti
            delete state.activePlayers[pid];
        }
    }

    updateOnlineList();
    if (state.currentRoomId) updateSublobbyInfo();
}

// =============================================
// SPRÁVA MÍSTNOSTÍ (ROOMS)
// =============================================

export async function fetchActiveRooms() {
    try {
        const res = await databases.listDocuments(DATABASE_ID, ROOMS_COLLECTION_ID, [
            Query.greaterThan('lastUpdate', Date.now() - 30000), // aktivní za 30s
            Query.limit(50),
        ]);
        const waitingRooms = res.documents.filter(r => r.status === 'waiting');
        updateRoomsList(waitingRooms);
    } catch (err) {
        console.error('fetchActiveRooms chyba:', err);
    }
}

export async function createRoom(roomName) {
    if (!state.currentUser) return;
    
    const roomId = 'r_' + Math.random().toString(36).substring(2, 10);
    const payload = {
        name: roomName,
        hostId: state.playerId,
        status: 'waiting',
        aiCount: 0,
        lastUpdate: Date.now()
    };
    
    try {
        const room = await databases.createDocument(DATABASE_ID, ROOMS_COLLECTION_ID, roomId, payload, [
            Permission.read(Role.any()),
            Permission.update(Role.any()),
            Permission.delete(Role.any()),
        ]);
        
        state.currentRoomId = roomId;
        state.currentRoom = room;
        state.isHost = true;
        
        // Změna obrazovky a titulků
        document.getElementById('sublobby-title').textContent = room.name.toUpperCase();
        document.getElementById('sublobby-host-indicator').textContent = `Zakladatel: ty`;
        document.getElementById('btn-start-game').style.display = '';
        document.getElementById('ai-count-slider').disabled = false;
        document.getElementById('ai-count-slider').value = 0;
        document.getElementById('ai-count-val').textContent = '0';
        
        showScreen('sublobby-screen');
        
        // Připojit lokálního hráče do místnosti na Appwrite
        if (state.localPlayer) {
            state.localPlayer.roomId = roomId;
        }
        
        // Spustit realtime odběr změn v místnosti
        subscribeToSublobby(roomId);
        
        await sendChatMessage('SYSTEM', `Místnost "${roomName}" byla vytvořena.`);
        updateSublobbyInfo();
        startRoomKeepAlive();
    } catch (err) {
        console.error('createRoom chyba:', err);
        alert('Nepodařilo se vytvořit místnost.');
    }
}

export async function joinRoom(roomId) {
    if (!state.currentUser) return;
    
    try {
        const room = await databases.getDocument(DATABASE_ID, ROOMS_COLLECTION_ID, roomId);
        if (room.status === 'playing') {
            alert('Tato hra již začala!');
            return;
        }
        
        state.currentRoomId = roomId;
        state.currentRoom = room;
        state.isHost = false;
        
        // Přechod na obrazovku
        document.getElementById('sublobby-title').textContent = room.name.toUpperCase();
        document.getElementById('sublobby-host-indicator').textContent = `Zakladatel: Hráč`;
        document.getElementById('btn-start-game').style.display = 'none';
        document.getElementById('ai-count-slider').disabled = true;
        document.getElementById('ai-count-slider').value = room.aiCount || 0;
        document.getElementById('ai-count-val').textContent = room.aiCount || 0;
        
        showScreen('sublobby-screen');
        
        // Přihlásit se do místnosti na Appwrite
        if (state.localPlayer) {
            state.localPlayer.roomId = roomId;
        }
        
        subscribeToSublobby(roomId);
        
        const nick = document.getElementById('nickname-input').value.trim() || 'Bojovník';
        await sendChatMessage('SYSTEM', `${nick} se připojil do místnosti.`);
        updateSublobbyInfo();
    } catch (err) {
        console.error('joinRoom chyba:', err);
        alert('Nepodařilo se připojit k místnosti.');
    }
}

export async function leaveRoom(sendSystemMsg = true) {
    if (!state.currentRoomId) return;
    
    if (sendSystemMsg) {
        const nick = document.getElementById('nickname-input').value.trim() || 'Bojovník';
        if (state.isHost) {
            await sendChatMessage('SYSTEM', `Zakladatel opustil místnost. Místnost byla zrušena.`);
        } else {
            await sendChatMessage('SYSTEM', `${nick} opustil místnost.`);
        }
    }
    
    // Zrušit interval keep alive
    if (roomKeepAliveInterval) {
        clearInterval(roomKeepAliveInterval);
        roomKeepAliveInterval = null;
    }
    
    const oldRoomId = state.currentRoomId;
    const oldIsHost = state.isHost;
    
    // Klientský reset state
    state.currentRoomId = null;
    state.currentRoom = null;
    state.isHost = false;
    
    if (state.sublobbyUnsub) { state.sublobbyUnsub(); state.sublobbyUnsub = null; }
    if (state.messagesUnsub) { state.messagesUnsub(); state.messagesUnsub = null; }
    
    // Odhlásit z Appwrite
    if (state.localPlayer) state.localPlayer.roomId = '';
    if (state.playerDocCreated) {
        try {
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID, state.playerId, { roomId: '' });
        } catch {}
    }
    
    // Smazat místnost z DB, pokud jsme zakladatel
    if (oldIsHost) {
        try {
            await databases.deleteDocument(DATABASE_ID, ROOMS_COLLECTION_ID, oldRoomId);
        } catch (err) {
            console.error('Smazání místnosti selhalo:', err);
        }
    }
    
    showScreen('lobby-screen');
    await fetchActiveRooms();
}

export async function startGameOnAppwrite() {
    if (!state.isHost || !state.currentRoomId) return;
    try {
        await databases.updateDocument(DATABASE_ID, ROOMS_COLLECTION_ID, state.currentRoomId, {
            status: 'playing',
            lastUpdate: Date.now()
        });
    } catch (err) {
        console.error('startGameOnAppwrite chyba:', err);
    }
}

export async function updateRoomSettingsOnAppwrite(aiCount) {
    if (!state.isHost || !state.currentRoomId) return;
    try {
        await databases.updateDocument(DATABASE_ID, ROOMS_COLLECTION_ID, state.currentRoomId, {
            aiCount: parseInt(aiCount)
        });
    } catch (err) {
        console.error('updateRoomSettingsOnAppwrite chyba:', err);
    }
}

// =============================================
// SUB-LOBBY REALTIME SUBSCRIPTIONS
// =============================================

export function subscribeToSublobby(roomId) {
    if (state.sublobbyUnsub) state.sublobbyUnsub();
    if (state.messagesUnsub) state.messagesUnsub();
    
    // Odběr změn v místnosti
    state.sublobbyUnsub = client.subscribe(
        `databases.${DATABASE_ID}.collections.${ROOMS_COLLECTION_ID}.documents.${roomId}`,
        async (response) => {
            const { events, payload: data } = response;
            if (events.some(e => e.includes('.delete'))) {
                alert('Místnost byla zrušena zakladatelem.');
                leaveRoom(false);
                return;
            }
            
            state.currentRoom = data;
            
            // Synchronizace AI slideru pro připojené
            if (!state.isHost) {
                const slider = document.getElementById('ai-count-slider');
                if (slider) {
                    slider.value = data.aiCount || 0;
                    document.getElementById('ai-count-val').textContent = data.aiCount || 0;
                }
            }
            
            // Pokud host odstartoval hru, začínáme!
            if (data.status === 'playing' && !state.gameActive) {
                if (window.startLocalGame) {
                    window.startLocalGame();
                }
            }
        }
    );
    
    // Odběr chatu
    state.messagesUnsub = client.subscribe(
        `databases.${DATABASE_ID}.collections.${MESSAGES_COLLECTION_ID}.documents`,
        (response) => {
            const { events, payload: data } = response;
            if (events.some(e => e.includes('.create')) && data.roomId === roomId) {
                fetchChatMessages(roomId);
            }
        }
    );
    
    // První načtení dat
    fetchChatMessages(roomId);
}

export async function fetchChatMessages(roomId) {
    try {
        const res = await databases.listDocuments(DATABASE_ID, MESSAGES_COLLECTION_ID, [
            Query.equal('roomId', roomId),
            Query.orderAsc('timestamp'),
            Query.limit(60),
        ]);
        updateSublobbyChat(res.documents);
    } catch (err) {
        console.error('fetchChatMessages chyba:', err);
    }
}

export async function sendChatMessage(sender, text) {
    if (!state.currentRoomId) return;
    
    const payload = {
        roomId: state.currentRoomId,
        sender: sender,
        text: text,
        timestamp: Date.now(),
    };
    
    try {
        await databases.createDocument(DATABASE_ID, MESSAGES_COLLECTION_ID, 'msg_' + Math.random().toString(36).substring(2, 10), payload, [
            Permission.read(Role.any()),
            Permission.update(Role.any()),
            Permission.delete(Role.any()),
        ]);
    } catch (err) {
        console.error('sendChatMessage chyba:', err);
    }
}

export function updateSublobbyInfo() {
    if (!state.currentRoomId) return;
    
    const roomPlayers = [];
    
    // Přidat lokálního hráče
    const localNick = document.getElementById('nickname-input').value.trim();
    roomPlayers.push({
        $id: state.playerId,
        name: localNick || 'Hráč',
        color: state.selectedSkin,
    });
    
    // Přidat ostatní ze stejné místnosti
    for (const pid in state.rawPlayers) {
        const p = state.rawPlayers[pid];
        if (p.roomId === state.currentRoomId && pid !== state.playerId) {
            roomPlayers.push(p);
        }
    }
    
    updateSublobbyPlayers(roomPlayers);
}

function startRoomKeepAlive() {
    if (roomKeepAliveInterval) clearInterval(roomKeepAliveInterval);
    roomKeepAliveInterval = setInterval(async () => {
        if (state.isHost && state.currentRoomId) {
            try {
                await databases.updateDocument(DATABASE_ID, ROOMS_COLLECTION_ID, state.currentRoomId, {
                    lastUpdate: Date.now()
                });
            } catch (err) {
                console.error('Keepalive chyba:', err);
            }
        }
    }, 8000);
}

// =============================================
// ZÁPIS DO DATABÁZE (HRÁČ)
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
        roomId:        state.currentRoomId || '',
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

window.addEventListener('beforeunload', () => { 
    if (state.currentRoomId) {
        // Opustit synchronně
        leaveRoom(true);
    }
    removePlayerFromAppwrite(); 
});
