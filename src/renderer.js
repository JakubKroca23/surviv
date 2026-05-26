import { state } from './state.js';
import { MAP_SIZE, WEAPONS } from './constants.js';
import { getZoneState } from './player.js';

const imgTree = new Image(); imgTree.src = '/assets/tree.png';
const imgRock = new Image(); imgRock.src = '/assets/rock.png';
const imgCrate = new Image(); imgCrate.src = '/assets/crate.png';
const imgGround = new Image(); imgGround.src = '/assets/ground.png';
let groundPattern = null;

// =============================================
// RENDERER
// =============================================

export function drawGame() {
    if (!state.canvas || !state.ctx || !state.localPlayer) return;

    const canvas = state.canvas;
    const ctx    = state.ctx;
    const p      = state.localPlayer;

    const cw = window.innerWidth;
    const ch = window.innerHeight;
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;

    const cx = cw / 2 - p.x;
    const cy = ch / 2 - p.y;

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cx, cy);

    // Podlaha
    drawGround(ctx);

    // Zóna
    drawZone(ctx);

    // Překážky
    drawObstacles(ctx);

    // Loot
    drawLoot(ctx);

    // Střely
    drawBullets(ctx);

    // Ostatní hráči
    for (const id in state.activePlayers) {
        const e = state.activePlayers[id];
        if (e.hp > 0) drawCharacter(ctx, e, false);
    }

    // Lokální hráč
    drawCharacter(ctx, p, true);

    // Hit markery
    drawHitMarkers(ctx);

    ctx.restore();

    // Minimap + HUD
    drawMinimap();
    drawZoneHUD();
}

// =============================================
// PODLAHA
// =============================================

function drawGround(ctx) {
    if (imgGround.complete && imgGround.naturalWidth > 0) {
        if (!groundPattern) groundPattern = ctx.createPattern(imgGround, 'repeat');
        ctx.fillStyle = groundPattern;
        ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    } else {
        const grad = ctx.createLinearGradient(0, 0, MAP_SIZE, MAP_SIZE);
        grad.addColorStop(0,   '#1a2e1a');
        grad.addColorStop(0.5, '#1e3d1e');
        grad.addColorStop(1,   '#162614');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.015)';
    ctx.lineWidth   = 1;
    const step = 100;
    for (let x = 0; x <= MAP_SIZE; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_SIZE); ctx.stroke(); }
    for (let y = 0; y <= MAP_SIZE; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_SIZE, y); ctx.stroke(); }
    ctx.restore();
}

// =============================================
// ZÓNA
// =============================================

