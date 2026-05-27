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
let lastUIGrenades = -1;
let lastUIMeth = -1;

export function updateUI() {
    const p = state.localPlayer;
    if (!p) return;

    const hpPct = (p.hp / p.maxHp) * 100;
    if (lastUIPct !== hpPct) {
        const hpFill = document.getElementById('health-bar-fill');
        const hpText = document.getElementById('health-bar-text');
        if (hpFill) hpFill.style.width = `${hpPct}%`;
        if (hpText) hpText.textContent  = `${Math.ceil(p.hp)} / ${p.maxHp} HP`;
        lastUIPct = hpPct;
    }

    if (lastUIKills !== p.kills) {
        const killsEl = document.getElementById('stat-kills');
        if (killsEl) killsEl.textContent = `Killy: ${p.kills}`;
        lastUIKills = p.kills;
    }

    const weapon = WEAPONS[p.currentWeapon];
    if (weapon) {
        if (lastUIWeapon !== p.currentWeapon) {
            const nameEl = document.getElementById('weapon-name');
            const iconEl = document.getElementById('weapon-icon');
            if (nameEl) nameEl.textContent = weapon.name;
            if (iconEl) iconEl.innerHTML   = `<i class="${weapon.icon}"></i>`;
            lastUIWeapon = p.currentWeapon;
        }

        const currentAmmoText = p.currentWeapon === 'fists' ? '∞ / ∞' : `${p.ammo[p.currentWeapon]} / ${weapon.ammoMax}`;
        if (lastUIAmmo !== currentAmmoText) {
            const ammoEl = document.getElementById('weapon-ammo');
            if (ammoEl) ammoEl.textContent = currentAmmoText;
            lastUIAmmo = currentAmmoText;
        }
    }

    if (lastUIMedkits !== p.medkits) {
        const healWrap = document.getElementById('heal-btn-wrap');
        if (healWrap) {
            healWrap.style.display = p.medkits > 0 ? '' : 'none';
            const countEl = document.getElementById('medkit-count');
            if (countEl) countEl.textContent = `${p.medkits}x`;
        }
        lastUIMedkits = p.medkits;
    }

    if (lastUIGrenades !== p.grenades) {
        const grenadeWrap = document.getElementById('grenade-btn-wrap');
        if (grenadeWrap) {
            grenadeWrap.style.display = p.grenades > 0 ? '' : 'none';
            const countEl = document.getElementById('grenade-count');
            if (countEl) countEl.textContent = `${p.grenades}x`;
        }
        lastUIGrenades = p.grenades;
    }

    if (lastUIMeth !== p.meth) {
        const methWrap = document.getElementById('meth-btn-wrap');
        if (methWrap) {
            methWrap.style.display = p.meth > 0 ? '' : 'none';
            const countEl = document.getElementById('meth-count');
            if (countEl) countEl.textContent = `${p.meth}x`;
        }
        lastUIMeth = p.meth;
    }
}

    if (lastUIMedkits !== p.medkits) {
        const healWrap = document.getElementById('heal-btn-wrap');
        if (healWrap) {
            healWrap.style.display = p.medkits > 0 ? '' : 'none';
            document.getElementById('medkit-count').textContent = `${p.medkits}x`;
        }
        lastUIMedkits = p.medkits;
    }

    if (lastUIGrenades !== p.grenades) {
        const grenadeWrap = document.getElementById('grenade-btn-wrap');
        if (grenadeWrap) {
            grenadeWrap.style.display = p.grenades > 0 ? '' : 'none';
            document.getElementById('grenade-count').textContent = `${p.grenades}x`;
        }
        lastUIGrenades = p.grenades;
    }

    if (lastUIMeth !== p.meth) {
        const methWrap = document.getElementById('meth-btn-wrap');
        if (methWrap) {
            methWrap.style.display = p.meth > 0 ? '' : 'none';
            document.getElementById('meth-count').textContent = `${p.meth}x`;
        }
        lastUIMeth = p.meth;
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
            <span style="font-weight:700;color:#d6d3d1">${getCleanName(d.name)}</span>
            <span style="font-size:0.75rem;color:#78716c">${d.hp > 0 ? 'Ve hře' : 'Mrtvý'}</span>
        </div>`;
        if (d.hp > 0) alive++;
    }

    el.innerHTML = html || '<div style="color:#78716c">Žádní bojovníci v okolí.</div>';

    const aliveEl = document.getElementById('stat-alive');
    if (aliveEl) aliveEl.textContent = `Naživu: ${alive}`;
}

// =============================================
// UI – SUBLOBBY / MATCHMAKING
// =============================================

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
                <span style="font-weight: 700; color: #fff;">${getCleanName(p.name)}</span>
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

import { drawFace, drawHat, drawVest } from './renderer.js';

export function showScreen(screenId) {
    document.getElementById('lobby-screen').style.display = screenId === 'lobby-screen' ? 'flex' : 'none';
    document.getElementById('sublobby-screen').style.display = screenId === 'sublobby-screen' ? 'flex' : 'none';
    document.getElementById('game-ui').style.display = screenId === 'game-ui' ? '' : 'none';
    document.getElementById('death-screen').style.display = screenId === 'death-screen' ? 'flex' : 'none';
    
    // Draw preview whenever the lobby is shown
    if (screenId === 'lobby-screen') {
        setTimeout(drawPreview, 50);
    }
}

// =============================================
// HELPER PRO VYČIŠTĚNÍ JMÉNA OD SPECIÁLNÍCH RPG METADAT
// =============================================

export function getCleanName(rawName) {
    if (!rawName) return 'Bojovník';
    const parts = rawName.split('|');
    const name = parts[0];
    const classIdx = parts[1];
    const levelVal = parts[2] || '1';
    
    if (classIdx !== undefined) {
        const emojis = ['🛡️ Válečník', '🔮 Mág', '🏹 Lovec', '✝️ Kněz'];
        return `${name} [${emojis[parseInt(classIdx)] || 'Hrdina'}] (Lvl ${levelVal})`;
    }
    return name;
}

// =============================================
// POSTAVA CUSTOMIZACE
// =============================================

export const customizerState = {
    color: '#22c55e',
    hat: '0',
    face: '0',
    vest: '0',
    class: '0'
};

const customizerOptions = {
    color: [
        { val: '#22c55e', label: 'Zelená' },
        { val: '#3b82f6', label: 'Modrá' },
        { val: '#f97316', label: 'Oranžová' },
        { val: '#ef4444', label: 'Červená' },
        { val: '#eab308', label: 'Žlutá' },
        { val: '#a855f7', label: 'Fialová' },
        { val: '#06b6d4', label: 'Tyrkysová' },
        { val: '#ec4899', label: 'Růžová' }
    ],
    hat: [
        { val: '0', label: '🚫' },
        { val: '1', label: '🧢' },
        { val: '2', label: '🧣' },
        { val: '3', label: '👑' },
        { val: '4', label: '🤠' },
        { val: '5', label: '😈' }
    ],
    face: [
        { val: '0', label: '👀' },
        { val: '1', label: '😠' },
        { val: '2', label: '😎' },
        { val: '3', label: '😊' }
    ],
    vest: [
        { val: '0', label: '🚫' },
        { val: '1', label: '🪖' },
        { val: '2', label: '🏥' },
        { val: '3', label: '🛡️' },
        { val: '4', label: '⭐' }
    ],
    class: [
        { val: '0', label: '🛡️ Válečník' },
        { val: '1', label: '🔮 Mág' },
        { val: '2', label: '🏹 Lovec' },
        { val: '3', label: '✝️ Kněz' }
    ]
};

export function initCustomizer() {
    // 1. Zaregistrovat globální okenní funkce pro HTML
    window.switchCustomizerTab = (tab) => {
        const tabs = ['color', 'hat', 'face', 'vest', 'class'];
        tabs.forEach(t => {
            const btn = document.getElementById(`tab-${t}`);
            if (btn) btn.classList.toggle('active', t === tab);
            const content = document.getElementById(`customizer-content-${t}`);
            if (content) content.classList.toggle('hidden', t !== tab);
        });
    };

    window.selectCustomizerOption = (type, val) => {
        customizerState[type] = val;
        if (type === 'class') {
            state.selectedClassIndex = parseInt(val);
        }
        
        // Aktualizovat aktivní třídy tlačítek
        document.querySelectorAll(`.custom-opt-btn-${type}`).forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-value') === val);
        });
        
        // Serializovat stav do selectedSkin
        state.selectedSkin = customizerState.color + customizerState.hat + customizerState.face + customizerState.vest;
        
        // Překreslit náhled
        drawPreview();
    };

    // 2. Vygenerovat tlačítka možností pro každou záložku
    for (const type in customizerOptions) {
        const container = document.getElementById(`customizer-content-${type}`);
        if (!container) continue;
        
        let html = '';
        customizerOptions[type].forEach(opt => {
            const isActive = customizerState[type] === opt.val;
            const style = type === 'color' ? `background: ${opt.val}` : '';
            const classes = type === 'class' ? 'custom-opt-btn-class-wide' : '';
            html += `
                <button type="button" 
                    class="custom-opt-btn custom-opt-btn-${type} ${isActive ? 'active' : ''} ${classes}" 
                    data-value="${opt.val}" 
                    style="${style}" 
                    title="${opt.label}"
                    onclick="window.selectCustomizerOption('${type}', '${opt.val}')">
                    ${type === 'color' ? '' : opt.label}
                </button>
            `;
        });
        container.innerHTML = html;
    }

    // 3. Nastavit počáteční selectedSkin
    state.selectedSkin = customizerState.color + customizerState.hat + customizerState.face + customizerState.vest;

    // 4. Nastavit chování přepínačů herního režimu
    const btnShooter = document.getElementById('btn-mode-shooter');
    const btnRpg = document.getElementById('btn-mode-rpg');
    const tabClass = document.getElementById('tab-class');

    const updateModeUI = () => {
        if (state.rpgMode) {
            btnRpg.style.background = 'linear-gradient(to right, #3b82f6, #60a5fa)';
            btnRpg.style.color = '#000';
            btnRpg.style.boxShadow = '0 0 10px rgba(59,130,246,0.35)';
            btnShooter.style.background = '#292524';
            btnShooter.style.color = '#78716c';
            btnShooter.style.boxShadow = 'none';

            if (tabClass) tabClass.classList.remove('hidden');
        } else {
            btnShooter.style.background = 'linear-gradient(to right, #10b981, #14b8a6)';
            btnShooter.style.color = '#0c0a09';
            btnShooter.style.boxShadow = '0 0 10px rgba(16,185,129,0.25)';
            btnRpg.style.background = '#292524';
            btnRpg.style.color = '#78716c';
            btnRpg.style.boxShadow = 'none';

            if (tabClass) {
                tabClass.classList.add('hidden');
                if (tabClass.classList.contains('active')) {
                    window.switchCustomizerTab('color');
                }
            }
        }
    };

    if (btnShooter && btnRpg) {
        btnShooter.addEventListener('click', () => {
            state.rpgMode = false;
            updateModeUI();
        });
        btnRpg.addEventListener('click', () => {
            state.rpgMode = true;
            updateModeUI();
        });
    }

    // Prvotní update režimu
    updateModeUI();

    // 5. První vykreslení náhledu
    setTimeout(drawPreview, 100);
}

export function drawPreview() {
    const canvas = document.getElementById('preview-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = 20;

    ctx.save();
    ctx.translate(cx, cy);

    // Stín pod postavou
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 3, radius, 0, Math.PI * 2);
    ctx.fill();

    // Tělo
    ctx.fillStyle = customizerState.color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vesta
    drawVest(ctx, radius, customizerState.vest);

    // Ruce (Pěsti) - otočené doprava (úhel 0)
    ctx.fillStyle = customizerState.color;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.5;
    
    // Horní ruka (Y < 0)
    ctx.beginPath();
    ctx.arc(radius * 0.4, -radius * 0.6, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Dolní ruka (Y > 0)
    ctx.beginPath();
    ctx.arc(radius * 0.4, radius * 0.6, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hlava
    ctx.fillStyle = customizerState.color;
    ctx.beginPath();
    ctx.arc(radius * 0.25, 0, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Obličej
    drawFace(ctx, radius, customizerState.face);

    // Čepice
    drawHat(ctx, radius, customizerState.hat);

    ctx.restore();
}

export function initShopUI() {
    const btnOpen = document.getElementById('btn-open-shop');
    const btnClose = document.getElementById('btn-close-shop');
    const modal = document.getElementById('shop-modal');
    
    if (btnOpen && modal) {
        btnOpen.addEventListener('click', () => {
            modal.style.display = 'flex';
            const p = state.localPlayer;
            if (p) {
                document.getElementById('shop-gold-text').textContent = `${p.gold} G`;
            }
        });
    }
    
    if (btnClose && modal) {
        btnClose.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    // Buy buttons
    const buyBtns = document.querySelectorAll('.btn-buy-item');
    buyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const p = state.localPlayer;
            if (!p) return;
            const itemId = btn.getAttribute('data-item');
            const price = parseInt(btn.getAttribute('data-price'), 10);
            
            // Limit each item to 1 for standard MOBA builds
            if (p.items.includes(itemId)) {
                playSound('punch'); // simple feedback
                return;
            }

            if (p.gold >= price) {
                p.gold -= price;
                p.items.push(itemId);
                
                // Recalculate stats immediately!
                p.maxHp = p.getMaxHpWithItems();
                p.hp = Math.min(p.maxHp, p.hp + (itemId === 'warmog' ? 100 : 0));
                p.speed = p.getSpeedWithItems();
                
                playSound('pickup');
                
                // Update UI
                updateUI();
                const shopGoldText = document.getElementById('shop-gold-text');
                if (shopGoldText) shopGoldText.textContent = `${p.gold} G`;
            } else {
                playSound('punch'); // Proceed with sound feedback
            }
        });
    });
}

