import { state } from './state.js';
import { WEAPONS } from './constants.js';

// =============================================
// UI – AKTUALIZACE HUD
// =============================================

export function updateUI() {
    const p = state.localPlayer;
    if (!p) return;

    const hpPct = (p.hp / p.maxHp) * 100;
    document.getElementById('health-bar-fill').style.width = `${hpPct}%`;
    document.getElementById('health-bar-text').textContent  = `${Math.ceil(p.hp)} / ${p.maxHp} HP`;
    document.getElementById('stat-kills').textContent       = `Killy: ${p.kills}`;

    const weapon = WEAPONS[p.currentWeapon];
    document.getElementById('weapon-name').textContent     = weapon.name;
    document.getElementById('weapon-icon').innerHTML       = `<i class="${weapon.icon}"></i>`;
    document.getElementById('weapon-ammo').textContent     = p.currentWeapon === 'fists'
        ? '∞ / ∞'
        : `${p.ammo[p.currentWeapon]} / ${weapon.ammoMax}`;

    const healWrap = document.getElementById('heal-btn-wrap');
    healWrap.style.display = p.medkits > 0 ? '' : 'none';
    document.getElementById('medkit-count').textContent = `${p.medkits}x`;
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
// SKINY
// =============================================

export function setSkin(color) {
    state.selectedSkin = color;
    document.querySelectorAll('.skin-btn').forEach(b => b.classList.remove('active'));
    if (color === '#22c55e') document.getElementById('skin-1').classList.add('active');
    if (color === '#3b82f6') document.getElementById('skin-2').classList.add('active');
    if (color === '#f97316') document.getElementById('skin-3').classList.add('active');
}