function drawZone(ctx) {
    const zone = getZoneState();
    if (zone.radius >= MAP_SIZE * 1.05) return;

    ctx.save();
    ctx.fillStyle = 'rgba(239,68,68,0.07)';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(zone.center.x, zone.center.y, zone.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#f87171';
    ctx.lineWidth   = 3;
    ctx.setLineDash([15, 10]);
    ctx.lineDashOffset = Date.now() * 0.04;
    ctx.beginPath();
    ctx.arc(zone.center.x, zone.center.y, zone.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

// =============================================
// PŘEKÁŽKY
// =============================================

function drawObstacles(ctx) {
    state.mapObstacles.forEach(obs => {
        if (obs.hp <= 0) return;
        ctx.save();


        if (obs.type === 'tree') {
            if (imgTree.complete && imgTree.naturalWidth > 0) {
                const s = obs.radius * 3.5;
                ctx.drawImage(imgTree, obs.x - s/2, obs.y - s/2, s, s);
            } else {
                ctx.fillStyle = '#0f4715';
                ctx.beginPath(); ctx.arc(obs.x, obs.y, obs.radius * 1.1, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#16a34a';
                ctx.beginPath(); ctx.arc(obs.x, obs.y, obs.radius * 0.9, 0, Math.PI * 2); ctx.fill();
            }
        } else if (obs.type === 'rock') {
            if (imgRock.complete && imgRock.naturalWidth > 0) {
                const s = obs.radius * 2.5;
                ctx.drawImage(imgRock, obs.x - s/2, obs.y - s/2, s, s);
            } else {
                ctx.fillStyle = '#44403c';
                ctx.beginPath(); ctx.ellipse(obs.x, obs.y, obs.radius * 1.2, obs.radius * 0.85, 0.4, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#57534e';
                ctx.beginPath(); ctx.ellipse(obs.x - obs.radius * 0.1, obs.y - obs.radius * 0.15, obs.radius * 0.9, obs.radius * 0.65, 0.4, 0, Math.PI * 2); ctx.fill();
            }
        } else {
            // crate
            if (imgCrate.complete && imgCrate.naturalWidth > 0) {
                const s = obs.radius * 2.2;
                ctx.save();
                ctx.translate(obs.x, obs.y);
                const hpRatio = obs.hp / obs.maxHp;
                ctx.globalAlpha = 0.5 + (0.5 * hpRatio);
                ctx.drawImage(imgCrate, -s/2, -s/2, s, s);
                ctx.restore();
            } else {
                const hpRatio = obs.hp / obs.maxHp;
                ctx.fillStyle = `hsl(30, 60%, ${15 + hpRatio * 10}%)`;
                const r = 8;
                const x = obs.x - obs.radius, y = obs.y - obs.radius;
                const s = obs.radius * 2;
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + s - r, y);
                ctx.arcTo(x + s, y, x + s, y + r, r);
                ctx.lineTo(x + s, y + s - r);
                ctx.arcTo(x + s, y + s, x + s - r, y + s, r);
                ctx.lineTo(x + r, y + s);
                ctx.arcTo(x, y + s, x, y + s - r, r);
                ctx.lineTo(x, y + r);
                ctx.arcTo(x, y, x + r, y, r);
                ctx.closePath();
                ctx.fill();
            }
        }
        ctx.restore();
    });
}

// =============================================
// LOOT
// =============================================

function drawLoot(ctx) {
    const now  = Date.now();
    state.itemsOnGround.forEach(item => {
        const bob = Math.sin(now * 0.003) * 3;
        ctx.save();
        ctx.fillStyle   = item.type === 'medkit' ? 'rgba(16,185,129,0.2)' : 'rgba(251,191,36,0.15)';
        ctx.beginPath();
        ctx.arc(item.x, item.y + bob, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle   = item.type === 'medkit' ? '#22c55e' : '#fbbf24';
        ctx.font        = '16px Arial';
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.type === 'medkit' ? '+' : '🔫', item.x, item.y + bob);
        ctx.restore();
    });
}

// =============================================
// STŘELY
// =============================================

function drawBullets(ctx) {
    state.localBullets.forEach(b => {
        ctx.save();
        ctx.fillStyle   = '#fff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// =============================================
// CHARAKTER
// =============================================

export function drawCharacter(ctx, player, isLocal) {
    const { x, y, angle, radius, color, hp, maxHp, name, currentWeapon } = player;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Tělo
    ctx.fillStyle   = color || '#22c55e';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isLocal ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Zbraň
    const weapon = WEAPONS[currentWeapon || 'fists'];
    const isRange = currentWeapon !== 'fists';
    ctx.fillStyle   = '#1c1917';
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth   = 2;

    if (isRange) {
        ctx.fillRect(radius * 0.4, -5, radius * 1.1, 10);
        ctx.strokeRect(radius * 0.4, -5, radius * 1.1, 10);
    } else {
        ctx.fillRect(radius * 0.4, -4, radius * 0.6, 8);
        ctx.strokeRect(radius * 0.4, -4, radius * 0.6, 8);
    }

    // Hlava
    ctx.fillStyle = color || '#22c55e';
    ctx.beginPath();
    ctx.arc(radius * 0.25, 0, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // HP bar + jméno
    const barW = radius * 2.2;
    const barH = 5;
    const bx   = x - barW / 2;
    const by   = y - radius - 18;
    const hpRatio = Math.max(0, (hp || 0) / (maxHp || 100));

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(bx, by, barW, barH, 3);
    ctx.fill();

    ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : (hpRatio > 0.25 ? '#eab308' : '#ef4444');
    ctx.beginPath();
    ctx.roundRect(bx, by, barW * hpRatio, barH, 3);
    ctx.fill();

    ctx.fillStyle   = isLocal ? '#fff' : 'rgba(255,255,255,0.8)';
    ctx.font        = isLocal ? '700 12px Segoe UI' : '500 11px Segoe UI';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    
    // Rychlý "fake" text shadow
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillText(name || 'Hráč', x + 1, by - 7);
    
    ctx.fillStyle   = isLocal ? '#fff' : 'rgba(255,255,255,0.8)';
    ctx.fillText(name || 'Hráč', x, by - 8);
}

// =============================================
// HIT MARKERY
// =============================================

function drawHitMarkers(ctx) {
    for (let i = state.hitMarkers.length - 1; i >= 0; i--) {
        const hm = state.hitMarkers[i];
        hm.alpha -= 0.04;
        if (hm.alpha <= 0) { state.hitMarkers.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = hm.alpha;
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth   = 2;
        const s = 8;
        ctx.beginPath(); ctx.moveTo(hm.x - s, hm.y); ctx.lineTo(hm.x + s, hm.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hm.x, hm.y - s); ctx.lineTo(hm.x, hm.y + s); ctx.stroke();
        ctx.restore();
    }
}

// =============================================
// MINIMAP
// =============================================

function drawMinimap() {
    const mc = state.minimapCanvas;
    const mx = state.mctx;
    if (!mc || !mx || !state.localPlayer) return;

    const mw = mc.width;
    const mh = mc.height;
    const scale = mw / MAP_SIZE;
    const p     = state.localPlayer;

    mx.clearRect(0, 0, mw, mh);
    mx.fillStyle = 'rgba(0,0,0,0.8)';
    mx.fillRect(0, 0, mw, mh);

    // Zóna na minimapě
    const zone = getZoneState();
    if (zone.radius < MAP_SIZE) {
        mx.save();
        mx.fillStyle   = 'rgba(239,68,68,0.25)';
        mx.fillRect(0, 0, mw, mh);
        mx.globalCompositeOperation = 'destination-out';
        mx.beginPath();
        mx.arc(zone.center.x * scale, zone.center.y * scale, zone.radius * scale, 0, Math.PI * 2);
        mx.fillStyle = 'rgba(0,0,0,1)';
        mx.fill();
        mx.restore();
    }

    // Ostatní hráči
    for (const id in state.activePlayers) {
        const e = state.activePlayers[id];
        if (e.hp > 0) {
            mx.fillStyle = e.color || '#fff';
            mx.beginPath();
            mx.arc(e.x * scale, e.y * scale, 3, 0, Math.PI * 2);
            mx.fill();
        }
    }

    // Lokální hráč
    mx.fillStyle = '#fff';
    mx.beginPath();
    mx.arc(p.x * scale, p.y * scale, 4, 0, Math.PI * 2);
    mx.fill();
    mx.strokeStyle = '#22c55e';
    mx.lineWidth   = 1.5;
    mx.stroke();
}

// =============================================
// ZONE HUD
// =============================================

let lastZoneState = '';

function drawZoneHUD() {
    const zone = getZoneState();
    const currentState = zone.statusText + zone.timerText;
    if (lastZoneState === currentState) return;
    lastZoneState = currentState;

    const alertEl = document.getElementById('zone-alert');
    const timerEl = document.getElementById('zone-timer');
    if (alertEl) alertEl.textContent = zone.statusText;
    if (timerEl) timerEl.textContent = zone.timerText;

    if (alertEl) {
        alertEl.style.color = zone.state === 'stable' ? '#34d399' : (zone.state === 'shrinking' ? '#fbbf24' : '#f87171');
    }
}
