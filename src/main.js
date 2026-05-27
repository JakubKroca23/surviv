import { state } from './state.js';
import { Player, generateObstacles, generateSpawnedLoot } from './player.js';
import { 
    initAppwriteAndJoin, 
    updatePlayerOnAppwrite, 
    removePlayerFromAppwrite, 
    fetchAllPlayers,
    startSoloGame,
    joinOrCreateDuoLobby,
    leaveRoom,
    sendChatMessage
} from './network.js';
import { drawGame } from './renderer.js';
import { updateGame, spawnAIBots } from './game.js';
import { updateUI, updateOnlineList, initCustomizer, showScreen, initShopUI } from './ui.js';
import { setupMobileControls, setupDesktopControls } from './controls.js';
import { initAudio } from './audio.js';


// =============================================
// INICIALIZACE
// =============================================

window.onload = async () => {
    // Canvas
    state.canvas        = document.getElementById('game-canvas');
    state.ctx           = state.canvas.getContext('2d');
    state.minimapCanvas = document.getElementById('minimap-canvas');
    state.mctx          = state.minimapCanvas.getContext('2d');

    // Inicializace postavy customizéru
    initCustomizer();
    initShopUI();

    const input  = document.getElementById('nickname-input');

    // Joysticky (mobil)
    if (state.isMobile) {
        document.getElementById('joystick-left').style.display  = 'flex';
        document.getElementById('joystick-right').style.display = 'flex';
        document.getElementById('heal-btn-wrap').style.display  = '';
        setupMobileControls();
    } else {
        setupDesktopControls();
    }

    // Respawn tlačítko
    document.getElementById('btn-respawn').addEventListener('click', () => {
        document.getElementById('death-screen').style.display = 'none';
        showScreen('lobby-screen');
        resetGame();
    });

    // Spustit SOLO hru (okamžitě proti botům)
    document.getElementById('btn-solo').addEventListener('click', () => {
        const name = input.value.trim();
        if (!name || name.length < 2) return;
        startSoloGame();
    });

    // Spustit DUO matchmaking
    document.getElementById('btn-duo').addEventListener('click', () => {
        const name = input.value.trim();
        if (!name || name.length < 2) return;
        joinOrCreateDuoLobby();
    });

    // Zrušit hledání zápasu (opustit lobby)
    document.getElementById('btn-leave-room').addEventListener('click', () => {
        leaveRoom(true);
    });

    // Sublobby Chat Form
    const chatForm = document.getElementById('sublobby-chat-form');
    const chatInput = document.getElementById('chat-input');
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = '';
        
        const nick = input.value.trim() || 'Hráč';
        await sendChatMessage(nick, text);
    });

    // Heal tlačítko
    document.getElementById('btn-heal').addEventListener('click', () => {
        if (state.localPlayer) state.localPlayer.useHeal();
    });

    // Spells HUD click triggers
    const btnSpellQ = document.getElementById('btn-spell-q');
    if (btnSpellQ) {
        btnSpellQ.addEventListener('click', () => {
            if (state.localPlayer && state.rpgMode) state.localPlayer.castSpellQ();
        });
    }

    const btnSpellE = document.getElementById('btn-spell-e');
    if (btnSpellE) {
        btnSpellE.addEventListener('click', () => {
            if (state.localPlayer && state.rpgMode) state.localPlayer.castSpellE();
        });
    }

    // Scroll zbraní (desktop)
    window.addEventListener('wheel', (e) => {
        if (!state.gameActive || !state.localPlayer) return;
        const p       = state.localPlayer;
        const owned   = Object.keys(p.weapons).filter(w => p.weapons[w]);
        const idx     = owned.indexOf(p.currentWeapon);
        const nextIdx = (idx + (e.deltaY > 0 ? 1 : -1) + owned.length) % owned.length;
        p.currentWeapon = owned[nextIdx];
        updateUI();
    });

    // Předgeneruj mapu
    state.mapObstacles  = generateObstacles();
    state.itemsOnGround = generateSpawnedLoot();

    // Připoj k Appwrite
    await initAppwriteAndJoin();

    // Obnovuj online hráče každých 4s
    setInterval(async () => {
        if (!state.gameActive) {
            await fetchAllPlayers();
        }
    }, 4000);

    // Spusť render loop
    gameLoop();
};

// =============================================
// REÁLNÝ START HRY
// =============================================

window.startLocalGame = () => {
    const name = document.getElementById('nickname-input').value.trim() || 'Bojovník';

    // Inicializuj audio na uživatelskou interakci
    initAudio();

    // Inicializuj lokálního hráče
    state.localPlayer = new Player(state.playerId, name, state.selectedSkin);
    state.localPlayer.roomId = state.currentRoomId;
    state.localPlayer.teamId = state.teamId;

    // Vygeneruj mapu & loot
    state.mapObstacles  = generateObstacles();
    state.itemsOnGround = generateSpawnedLoot();

    // Vygenerovat AI boty na hostu (doplnit do 20)
    // Pokud je SOLO: spawne se 19 botů, každý v jiném nepřátelském týmu (týmy 2 až 20)
    // Pokud je DUO: spawne se 18 nebo 19 botů, parťák dostane stejný Team 1, ostatní boti tvoří týmy po 2
    if (state.isHost) {
        let botsCount = 5; // Nastaveno na 5 botů pro testování
        spawnAIBots(botsCount);
    }

    state.gameActive  = true;
    state.playStartTime = Date.now();

    // Přepni UI na hru
    showScreen('game-ui');

    updateUI();
    updateOnlineList();

    // Pravidelná synchronizace s Appwrite (120ms)
    // Pokud hrajeme SOLO, nemusíme neustále spamovat DB, stačí jednou při startu a konci, ale abychom se viděli v online hráčích, můžeme nechat sync
    state.networkInterval = setInterval(updatePlayerOnAppwrite, 120);

    // Okamžitý první sync
    updatePlayerOnAppwrite();
};

// =============================================
// RESET HRY
// =============================================

function resetGame() {
    state.localPlayer     = null;
    state.gameActive      = false;
    state.playerDocCreated = false;
    state.localBullets    = [];
    state.hitMarkers      = [];
    state.aiBots          = [];
    if (state.networkInterval) { clearInterval(state.networkInterval); state.networkInterval = null; }
    if (state.botInterval) { clearInterval(state.botInterval); state.botInterval = null; }

    // Zrušit aktuální místnost
    state.currentRoomId = null;
    state.currentRoom = null;
    state.isHost = false;
    state.gameMode = 'solo';
    state.teamId = 1;
    
    if (state.sublobbyUnsub) { state.sublobbyUnsub(); state.sublobbyUnsub = null; }
    if (state.messagesUnsub) { state.messagesUnsub(); state.messagesUnsub = null; }

    // Regeneruj mapu
    state.mapObstacles  = generateObstacles();
    state.itemsOnGround = generateSpawnedLoot();
}

// =============================================
// RENDER LOOP
// =============================================

function gameLoop() {
    if (state.gameActive) {
        updateGame();
        drawGame();
    }
    requestAnimationFrame(gameLoop);
}
