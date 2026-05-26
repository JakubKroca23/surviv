import { state } from './state.js';
import { MAP_SIZE, WEAPONS } from './constants.js';
import { getZoneState } from './player.js';
import { updateUI } from './ui.js';
import { updatePlayerOnAppwrite, setKilledBy, removePlayerFromAppwrite } from './network.js';

// =============================================
// HERNÍ LOGIKA – UPDATE LOOP
// =============================================

export function updateGame() {
    if (!state.gameActive || !state.localPlayer) return;
    const p = state.localPlayer;

    // 1. Pohyb
    let mx = 0, my = 0;
    if (state.isMobile) {
        mx = state.joystickLeft.vx * p.speed;
        my = state.joystickLeft.vy * p.speed;
    } else {
        if (state.keys.w) my = -p.speed;
        if (state.keys.s) my =  p.speed;
        if (state.keys.a) mx = -p.speed;
        if (state.keys.d) mx =  p.speed;
        if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }
    }

    p.x = Math.max(p.radius, Math.min(MAP_SIZE - p.radius, p.x + mx));
    p.y = Math.max(p.radius, Math.min(MAP_SIZE - p.radius, p.y + my));

    // Kolize s překážkami
    state.mapObstacles.forEach(obs => {
        if (obs.hp <= 0) return;
        const d = Math.hypot(p.x - obs.x, p.y - obs.y);
        const min = p.radius + obs.radius;
        if (d < min) {
            const a = Math.atan2(p.y - obs.y, p.x - obs.x);
            p.x = obs.x + Math.cos(a) * min;
            p.y = obs.y + Math.sin(a) * min;
        }
    });

    // 2. Střelba (desktop)
    if (!state.isMobile && state.isMouseDown) p.shoot();

    // 3. Projektily
    for (let i = state.localBullets.length - 1; i >= 0; i--) {
        const b = state.localBullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.travelled += Math.hypot(b.vx, b.vy);

        if (b.travelled > b.range) { state.localBullets.splice(i, 1); continue; }

        let removed = false;

        // Zásah překážky
        for (const obs of state.mapObstacles) {
            if (obs.hp <= 0) continue;
            if (Math.hypot(b.x - obs.x, b.y - obs.y) < obs.radius) {
                if (obs.type === 'crate') {
                    obs.hp -= b.damage;
                    if (obs.hp <= 0) spawnLoot(obs.x, obs.y, obs.lootType);
                }
                state.localBullets.splice(i, 1);
                removed = true;
                break;
            }
        }
        if (removed) continue;

        if (b.ownerId === state.playerId) {
            // Zásah nepřítele (klientský hit detect)
            for (const id in state.activePlayers) {
                const enemy = state.activePlayers[id];
                if (enemy.hp <= 0) continue;
                if (Math.hypot(b.x - enemy.x, b.y - enemy.y) < 30) {
                    spawnHitMarker(b.x, b.y);
                    state.localBullets.splice(i, 1);
                    removed = true;
                    break;
                }
            }
        } else {
            // Zásah lokálního hráče
            if (Math.hypot(b.x - p.x, b.y - p.y) < p.radius && p.hp > 0) {
                p.hp = Math.max(0, p.hp - b.damage);
                spawnHitMarker(b.x, b.y);
                updateUI();
                state.localBullets.splice(i, 1);
                if (p.hp <= 0) handleDeath(b.ownerId);
                break;
            }
        }
    }

    // 4. Interpolace ostatních hráčů
    for (const id in state.activePlayers) {
        const e = state.activePlayers[id];
        if (e.targetX === undefined) continue;
        e.x += (e.targetX - e.x) * 0.25;
        e.y += (e.targetY - e.y) * 0.25;
        let diff = (e.targetAngle || 0) - (e.angle || 0);
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        e.angle = (e.angle || 0) + diff * 0.25;
    }

    // 5. Loot pickup
    for (let i = state.itemsOnGround.length - 1; i >= 0; i--) {
        const item = state.itemsOnGround[i];
        if (Math.hypot(p.x - item.x, p.y - item.y) < p.radius + 15) {
            if (item.type === 'medkit') {
                p.medkits++;
            } else {
                p.weapons[item.type] = true;
                p.currentWeapon = item.type;
                p.ammo[item.type] = WEAPONS[item.type].ammoMax;
            }
            state.itemsOnGround.splice(i, 1);
            updateUI();
        }
    }

    // 6. Zóna damage
    const zone = getZoneState();
    if (Math.hypot(p.x - zone.center.x, p.y - zone.center.y) > zone.radius) {
        p.hp = Math.max(0, p.hp - (zone.state === 'collapsing' ? 1.0 : 0.4));
        updateUI();
        if (p.hp <= 0) handleDeath('Zóna');
    }
}

// =============================================
// POMOCNÉ FUNKCE
// =============================================

export function spawnLoot(x, y, type) {
    state.itemsOnGround.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 30,
        type,
    });
}

export function spawnHitMarker(x, y) {
    state.hitMarkers.push({ x, y, alpha: 1 });
}

export async function handleDeath(killerId) {
    if (!state.gameActive) return;
    state.gameActive = false;
    if (state.networkInterval) { clearInterval(state.networkInterval); state.networkInterval = null; }

    let killerName = 'Divoká zóna';
    if (killerId && killerId !== 'Zóna') {
        const enemy = state.activePlayers[killerId];
        if (enemy) killerName = enemy.name;
        await setKilledBy(killerId);
    }

    document.getElementById('death-killer-text').textContent = `Zabil tě: ${killerName}`;
    document.getElementById('death-stat-kills').textContent  = state.localPlayer.kills;
    const elapsed = Math.floor((Date.now() - state.playStartTime) / 1000);
    document.getElementById('death-stat-time').textContent   = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
    document.getElementById('death-screen').style.display    = 'flex';
    document.getElementById('game-ui').style.display         = 'none';

    await removePlayerFromAppwrite();
}
