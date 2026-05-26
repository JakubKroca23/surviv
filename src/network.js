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

let lobbyCountdownInterval = null;

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
        btn.textContent = 'VYHLEDAT ZÁPAS';
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

    const age = Date.now() - (data.lastUpdate || 0);
    if (age > 12000) return;

    state.rawPlayers[pid] = data;

    if (pid !== state.playerId) {
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

        if (state.localPlayer && data.killedBy === state.playerId && !state.localPlayer.countedKills[pid]) {
            state.localPlayer.countedKills[pid] = true;
            state.localPlayer.kills++;
            updateUI();
            updatePlayerOnAppwrite();
        }

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
            delete state.activePlayers[pid];
        }
    }

    updateOnlineList();
    if (state.currentRoomId) updateSublobbyInfo();
}

// =============================================
// JUMP-IN LOBBY (MATCHMAKING)
// =============================================

export async function joinOrCreateActiveLobby() {
    if (!state.currentUser) return;

    const btn = document.getElementById('btn-play');
    btn.disabled = true;
    btn.textContent = 'Vyhledávání lobby...';

    try {
        // Vyhledat všechny místnosti, které jsou ve stavu 'waiting' a nejsou starší než 30 vteřin
        const res = await databases.listDocuments(DATABASE_ID, ROOMS_COLLECTION_ID, [
            Query.equal('status', 'waiting'),
            Query.greaterThan('lastUpdate', Date.now() - 30000),
            Query.limit(10),
        ]);

        if (res.documents.length > 0) {
            // Najít nejstarší platnou místnost (která ještě neskončila)
            const room = res.documents[0];
            console.log('✅ Nalezeno aktivní lobby. Připojuji se k:', room.$id);
            await joinRoom(room.$id);
        } else {
            // Vytvořit novou místnost (lobby)
            console.log('➕ Žádné aktivní lobby nenalezeno. Vytvářím nové...');
            const nick = document.getElementById('nickname-input').value.trim() || 'Hráč';
            await createRoom(`Lobby od ${nick}`);
        }
    } catch (err) {
        console.error('Matchmaking chyba:', err);
        alert('Nepodařilo se připojit k matchmakingu.');
        btn.disabled = false;
        btn.textContent = 'VYHLEDAT ZÁPAS';
    }
}

export async function createRoom(roomName) {
    const roomId = 'r_' + Math.random().toString(36).substring(2, 10);
    const creationTime = Date.now();
    const payload = {
        name: roomName,
        hostId: state.playerId,
        status: 'waiting',
        aiCount: 0,
        lastUpdate: creationTime // slouží jako čas vzniku
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
        
        showScreen('sublobby-screen');
        
        if (state.localPlayer) {
            state.localPlayer.roomId = roomId;
        }
        
        subscribeToSublobby(roomId);
        await sendChatMessage('SYSTEM', `Nové lobby bylo otevřeno. Čeká se na další bojovníky!`);
        updateSublobbyInfo();
    } catch (err) {
        throw err;
    }
}

export async function joinRoom(roomId) {
    try {
        const room = await databases.getDocument(DATABASE_ID, ROOMS_COLLECTION_ID, roomId);
        
        state.currentRoomId = roomId;
        state.currentRoom = room;
        state.isHost = false;
        
        showScreen('sublobby-screen');
        
        if (state.localPlayer) {
            state.localPlayer.roomId = roomId;
        }
        
        subscribeToSublobby(roomId);
        
        const nick = document.getElementById('nickname-input').value.trim() || 'Bojovník';
        await sendChatMessage('SYSTEM', `${nick} vstoupil do lobby.`);
        updateSublobbyInfo();
    } catch (err) {
        throw err;
    }
}

export async function leaveRoom(sendSystemMsg = true) {
    if (!state.currentRoomId) return;
    
    if (sendSystemMsg) {
        const nick = document.getElementById('nickname-input').value.trim() || 'Bojovník';
        if (state.isHost) {
            await sendChatMessage('SYSTEM', `Zakladatel opustil lobby. Lobby bude zrušeno.`);
        } else {
            await sendChatMessage('SYSTEM', `${nick} opustil lobby.`);
        }
    }
    
    stopLobbyCountdown();
    
    const oldRoomId = state.currentRoomId;
    const oldIsHost = state.isHost;
    
    state.currentRoomId = null;
    state.currentRoom = null;
    state.isHost = false;
    
    if (state.sublobbyUnsub) { state.sublobbyUnsub(); state.sublobbyUnsub = null; }
    if (state.messagesUnsub) { state.messagesUnsub(); state.messagesUnsub = null; }
    
    if (state.localPlayer) state.localPlayer.roomId = '';
    if (state.playerDocCreated) {
        try {
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID, state.playerId, { roomId: '' });
        } catch {}
    }
    
    if (oldIsHost) {
        try {
            await databases.deleteDocument(DATABASE_ID, ROOMS_COLLECTION_ID, oldRoomId);
        } catch (err) {
            console.error('Smazání místnosti selhalo:', err);
        }
    }
    
    const btn = document.getElementById('btn-play');
    btn.disabled = false;
    btn.textContent = 'VYHLEDAT ZÁPAS';
    
    showScreen('lobby-screen');
}

