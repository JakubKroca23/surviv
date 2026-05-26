import { state } from './state.js';
import { Player, generateObstacles, generateSpawnedLoot } from './player.js';
import { 
    initAppwriteAndJoin, 
    updatePlayerOnAppwrite, 
    removePlayerFromAppwrite, 
    fetchAllPlayers,
    joinOrCreateActiveLobby,
    leaveRoom,
    sendChatMessage
} from './network.js';
import { drawGame } from './renderer.js';
import { updateGame, spawnAIBots } from './game.js';
import { updateUI, updateOnlineList, setSkin, showScreen } from './ui.js';
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

    // Globální funkce pro HTML skiny
    window.setSkin = (color) => setSkin(color);

    // Nickname input → povolit vyhledávání zápasu
    const input  = document.getElementById('nickname-input');
    const btnPlay = document.getElementById('btn-play');
    input.addEventListener('input', () => {
        const ready = input.value.trim().length >= 2;
        btnPlay.disabled = !ready;
        btnPlay.classList.toggle('ready', ready);
        if (ready) btnPlay.textContent = 'VYHLEDAT ZÁPAS';
    });

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

    // Spustit matchmaking (vyhledat / vytvořit lobby)
    btnPlay.addEventListener('click', () => {
        const name = input.value.trim();
        if (!name || name.length < 2) return;
        joinOrCreateActiveLobby();
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
    
    // Vygeneruj mapu & loot
    state.mapObstacles  = generateObstacles();
    state.itemsOnGround = generateSpawnedLoot();

    // Vygenerovat AI boty na hostu (doplnit do 20)
    if (state.isHost && state.currentRoom && state.currentRoom.aiCount > 0) {
        spawnAIBots(state.currentRoom.aiCount);
    }

    state.gameActive  = true;
    state.playStartTime = Date.now();

    // Přepni UI na hru
    showScreen('game-ui');

    updateUI();
    updateOnlineList();

    // Pravidelná synchronizace s Appwrite (120ms)
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
