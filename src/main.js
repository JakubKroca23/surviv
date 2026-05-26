import { state } from './state.js';
import { Player, generateObstacles, generateSpawnedLoot } from './player.js';
import { 
    initAppwriteAndJoin, 
    updatePlayerOnAppwrite, 
    removePlayerFromAppwrite, 
    fetchAllPlayers,
    createRoom,
    joinRoom,
    leaveRoom,
    startGameOnAppwrite,
    updateRoomSettingsOnAppwrite,
    sendChatMessage,
    fetchActiveRooms
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

    // Globální funkce pro HTML onclick atributy a index.html interakce
    window.setSkin = (color) => setSkin(color);
    
    // Globální připojení k místnosti z lobby listu
    window.joinRoom = async (roomId) => {
        const name = input.value.trim();
        if (!name || name.length < 2) {
            alert('Zadej nejdříve přezdívku (aspoň 2 znaky)!');
            return;
        }
        await joinRoom(roomId);
    };

    // Nickname input → enable play / create room button
    const input  = document.getElementById('nickname-input');
    const btnPlay = document.getElementById('btn-play');
    input.addEventListener('input', () => {
        const ready = input.value.trim().length >= 2;
        btnPlay.disabled = !ready;
        btnPlay.classList.toggle('ready', ready);
        if (ready) btnPlay.textContent = 'Vytvořit hru';
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

    // Play/Create Room tlačítko
    btnPlay.addEventListener('click', () => {
        const name = input.value.trim();
        if (!name || name.length < 2) return;
        createRoom(`Místnost hráče ${name}`);
    });

    // Opustit sublobby místnost
    document.getElementById('btn-leave-room').addEventListener('click', () => {
        leaveRoom(true);
    });

    // Odstartovat hru (pouze host)
    document.getElementById('btn-start-game').addEventListener('click', () => {
        startGameOnAppwrite();
    });

    // AI Slider
    const aiSlider = document.getElementById('ai-count-slider');
    const aiVal = document.getElementById('ai-count-val');
    aiSlider.addEventListener('input', () => {
        aiVal.textContent = aiSlider.value;
        updateRoomSettingsOnAppwrite(aiSlider.value);
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

    // Obnovuj lobby a místnosti každých 4s
    setInterval(async () => {
        if (!state.gameActive) {
            await fetchAllPlayers();
            if (!state.currentRoomId) {
                await fetchActiveRooms();
            }
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

    // Vygenerovat AI boty na hostu
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
