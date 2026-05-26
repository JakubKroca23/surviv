import { state } from './state.js';
import { WEAPONS } from './constants.js';

// =============================================
// UI – AKTUALIZACE HUD
// =============================================

let lastUIPct = -1;
let lastUIKills = -1;
let lastUIWeapon = '';
let lastUIAmmo = '';
let lastUIMedkits = -1;

export function updateUI() {
    const p = state.localPlayer;
    if (!p) return;

    const hpPct = (p.hp / p.maxHp) * 100;
    if (lastUIPct !== hpPct) {
        document.getElementById('health-bar-fill').style.width = `${hpPct}%`;
        document.getElementById('health-bar-text').textContent  = `${Math.ceil(p.hp)} / ${p.maxHp} HP`;
        lastUIPct = hpPct;
    }

    if (lastUIKills !== p.kills) {
        document.getElementById('stat-kills').textContent = `Killy: ${p.kills}`;
        lastUIKills = p.kills;
    }

    const weapon = WEAPONS[p.currentWeapon];
    if (lastUIWeapon !== p.currentWeapon) {
        document.getElementById('weapon-name').textContent = weapon.name;
        document.getElementById('weapon-icon').innerHTML   = `<i class="${weapon.icon}"></i>`;
        lastUIWeapon = p.currentWeapon;
    }

    const currentAmmoText = p.currentWeapon === 'fists' ? '∞ / ∞' : `${p.ammo[p.currentWeapon]} / ${weapon.ammoMax}`;
    if (lastUIAmmo !== currentAmmoText) {
        document.getElementById('weapon-ammo').textContent = currentAmmoText;
        lastUIAmmo = currentAmmoText;
    }

    if (lastUIMedkits !== p.medkits) {
        const healWrap = document.getElementById('heal-btn-wrap');
        healWrap.style.display = p.medkits > 0 ? '' : 'none';
        document.getElementById('medkit-count').textContent = `${p.medkits}x`;
        lastUIMedkits = p.medkits;
    }
}

// =============================================
// UI – LOBBY SEZNAM HRÁČŮ
// =============================================

export function updateOnlineList() {
    const el = document.getElementById('online-players-list');
    if (!el) return;

    let html  = '';
    let alive = 0;

    for (const pid in state.rawPlayers) {
        const d = state.rawPlayers[pid];
        if (state.currentRoomId && d.roomId !== state.currentRoomId) continue;
        
        html += `<div class="player-row">
            <span style="font-weight:700;color:#d6d3d1">${d.name || 'Bojovník'}</span>
            <span style="font-size:0.75rem;color:#78716c">${d.hp > 0 ? 'Ve hře' : 'Mrtvý'}</span>
        </div>`;
        if (d.hp > 0) alive++;
    }

    el.innerHTML = html || '<div style="color:#78716c">Žádní bojovníci v okolí.</div>';

    const aliveEl = document.getElementById('stat-alive');
    if (aliveEl) aliveEl.textContent = `Naživu: ${alive}`;
}

// =============================================
// UI – MÍSTNOSTI & SUBLOBBY
// =============================================

export function updateRoomsList(rooms) {
    const el = document.getElementById('rooms-list');
    if (!el) return;

    if (!rooms || rooms.length === 0) {
        el.innerHTML = '<div style="color:#78716c; text-align: center; padding: 1rem;">Žádné aktivní místnosti.<br>Zadej jméno a klikni na tlačítko nahoře pro založení!</div>';
        return;
    }

    let html = '';
    rooms.forEach(room => {
        const statusText = room.status === 'playing' ? 'Probíhá hra' : 'V lobby';
        const color = room.status === 'playing' ? '#ef4444' : '#10b981';
        html += `
        <div class="room-row">
            <div class="room-info">
                <span class="room-name">${room.name}</span>
                <span class="room-status" style="color: ${color}">${statusText}</span>
            </div>
            <button class="btn-join" onclick="window.joinRoom('${room.$id}')" ${room.status === 'playing' ? 'disabled style="background:#292524;color:#78716c;cursor:not-allowed;"' : ''}>Připojit se</button>
        </div>`;
    });

    el.innerHTML = html;
}

export function updateSublobbyPlayers(players) {
    const listEl = document.getElementById('sublobby-players-list');
    const countEl = document.getElementById('sublobby-player-count');
    if (!listEl) return;

    let html = '';
    let count = 0;

    players.forEach(p => {
        const isHost = state.currentRoom && state.currentRoom.hostId === p.$id;
        html += `
        <div class="sublobby-player-row">
            <div class="player-info-wrap">
                <div class="player-dot" style="background: ${p.color || '#22c55e'}"></div>
                <span style="font-weight: 700; color: #fff;">${p.name || 'Hráč'}</span>
                ${isHost ? '<i class="fa-solid fa-crown" style="color: #fbbf24; font-size: 0.8rem; margin-left: 0.25rem;" title="Zakladatel"></i>' : ''}
            </div>
            <span style="font-size: 0.7rem; color: #78716c;">PŘIPOJEN</span>
        </div>`;
        count++;
    });

    listEl.innerHTML = html || '<div style="color:#78716c">Nikdo v místnosti...</div>';
    if (countEl) countEl.textContent = count;
}

export function updateSublobbyChat(messages) {
    const el = document.getElementById('sublobby-chat-messages');
    if (!el) return;

    let html = '';
    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
    sorted.forEach(msg => {
        if (msg.sender === 'SYSTEM') {
            html += `<div class="chat-message-row"><span class="chat-system">${msg.text}</span></div>`;
        } else {
            html += `<div class="chat-message-row"><span class="chat-sender">${msg.sender}:</span><span>${msg.text}</span></div>`;
        }
    });

    el.innerHTML = html || '<div style="color:#78716c; font-style: italic;">Žádné zprávy. Napiš něco!</div>';
    el.scrollTop = el.scrollHeight;
}

export function showScreen(screenId) {
    document.getElementById('lobby-screen').style.display = screenId === 'lobby-screen' ? 'flex' : 'none';
    document.getElementById('sublobby-screen').style.display = screenId === 'sublobby-screen' ? 'flex' : 'none';
    document.getElementById('game-ui').style.display = screenId === 'game-ui' ? '' : 'none';
    document.getElementById('death-screen').style.display = screenId === 'death-screen' ? 'flex' : 'none';
}

// =============================================
// SKINY
// =============================================

export function setSkin(color) {
    state.selectedSkin = color;
    document.querySelectorAll('.skin-btn').forEach(b => b.classList.remove('active'));
    if (color === '#22c55e') document.getElementById('skin-1').classList.add('active');
    if (color === '#3b82f6') document.getElementById('skin-2').classList.add('active');
    if (color === '#f97316') document.getElementById('skin-3').classList.add('active');
}