// =============================================
// AUTOMATICKÝ COUNTER & START LOBBY
// =============================================

function startLobbyCountdown() {
    stopLobbyCountdown();
    
    lobbyCountdownInterval = setInterval(async () => {
        if (!state.currentRoomId || !state.currentRoom) {
            stopLobbyCountdown();
            return;
        }

        const elapsed = Date.now() - state.currentRoom.lastUpdate;
        const timeLeft = Math.max(0, 30 - Math.floor(elapsed / 1000));
        
        const indicator = document.getElementById('sublobby-host-indicator');
        if (indicator) {
            indicator.textContent = timeLeft > 0 ? `Zápas začíná za: ${timeLeft} s` : 'Startuji zápas...';
        }

        if (timeLeft <= 0 && state.isHost && state.currentRoom.status === 'waiting') {
            stopLobbyCountdown();
            
            // Spočítat reálné lidi v místnosti
            const playerCount = Object.values(state.rawPlayers).filter(p => p.roomId === state.currentRoomId).length + 1; // + host
            
            // Doplnění boty do 20 hráčů
            const botsNeeded = Math.max(0, 20 - playerCount);
            console.log(`🎮 Matchmaker startuje hru! Hráči: ${playerCount}, AI Boti: ${botsNeeded}`);

            try {
                await databases.updateDocument(DATABASE_ID, ROOMS_COLLECTION_ID, state.currentRoomId, {
                    status: 'playing',
                    aiCount: botsNeeded,
                    lastUpdate: Date.now() // aktualizace keep alive
                });
            } catch (err) {
                console.error('Chyba při automatickém startu hry:', err);
            }
        }
    }, 1000);
}

function stopLobbyCountdown() {
    if (lobbyCountdownInterval) {
        clearInterval(lobbyCountdownInterval);
        lobbyCountdownInterval = null;
    }
}

// =============================================
// SUB-LOBBY REALTIME SUBSCRIPTIONS
// =============================================

export function subscribeToSublobby(roomId) {
    if (state.sublobbyUnsub) state.sublobbyUnsub();
    if (state.messagesUnsub) state.messagesUnsub();
    
    state.sublobbyUnsub = client.subscribe(
        `databases.${DATABASE_ID}.collections.${ROOMS_COLLECTION_ID}.documents.${roomId}`,
        async (response) => {
            const { events, payload: data } = response;
            if (events.some(e => e.includes('.delete'))) {
                alert('Zápas byl zrušen.');
                leaveRoom(false);
                return;
            }
            
            state.currentRoom = data;
            
            if (data.status === 'playing' && !state.gameActive) {
                stopLobbyCountdown();
                if (window.startLocalGame) {
                    window.startLocalGame();
                }
            }
        }
    );
    
    state.messagesUnsub = client.subscribe(
        `databases.${DATABASE_ID}.collections.${MESSAGES_COLLECTION_ID}.documents`,
        (response) => {
            const { events, payload: data } = response;
            if (events.some(e => e.includes('.create')) && data.roomId === roomId) {
                fetchChatMessages(roomId);
            }
        }
    );
    
    fetchChatMessages(roomId);
    startLobbyCountdown();
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
    
    const localNick = document.getElementById('nickname-input').value.trim();
    roomPlayers.push({
        $id: state.playerId,
        name: localNick || 'Bojovník',
        color: state.selectedSkin,
    });
    
    for (const pid in state.rawPlayers) {
        const p = state.rawPlayers[pid];
        if (p.roomId === state.currentRoomId && pid !== state.playerId) {
            roomPlayers.push(p);
        }
    }
    
    updateSublobbyPlayers(roomPlayers);
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
        leaveRoom(true);
    }
    removePlayerFromAppwrite(); 
});
