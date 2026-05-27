import { state } from './state.js';

// =============================================
// OVLÁDÁNÍ – MOBIL (dotykové joysticky)
// =============================================

export function setupMobileControls() {
    const leftEl  = document.getElementById('joystick-left');
    const rightEl = document.getElementById('joystick-right');
    const hLeft   = leftEl.querySelector('.joystick-handle');
    const hRight  = rightEl.querySelector('.joystick-handle');

    const moveHandle = (el, handle, joy, dx, dy) => {
        const maxD = 45;
        const ang  = Math.atan2(dy, dx);
        const fd   = Math.min(Math.hypot(dx, dy), maxD);
        handle.style.transform = `translate(${Math.cos(ang) * fd}px, ${Math.sin(ang) * fd}px)`;
        joy.vx = Math.cos(ang) * fd / maxD;
        joy.vy = Math.sin(ang) * fd / maxD;
        return { ang, dist: Math.hypot(dx, dy) };
    };

    // ---- Levý joystick (pohyb) ----
    leftEl.addEventListener('touchstart', () => {
        const r = leftEl.getBoundingClientRect();
        state.joystickLeft.active = true;
        state.joystickLeft.startX = r.left + r.width / 2;
        state.joystickLeft.startY = r.top  + r.height / 2;
    });
    leftEl.addEventListener('touchmove', (e) => {
        if (!state.joystickLeft.active) return;
        e.preventDefault();
        const touch = Array.from(e.touches).find(t => t.target.closest('#joystick-left'));
        if (!touch) return;
        moveHandle(leftEl, hLeft, state.joystickLeft,
            touch.clientX - state.joystickLeft.startX,
            touch.clientY - state.joystickLeft.startY);
    });
    leftEl.addEventListener('touchend', () => {
        state.joystickLeft.active = false;
        state.joystickLeft.vx    = 0;
        state.joystickLeft.vy    = 0;
        hLeft.style.transform    = 'translate(0,0)';
    });

    // ---- Pravý joystick (mířit + střílet) ----
    rightEl.addEventListener('touchstart', () => {
        const r = rightEl.getBoundingClientRect();
        state.joystickRight.active   = true;
        state.joystickRight.isAiming = true;
        state.joystickRight.startX   = r.left + r.width / 2;
        state.joystickRight.startY   = r.top  + r.height / 2;
    });
    rightEl.addEventListener('touchmove', (e) => {
        if (!state.joystickRight.active) return;
        e.preventDefault();
        const touch = Array.from(e.touches).find(t => t.target.closest('#joystick-right'));
        if (!touch) return;
        const dx = touch.clientX - state.joystickRight.startX;
        const dy = touch.clientY - state.joystickRight.startY;
        const { ang, dist } = moveHandle(rightEl, hRight, state.joystickRight, dx, dy);
        if (state.localPlayer) {
            state.localPlayer.angle = ang;
            if (dist > 15) state.localPlayer.shoot();
        }
    });
    rightEl.addEventListener('touchend', () => {
        state.joystickRight.active   = false;
        state.joystickRight.isAiming = false;
        state.joystickRight.vx       = 0;
        state.joystickRight.vy       = 0;
        hRight.style.transform       = 'translate(0,0)';
    });
}

// =============================================
// OVLÁDÁNÍ – DESKTOP (klávesnice + myš)
// =============================================

export function setupDesktopControls() {
    window.addEventListener('keydown', (e) => {
        if (!state.gameActive) return;
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 'arrowup')    state.keys.w = true;
        if (k === 'a' || k === 'arrowleft')  state.keys.a = true;
        if (k === 's' || k === 'arrowdown')  state.keys.s = true;
        if (k === 'd' || k === 'arrowright') state.keys.d = true;
        if (k === 'r' && state.localPlayer) state.localPlayer.reload();
        if (state.localPlayer) {
            if (state.rpgMode) {
                if (k === 'q') state.localPlayer.castSpellQ();
                if (k === 'e') state.localPlayer.castSpellE();
                if (k === 'h') state.localPlayer.useHeal();
            } else {
                if (k === 'h' || k === 'q') state.localPlayer.useHeal();
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 'arrowup')    state.keys.w = false;
        if (k === 'a' || k === 'arrowleft')  state.keys.a = false;
        if (k === 's' || k === 'arrowdown')  state.keys.s = false;
        if (k === 'd' || k === 'arrowright') state.keys.d = false;
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.gameActive || !state.localPlayer || !state.canvas) return;
        state.mouseX = e.clientX;
        state.mouseY = e.clientY;
        state.localPlayer.angle = Math.atan2(
            e.clientY - state.canvas.height / 2,
            e.clientX - state.canvas.width  / 2,
        );
    });

    window.addEventListener('mousedown', () => { if (state.gameActive) state.isMouseDown = true; });
    window.addEventListener('mouseup',   () => { state.isMouseDown = false; });
}
