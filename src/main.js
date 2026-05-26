import { state } from './state.js';
import { Player, generateObstacles, generateSpawnedLoot } from './player.js';
import { initAppwriteAndJoin, updatePlayerOnAppwrite, removePlayerFromAppwrite, fetchAllPlayers } from './network.js';
import { drawGame } from './renderer.js';
import { updateGame } from './game.js';
import { updateUI, updateOnlineList, setSkin } from './ui.js';
import { setupMobileControls, setupDesktopControls } from './controls.js';

// =============================================
// INICIALIZACE
// =============================================

window.onload = async () => {
    // Canvas
    state.canvas        = document.getElementById('game-canvas');
    state.ctx           = state.canvas.getContext('2d');
    state.minimapCanvas = document.getElementById('minimap-canvas');
    state.mctx          = state.minimapCanvas.getContext('2d');

    // Globální funkce pro HTML onclick atributy
    window.setSkin = (color) => setSkin(color);

    // Nickname input → enable play button
    const input  = document.getElementById('nickname-input');
    const btnPlay = document.getElementById('btn-play');
    input.addEventListener('input', () => {
        const ready = input.value.trim().length >= 2;
        btnPlay.disabled = !ready;
        btnPlay.classList.toggle('ready', ready);
        if (ready) btnPlay.textContent = 'Vstoupit do boje!';
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
        document.getElementById('lobby-screen').style.display = 'flex';
        resetGame();
    });

    // Play tlačítko
    btnPlay.addEventListener('click', startGame);

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

    // Obnovuj lobby každých 5s
    setInterval(async () => {
        if (!state.gameActive) await fetchAllPlayers();
    }, 5000);

    // Spusť render loop
    gameLoop();
};

// =============================================
// START HRY
// =============================================

function startGame() {
    const name = document.getElementById('nickname-input').value.trim();
    if (!name || name.length < 2) return;

    // Inicializuj hráče
    state.localPlayer = new Player(state.playerId, name, state.selectedSkin);
    state.gameActive  = true;
    state.playStartTime = Date.now();

    // Přepni UI
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-ui').style.display      = '';
    document.getElementById('death-screen').style.display = 'none';

    updateUI();
    updateOnlineList();

    // Pravidelná synchronizace s Appwrite (120ms)
    state.networkInterval = setInterval(updatePlayerOnAppwrite, 120);

    // Okamžitý první sync
    updatePlayerOnAppwrite();
}

// =============================================
// RESET HRY
// =============================================

function resetGame() {
    state.localPlayer     = null;
    state.gameActive      = false;
    state.playerDocCreated = false;
    state.localBullets    = [];
    state.hitMarkers      = [];
    if (state.networkInterval) { clearInterval(state.networkInterval); state.networkInterval = null; }

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
