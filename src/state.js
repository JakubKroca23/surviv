// =============================================
// SDÍLENÝ HERNÍ STAV
// =============================================

export const state = {
    // Appwrite
    currentUser:     null,
    playerId:        'p_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString().slice(-4),
    playerDocCreated: false,
    realtimeUnsub:   null,

    // Hráči
    localPlayer:   null,
    activePlayers: {},   // ostatní hráči (interpolováni)
    rawPlayers:    {},   // poslední Appwrite data

    // Střely & předměty
    localBullets:   [],
    hitMarkers:     [],
    itemsOnGround:  [],

    // Mapa
    mapObstacles: [],

    // Herní stav
    gameActive:     false,
    playStartTime:  0,
    networkInterval: null,

    // Kosmetika
    selectedSkin: '#22c55e',

    // Canvas (inicializovány v main.js)
    canvas:        null,
    ctx:           null,
    minimapCanvas: null,
    mctx:          null,

    // Zařízení
    isMobile: ('ontouchstart' in window) || (navigator.maxTouchPoints > 0),

    // Desktop ovládání
    keys:       { w: false, a: false, s: false, d: false },
    mouseX:     0,
    mouseY:     0,
    isMouseDown: false,

    // Joysticky (mobil)
    joystickLeft:  { active: false, startX: 0, startY: 0, vx: 0, vy: 0 },
    joystickRight: { active: false, startX: 0, startY: 0, vx: 0, vy: 0, isAiming: false },
};
