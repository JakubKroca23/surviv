import { state } from './state.js';
import { MAP_SIZE, WEAPONS } from './constants.js';
import { getZoneState } from './player.js';

const imgTree = new Image(); imgTree.src = '/assets/tree.png';
const imgRock = new Image(); imgRock.src = '/assets/rock.png';
const imgCrate = new Image(); imgCrate.src = '/assets/crate.png';
const imgGround = new Image(); imgGround.src = '/assets/ground.png';
let groundPattern = null;

function adjustAlpha(color, alpha) {
    if (!color) return `rgba(255, 255, 255, ${alpha})`;
    if (color.startsWith('#')) {
        let hex = color.slice(1);
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        if (hex.length > 6) {
            hex = hex.slice(0, 6);
        }
        const r = parseInt(hex.slice(0, 2), 16) || 0;
        const g = parseInt(hex.slice(2, 4), 16) || 0;
        const b = parseInt(hex.slice(4, 6), 16) || 0;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
}

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

    const scale = state.viewportScale || 1.0;

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(scale, scale);
    ctx.translate(-p.x + (state.screenShake ? state.screenShake.x : 0), -p.y + (state.screenShake ? state.screenShake.y : 0));

    // 1. Podlaha
    drawGround(ctx);

    // 2. Zóna
    drawZone(ctx);

    // 2.5 Částice
    drawParticles(ctx);

    // 3. Statické překážky kromě korun stromů (kmeny stromů, skály, krabice)
    drawTrunksAndRocks(ctx);

    // 4. Loot na zemi
    drawLoot(ctx);

    // 5. Střely
    drawBullets(ctx);

    // 6. Ostatní hráči (pokud nejsou skrytí pod stromem)
    for (const id in state.activePlayers) {
        const e = state.activePlayers[id];
        if (e.hp > 0) {
            // Zjistit, zda je nepřítel schovaný pod stromem
            let isHidden = false;
            if (e.teamId !== p.teamId) {
                for (const obs of state.mapObstacles) {
                    if (obs.type === 'tree' && obs.hp > 0) {
                        const distEnemy = Math.hypot(e.x - obs.x, e.y - obs.y);
                        if (distEnemy < obs.radius * 1.5) {
                            // Nepřítel je pod tímto stromem!
                            // Je lokální hráč pod stejným stromem?
                            const distLocal = Math.hypot(p.x - obs.x, p.y - obs.y);
                            if (distLocal >= obs.radius * 1.5) {
                                // Lokální hráč není pod stejným stromem -> nepřítel je skrytý!
                                isHidden = true;
                                break;
                            }
                        }
                    }
                }
            }
            if (!isHidden) {
                drawCharacter(ctx, e, false);
            }
        }
    }

    // 7. Lokální hráč
    drawCharacter(ctx, p, true);

    // 8. Koruny stromů s dynamickou průhledností navrch!
    drawTreeCanopies(ctx);

    // RPG-MOBA: Kúzla a Slizy na bojisku
    drawSpellEffects(ctx);
    drawNeutralSlimes(ctx);

    // 9. Hit markery & částice krve
    drawHitMarkers(ctx);
    drawBloodParticles(ctx);

    ctx.restore();

    // Minimap + HUD
    drawMinimap();
    drawZoneHUD();
    
    // 10. Vykreslení vlastního taktického zaměřovače (křížku) na desktopu
    drawCrosshair(ctx);
}

function drawCrosshair(ctx) {
    if (state.isMobile || !state.mouseX || !state.mouseY || !state.localPlayer || state.localPlayer.hp <= 0) return;
    ctx.save();
    ctx.translate(state.mouseX, state.mouseY);
    
    // Zářící neonově zelený herní zaměřovač
    ctx.strokeStyle = '#22c55e';
    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 5;
    ctx.lineWidth = 1.8;
    
    const s = 11;
    const gap = 4.5;
    
    // Křížek
    ctx.beginPath();
    ctx.moveTo(-s, 0); ctx.lineTo(-gap, 0);
    ctx.moveTo(gap, 0); ctx.lineTo(s, 0);
    ctx.moveTo(0, -s); ctx.lineTo(0, -gap);
    ctx.moveTo(0, gap); ctx.lineTo(0, s);
    ctx.stroke();
    
    // Středová tečka
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0; // vypnout glow pro tečku
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

// =============================================
// PODLAHA
// =============================================

let neonGridPattern = null;

function drawGround(ctx) {
    if (!neonGridPattern) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 100;
        tempCanvas.height = 100;
        const tctx = tempCanvas.getContext('2d');
        
        // Dark futuristic slate background
        tctx.fillStyle = '#0f172a';
        tctx.fillRect(0, 0, 100, 100);
        
        // Subtle neon blue grid lines
        tctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
        tctx.lineWidth = 1;
        tctx.beginPath();
        tctx.moveTo(0, 0);
        tctx.lineTo(100, 0);
        tctx.moveTo(0, 0);
        tctx.lineTo(0, 100);
        tctx.stroke();
        
        // Glowing connection dots at intersections
        tctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
        tctx.beginPath();
        tctx.arc(0, 0, 2.5, 0, Math.PI * 2);
        tctx.fill();
        
        neonGridPattern = ctx.createPattern(tempCanvas, 'repeat');
    }
    
    ctx.fillStyle = neonGridPattern;
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    // Dynamic neon boundary outline
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);
}

// =============================================
// ZÓNA
// =============================================

function drawZone(ctx) {
    const zone = getZoneState();
    if (zone.radius >= MAP_SIZE * 1.05) return;

    ctx.save();
    // Beautiful red overlay drawn only OUTSIDE the safe circle using even-odd wind rule.
    // This completely prevents destination-out from making our grass floor transparent/black!
    ctx.fillStyle = 'rgba(239, 68, 68, 0.16)';
    ctx.beginPath();
    ctx.rect(0, 0, MAP_SIZE, MAP_SIZE); // Outer rectangle (counter-clockwise)
    ctx.arc(zone.center.x, zone.center.y, zone.radius, 0, Math.PI * 2, true); // Inner circle (clockwise)
    ctx.fill();
    ctx.restore();

    ctx.save();
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
// ČÁSTICE NEONU
// =============================================

function drawParticles(ctx) {
    if (!state.particles) return;
    state.particles.forEach(pt => {
        ctx.save();
        ctx.globalAlpha = pt.alpha;
        
        if (pt.type === 'spark') {
            ctx.fillStyle = pt.color;
            ctx.shadowColor = pt.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
            ctx.fill();
        } else if (pt.type === 'debris') {
            ctx.translate(pt.x, pt.y);
            ctx.rotate(pt.angle);
            ctx.fillStyle = pt.color;
            ctx.fillRect(-pt.radius, -pt.radius / 2, pt.radius * 2, pt.radius);
        } else if (pt.type === 'trail') {
            ctx.fillStyle = pt.color;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    });
}

// =============================================
// KMENY, SKÁLY A KRABICE
// =============================================

function drawTrunksAndRocks(ctx) {
    state.mapObstacles.forEach(obs => {
        if (obs.hp <= 0) return;
        ctx.save();

        if (obs.type === 'rock') {
            const r = obs.radius;
            ctx.save();
            ctx.translate(obs.x, obs.y);
            
            // Neon Glow Border
            ctx.strokeStyle = 'rgba(120, 113, 108, 0.45)';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.ellipse(0, 0, r, r * 0.85, 0.2, 0, Math.PI * 2);
            ctx.stroke();
            
            // Soft drop shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.beginPath();
            ctx.ellipse(3, 5, r * 1.1, r * 0.95, 0.3, 0, Math.PI * 2);
            ctx.fill();
            
            // Outer stone edge
            ctx.fillStyle = '#44403c';
            ctx.beginPath();
            ctx.ellipse(0, 0, r, r * 0.85, 0.2, 0, Math.PI * 2);
            ctx.fill();
            
            // Facet 1 (Top side light highlight)
            ctx.fillStyle = '#78716c';
            ctx.beginPath();
            ctx.ellipse(-r * 0.1, -r * 0.15, r * 0.8, r * 0.65, 0.2, 0, Math.PI * 2);
            ctx.fill();
            
            // Facet 2 (Top side extra brightness)
            ctx.fillStyle = '#a8a29e';
            ctx.beginPath();
            ctx.ellipse(-r * 0.2, -r * 0.25, r * 0.5, r * 0.35, 0.25, 0, Math.PI * 2);
            ctx.fill();
            
            // Drawing specular shines and cracks
            ctx.strokeStyle = '#d6d3d1';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-r * 0.5, -r * 0.2);
            ctx.lineTo(-r * 0.3, -r * 0.4);
            ctx.lineTo(r * 0.1, -r * 0.5);
            ctx.stroke();
            
            // Crack details (dark lines)
            ctx.strokeStyle = '#292524';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(r * 0.1, r * 0.1);
            ctx.lineTo(r * 0.4, r * 0.3);
            ctx.lineTo(r * 0.5, r * 0.15);
            ctx.stroke();
            
            ctx.restore();
        } else if (obs.type === 'crate') {
            const r = obs.radius;
            const s = r * 2;
            const hpRatio = obs.hp / obs.maxHp;
            
            ctx.save();
            ctx.translate(obs.x, obs.y);
            ctx.globalAlpha = 0.5 + (0.5 * hpRatio);
            
            // Neon Glow Border
            ctx.strokeStyle = 'rgba(217, 119, 6, 0.45)';
            ctx.lineWidth = 8;
            ctx.strokeRect(-r, -r, s, s);
            
            // Drop shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(-r + 4, -r + 5, s, s);
            
            // Outer wood frame
            ctx.fillStyle = '#78350f'; // Dark wood border
            ctx.fillRect(-r, -r, s, s);
            
            // Inner panel
            ctx.fillStyle = '#b45309'; // Medium wood inside
            const innerOffset = r * 0.2;
            const innerS = s - (innerOffset * 2);
            ctx.fillRect(-r + innerOffset, -r + innerOffset, innerS, innerS);
            
            // Diagonal beam
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = r * 0.25;
            ctx.beginPath();
            ctx.moveTo(-r + innerOffset, -r + innerOffset);
            ctx.lineTo(r - innerOffset, r - innerOffset);
            ctx.stroke();
            
            // Wood grain / plank lines
            ctx.strokeStyle = '#92400e';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-r + innerOffset, -r + innerOffset + innerS/3);
            ctx.lineTo(r - innerOffset, -r + innerOffset + innerS/3);
            ctx.moveTo(-r + innerOffset, -r + innerOffset + (innerS/3)*2);
            ctx.lineTo(r - innerOffset, -r + innerOffset + (innerS/3)*2);
            ctx.stroke();
            
            // Corner metal brackets
            ctx.fillStyle = '#451a03';
            const cornerSize = r * 0.3;
            // Top-left
            ctx.fillRect(-r, -r, cornerSize, cornerSize);
            // Top-right
            ctx.fillRect(r - cornerSize, -r, cornerSize, cornerSize);
            // Bottom-left
            ctx.fillRect(-r, r - cornerSize, cornerSize, cornerSize);
            // Bottom-right
            ctx.fillRect(r - cornerSize, r - cornerSize, cornerSize, cornerSize);
            
            ctx.restore();
        } else if (obs.type === 'tree') {
            const r = obs.radius;
            ctx.save();
            ctx.translate(obs.x, obs.y);
            
            // Neon Glow Trunk
            ctx.strokeStyle = 'rgba(120, 53, 15, 0.45)';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
            ctx.stroke();
            
            // Trunk body
            ctx.fillStyle = '#78350f';
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
            ctx.fill();
            
            // Concentric rings
            ctx.strokeStyle = '#451a03';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.strokeStyle = '#92400e';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
        }
        ctx.restore();
    });
}

// =============================================
// KORUNY STROMŮ (DRAWN AFTER PLAYERS)
// =============================================

function drawTreeCanopies(ctx) {
    state.mapObstacles.forEach(obs => {
        if (obs.type !== 'tree' || obs.hp <= 0) return;
        ctx.save();

        let playerUnder = false;

        // Zkontrolovat zda lokální hráč je pod stromem
        if (state.localPlayer && state.localPlayer.hp > 0) {
            const d = Math.hypot(state.localPlayer.x - obs.x, state.localPlayer.y - obs.y);
            if (d < obs.radius * 1.5) {
                playerUnder = true;
            }
        }

        // Zkontrolovat zda ostatní hráči v naší místnosti jsou pod stromem
        if (!playerUnder) {
            for (const id in state.activePlayers) {
                const e = state.activePlayers[id];
                if (e.hp > 0) {
                    const d = Math.hypot(e.x - obs.x, e.y - obs.y);
                    if (d < obs.radius * 1.5) {
                        playerUnder = true;
                        break;
                    }
                }
            }
        }

        // Pokud je pod ním hráč, vykreslí se strom velmi průhledný (stealth mode)
        ctx.globalAlpha = playerUnder ? 0.28 : 0.98;

        const r = obs.radius;
        ctx.save();
        ctx.translate(obs.x, obs.y);
        
        // Neon Glow Foliage outline
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.35)';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
        ctx.stroke();

        // 1. Soft ambient occlusion drop shadow under foliage
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.arc(4, 8, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
        
        // 2. Base Dark Green foliage layer
        ctx.fillStyle = '#14532d';
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
        
        // 3. Middle layer leaf clusters (procedural organic look)
        ctx.fillStyle = '#15803d';
        const numClusters = 7;
        for (let i = 0; i < numClusters; i++) {
            const angle = (i * 2 * Math.PI) / numClusters;
            const cx = Math.cos(angle) * r * 0.9;
            const cy = Math.sin(angle) * r * 0.9;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 4. Bright highlight leaf layer
        ctx.fillStyle = '#22c55e';
        const numHighlights = 5;
        for (let i = 0; i < numHighlights; i++) {
            const angle = (i * 2 * Math.PI) / numHighlights + 0.3;
            const cx = Math.cos(angle) * r * 0.55;
            const cy = Math.sin(angle) * r * 0.55;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 5. Sun highlight top layer
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.arc(-r * 0.2, -r * 0.2, r * 0.75, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        ctx.restore();
    });
}

// =============================================
// LOOT
// =============================================

function drawLoot(ctx) {
    const now  = Date.now();
    state.itemsOnGround.forEach(item => {
        const bob = Math.sin(now * 0.0035) * 3.5;
        ctx.save();
        ctx.translate(item.x, item.y + bob);
        
        // Premium neon backdrop glow (zvětšeno na 1.8x)
        const glowColor = item.type === 'medkit' ? 'rgba(16,185,129,0.35)' : 'rgba(251,191,36,0.26)';
        ctx.fillStyle   = glowColor;
        ctx.beginPath();
        ctx.arc(0, 0, 36, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = item.type === 'medkit' ? 'rgba(16,185,129,0.55)' : 'rgba(251,191,36,0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Zvětšení samotného předmětu
        ctx.scale(1.7, 1.7);

        // Realistic silhouette drawings on the ground
        if (item.type === 'medkit') {
            // Draw a realistic medical kit container
            ctx.fillStyle = '#ef4444'; // Red med container
            ctx.fillRect(-10, -7, 20, 14);
            // Handle
            ctx.strokeStyle = '#991b1b';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-4, -7);
            ctx.lineTo(-4, -10);
            ctx.lineTo(4, -10);
            ctx.lineTo(4, -7);
            ctx.stroke();
            // Bold white cross in center
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-6, -1.5, 12, 3);
            ctx.fillRect(-1.5, -6, 3, 12);
        } else {
            // Draw a small detailed vector silhouette based on weapon type
            ctx.fillStyle = '#1e293b';
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 1;
            
            if (item.type === 'pistol') {
                ctx.fillRect(-6, -2, 12, 4); // slide
                ctx.fillStyle = '#78350f';
                ctx.fillRect(-5, 0, 3, 6);  // grip
            } else if (item.type === 'smg') {
                ctx.fillRect(-9, -2.5, 18, 5); // body
                ctx.fillStyle = '#020617';
                ctx.fillRect(-4, 0, 3, 8);    // curved magazine
            } else if (item.type === 'shotgun') {
                ctx.fillStyle = '#78350f';
                ctx.fillRect(-11, -3, 8, 5);  // wooden stock
                ctx.fillStyle = '#6b7280';
                ctx.fillRect(-3, -2, 16, 3.5); // double steel barrel
            } else if (item.type === 'rifle') {
                ctx.fillStyle = '#78350f';
                ctx.fillRect(-11, -3, 6, 6);   // stock
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(-5, -2, 12, 4.5); // frame
                ctx.fillRect(7, -1, 7, 2);     // barrel
                ctx.fillRect(-2, 0, 3, 7);     // mag
            } else if (item.type === 'sniper') {
                ctx.fillStyle = '#14532d';
                ctx.fillRect(-13, -3.5, 11, 6.5); // body
                ctx.fillStyle = '#020617';
                ctx.fillRect(-2, -1.5, 20, 2.8);  // extra long heavy barrel
                ctx.fillRect(-4, -6.5, 6, 3.2);   // scope
            } else if (item.type === 'm4a1') {
                ctx.fillStyle = '#06b6d4'; // Cyan neon
                ctx.fillRect(-11, -3, 5, 5.5); // stock
                ctx.fillStyle = '#0891b2';
                ctx.fillRect(-6, -2.2, 12, 4.2); // frame
                ctx.fillStyle = '#22d3ee';
                ctx.fillRect(6, -1, 9, 1.8); // barrel
                ctx.fillStyle = '#0891b2';
                ctx.fillRect(-1, 0, 3.2, 7.5); // straight magazine
            } else if (item.type === 'ak47') {
                ctx.fillStyle = '#f97316'; // Orange neon
                ctx.fillRect(-12, -3.2, 6, 5.5); // stock
                ctx.fillStyle = '#ea580c';
                ctx.fillRect(-6, -2.5, 11, 4.8); // frame
                ctx.fillStyle = '#fdba74';
                ctx.fillRect(5, -1.2, 10, 2); // barrel
                ctx.fillStyle = '#ea580c';
                ctx.fillRect(-2, 0, 3.2, 8); // curved magazine
            } else if (item.type === 'grenade') {
                ctx.fillStyle = '#15803d'; // Dark green
                ctx.beginPath();
                ctx.arc(0, 1, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#94a3b8';
                ctx.fillRect(-2.5, -4.5, 5, 1.8);
                ctx.fillStyle = (now % 600 < 300) ? '#ef4444' : '#15803d';
                ctx.beginPath();
                ctx.arc(0, 1, 1.5, 0, Math.PI * 2);
                ctx.fill();
            } else if (item.type === 'meth') {
                ctx.fillStyle = '#a855f7'; // Purple stim
                ctx.fillRect(-3, -7, 6, 12);
                ctx.fillStyle = '#c084fc';
                ctx.fillRect(-1.5, -9, 3, 2);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(-0.8, 5, 1.6, 4);
            } else if (item.type && item.type.startsWith('scope_')) {
                const power = item.type.split('_')[1] || '3x';
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(-7.5, 0); ctx.lineTo(7.5, 0);
                ctx.moveTo(0, -7.5); ctx.lineTo(0, 7.5);
                ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.font = '900 6.5px Segoe UI';
                ctx.textAlign = 'center';
                ctx.fillText(power, 0, 2.2);
            }
        }
        ctx.restore();
    });
}

// =============================================
// STŘELY (GLOWING TRACERS)
// =============================================

function drawBullets(ctx) {
    state.localBullets.forEach(b => {
        ctx.save();
        
        if (b.bulletType === 'fireball') {
            // Mage Fireball (Fiery pulsing orange sphere)
            const pulse = 1.0 + Math.sin(Date.now() * 0.02) * 0.15;
            ctx.shadowColor = '#f97316';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#ea580c';
            ctx.beginPath();
            ctx.arc(b.x, b.y, 8.5 * pulse, 0, Math.PI * 2);
            ctx.fill();
            // Yellow inner core
            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.arc(b.x, b.y, 4 * pulse, 0, Math.PI * 2);
            ctx.fill();
        } else if (b.bulletType === 'arrow' || b.bulletType === 'explosive_arrow') {
            // Ranger Arrow (glowing cyan / pink needle)
            const color = b.bulletType === 'explosive_arrow' ? '#ec4899' : '#60a5fa';
            ctx.strokeStyle = color;
            ctx.lineWidth = 3.5;
            ctx.shadowColor = color;
            ctx.shadowBlur = 6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 1.6, b.y - b.vy * 1.6);
            ctx.stroke();
            
            // White core
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 0.8, b.y - b.vy * 0.8);
            ctx.stroke();
        } else if (b.bulletType === 'holy_beam') {
            // Priest Holy beam laser trail
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
            ctx.lineWidth = 4.2;
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur = 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 1.25, b.y - b.vy * 1.25);
            ctx.stroke();
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 0.6, b.y - b.vy * 0.6);
            ctx.stroke();
        } else {
            // 1. Outer neon tracer trail glow
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
            ctx.lineWidth = 3.2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 1.5, b.y - b.vy * 1.5);
            ctx.stroke();
            
            // 2. White bright hot core
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 0.75, b.y - b.vy * 0.75);
            ctx.stroke();
        }
        
        ctx.restore();
    });
}

// =============================================
// DEKÓDOVÁNÍ CUSTOMIZACE
// =============================================

export function decodeCustomization(colorStr) {
    const defaultColor = '#22c55e';
    const result = {
        color: defaultColor,
        hat: '0',
        face: '0',
        vest: '0'
    };
    
    if (!colorStr) return result;
    
    if (colorStr.startsWith('#') && colorStr.length === 10) {
        result.color = colorStr.substring(0, 7);
        result.hat = colorStr.charAt(7);
        result.face = colorStr.charAt(8);
        result.vest = colorStr.charAt(9);
    } else {
        result.color = colorStr;
    }
    return result;
}

export function drawFace(ctx, radius, faceIndex) {
    ctx.save();
    const hx = radius * 0.25;
    const hy = 0;
    const hr = radius * 0.45;
    
    if (faceIndex === '0' || faceIndex === '1' || faceIndex === '3') {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(hx + hr * 0.3, hy - hr * 0.4, hr * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(hx + hr * 0.3, hy + hr * 0.4, hr * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(hx + hr * 0.4, hy - hr * 0.4, hr * 0.1, 0, Math.PI * 2);
        ctx.arc(hx + hr * 0.4, hy + hr * 0.4, hr * 0.1, 0, Math.PI * 2);
        ctx.fill();
        
        if (faceIndex === '1') {
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(hx + hr * 0.05, hy - hr * 0.7);
            ctx.lineTo(hx + hr * 0.5, hy - hr * 0.25);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(hx + hr * 0.05, hy + hr * 0.7);
            ctx.lineTo(hx + hr * 0.5, hy + hr * 0.25);
            ctx.stroke();
        } else if (faceIndex === '3') {
            ctx.fillStyle = 'rgba(244, 63, 94, 0.5)';
            ctx.beginPath();
            ctx.arc(hx + hr * 0.15, hy - hr * 0.75, hr * 0.18, 0, Math.PI * 2);
            ctx.arc(hx + hr * 0.15, hy + hr * 0.75, hr * 0.18, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (faceIndex === '2') {
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        ctx.moveTo(hx + hr * 0.2, hy - hr * 0.7);
        ctx.lineTo(hx + hr * 0.6, hy - hr * 0.5);
        ctx.lineTo(hx + hr * 0.5, hy + hr * 0.5);
        ctx.lineTo(hx + hr * 0.2, hy + hr * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hx + hr * 0.45, hy - hr * 0.4);
        ctx.lineTo(hx + hr * 0.35, hy - hr * 0.1);
        ctx.moveTo(hx + hr * 0.45, hy + hr * 0.2);
        ctx.lineTo(hx + hr * 0.35, hy + hr * 0.5);
        ctx.stroke();
    }
    ctx.restore();
}

export function drawVest(ctx, radius, vestIndex) {
    if (vestIndex === '0') return;
    
    ctx.save();
    if (vestIndex === '1') {
        ctx.fillStyle = '#15803d';
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.arc(-radius * 0.3, -radius * 0.25, radius * 0.25, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#166534';
        ctx.beginPath();
        ctx.arc(radius * 0.15, radius * 0.3, radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#14532d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
        ctx.stroke();
    } else if (vestIndex === '2') {
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.fillStyle = '#ef4444';
        const crossW = radius * 0.45;
        const crossH = radius * 0.15;
        ctx.fillRect(-crossW / 2, -crossH / 2, crossW, crossH);
        ctx.fillRect(-crossH / 2, -crossW / 2, crossH, crossW);
    } else if (vestIndex === '3') {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.65, -Math.PI * 0.3, Math.PI * 0.3);
        ctx.stroke();
    } else if (vestIndex === '4') {
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.save();
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle1 = (i * 2 * Math.PI) / 5 - Math.PI / 2;
            const angle2 = ((i * 2 + 1) * Math.PI) / 5 - Math.PI / 2;
            ctx.lineTo(Math.cos(angle1) * radius * 0.45, Math.sin(angle1) * radius * 0.45);
            ctx.lineTo(Math.cos(angle2) * radius * 0.2, Math.sin(angle2) * radius * 0.2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();
}

export function drawHat(ctx, radius, hatIndex) {
    if (hatIndex === '0') return;
    
    ctx.save();
    const hx = radius * 0.25;
    const hy = 0;
    const hr = radius * 0.45;
    
    if (hatIndex === '1') {
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(hx, hy, hr * 1.05, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.ellipse(hx + hr * 0.8, hy, hr * 0.6, hr * 0.4, 0, -Math.PI / 2, Math.PI / 2);
        ctx.fill();
    } else if (hatIndex === '2') {
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(hx, hy, hr * 1.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.moveTo(hx - hr * 0.9, hy - hr * 0.2);
        ctx.lineTo(hx - hr * 1.4, hy - hr * 0.5);
        ctx.lineTo(hx - hr * 1.2, hy);
        ctx.lineTo(hx - hr * 1.4, hy + hr * 0.5);
        ctx.lineTo(hx - hr * 0.9, hy + hr * 0.2);
        ctx.closePath();
        ctx.fill();
    } else if (hatIndex === '3') {
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(hx, hy, hr * 0.85, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(hx, hy, hr * 0.85, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(hx, hy, hr * 0.25, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#d97706';
        for (let i = 0; i < 5; i++) {
            const sa = (i * 2 * Math.PI) / 5;
            ctx.beginPath();
            ctx.arc(hx + Math.cos(sa) * hr * 0.85, hy + Math.sin(sa) * hr * 0.85, hr * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (hatIndex === '4') {
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, hr * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#b45309';
        ctx.beginPath();
        ctx.ellipse(hx - hr * 0.1, hy, hr * 0.9, hr * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx - hr * 0.1, hy, hr * 0.75, 0, Math.PI * 2);
        ctx.stroke();
    } else if (hatIndex === '5') {
        ctx.fillStyle = '#94a3b8';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, hr * 1.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        ctx.moveTo(hx, hy - hr * 0.9);
        ctx.quadraticCurveTo(hx + hr * 0.3, hy - hr * 1.4, hx + hr * 0.7, hy - hr * 1.2);
        ctx.quadraticCurveTo(hx + hr * 0.3, hy - hr * 0.8, hx + hr * 0.1, hy - hr * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(hx, hy + hr * 0.9);
        ctx.quadraticCurveTo(hx + hr * 0.3, hy + hr * 1.4, hx + hr * 0.7, hy + hr * 1.2);
        ctx.quadraticCurveTo(hx + hr * 0.3, hy + hr * 0.8, hx + hr * 0.1, hy + hr * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
}

// =============================================
// CHARAKTER
// =============================================

export function drawCharacter(ctx, player, isLocal) {
    const { x, y, angle, radius, color, hp, maxHp, name, currentWeapon } = player;
    
    // Parse RPG metadata from name
    const nameParts = (name || '').split('|');
    const cleanPlayerName = nameParts[0] || 'Hráč';
    const classIdx = nameParts[1] !== undefined ? parseInt(nameParts[1]) : -1;
    const levelVal = nameParts[2] !== undefined ? parseInt(nameParts[2]) : 1;

    // Decode customizations from color field
    const custom = decodeCustomization(color);

    ctx.save();
    ctx.translate(x, y);
    
    // Draw Level Up Golden Halo Glow
    if (player.levelUpGlow && Date.now() < player.levelUpGlow) {
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.35, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 9px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText('+1 LEVEL UP!', 0, -radius - 22);
        ctx.restore();
    }

    // Draw frozen overlay under player (ice circle)
    if (player.isFrozen) {
        ctx.save();
        ctx.fillStyle = 'rgba(186, 230, 253, 0.4)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    ctx.save();
    ctx.rotate(angle);

    // Tělo (Base Color)
    const baseColor = player.isFrozen ? '#7dd3fc' : custom.color;
    
    // Outer Neon Glow Double Stroke
    ctx.strokeStyle = adjustAlpha(baseColor, 0.45);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner bright neon circle
    ctx.fillStyle = player.isFrozen ? '#e0f2fe' : baseColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Sharp bright white inner border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Vesta / Decal
    drawVest(ctx, radius, custom.vest);

    // Reload animation (circular)
    if (player.reloadStartTime && player.reloadDuration) {
        const reloadElapsed = Date.now() - player.reloadStartTime;
        if (reloadElapsed < player.reloadDuration) {
            const progress = reloadElapsed / player.reloadDuration;
            ctx.save();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.strokeStyle = '#38bdf8';
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 4;
            ctx.lineWidth = 3.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(0, 0, radius * 1.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
            ctx.stroke();
            ctx.restore();
        }
    }

    // WEAPON / HERO SKILL RENDERS
    let gunTipX = radius * 1.0;
    ctx.save();

    if (classIdx !== -1) {
        // RPG MOBA Custom weapon visuals
        if (classIdx === 0) {
            // Warrior Broadsword
            ctx.shadowColor = '#d6d3d1';
            ctx.shadowBlur = 5;
            ctx.fillStyle = '#cbd5e1';
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1.5;
            ctx.fillRect(radius * 0.45, -4, radius * 1.05, 8);
            ctx.strokeRect(radius * 0.45, -4, radius * 1.05, 8);
            // Gold hilt guard
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(radius * 0.35, -9, 4, 18);
            gunTipX = radius * 1.5;
        } else if (classIdx === 1) {
            // Mage Magic Staff
            ctx.fillStyle = '#78350f';
            ctx.fillRect(radius * 0.3, -2.5, radius * 1.2, 5); // staff shaft
            // Glowing purple crystal
            ctx.fillStyle = '#c084fc';
            ctx.shadowColor = '#a855f7';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(radius * 1.55, 0, 7.5, 0, Math.PI * 2);
            ctx.fill();
            gunTipX = radius * 1.6;
        } else if (classIdx === 2) {
            // Ranger glowing composite bow
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 3.5;
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(radius * 0.65, 0, 18, -Math.PI / 2, Math.PI / 2);
            ctx.stroke();
            // Golden bow string
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(radius * 0.65, -18);
            ctx.lineTo(radius * 0.25, 0);
            ctx.lineTo(radius * 0.65, 18);
            ctx.stroke();
            gunTipX = radius * 1.1;
        } else if (classIdx === 3) {
            // Priest sceptre staff
            ctx.fillStyle = '#eab308';
            ctx.fillRect(radius * 0.3, -2, radius * 1.15, 4);
            // Glowing gold orb cross
            ctx.fillStyle = '#fde047';
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur = 7;
            ctx.beginPath();
            ctx.arc(radius * 1.45, 0, 6, 0, Math.PI * 2);
            ctx.fill();
            // Tiny cross wings
            ctx.fillRect(radius * 1.45 - 2, -10, 4, 20);
            ctx.fillRect(radius * 1.45 - 10, -2, 20, 4);
            gunTipX = radius * 1.5;
        }
    } else {
        // Standard Shooter Guns
        const isRange = currentWeapon !== 'fists';
        if (currentWeapon === 'pistol') {
            ctx.fillStyle = '#292524';
            ctx.fillRect(radius * 0.4, -3, radius * 0.65, 6);
            ctx.fillStyle = '#78350f';
            ctx.fillRect(radius * 0.35, -2, radius * 0.15, 4);
            gunTipX = radius * 1.05;
        } else if (currentWeapon === 'smg') {
            ctx.fillStyle = '#4b5563';
            ctx.fillRect(radius * 0.35, -4, radius * 0.8, 8);
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(radius * 1.15, -2.2, radius * 0.25, 4.4);
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(radius * 0.65, 5, radius * 0.3, -Math.PI/2, 0);
            ctx.stroke();
            gunTipX = radius * 1.4;
        } else if (currentWeapon === 'shotgun') {
            ctx.fillStyle = '#78350f';
            ctx.fillRect(radius * 0.25, -4.5, radius * 0.35, 9);
            ctx.fillStyle = '#6b7280';
            ctx.fillRect(radius * 0.6, -3.8, radius * 0.95, 3.2);
            ctx.fillRect(radius * 0.6, 0.6, radius * 0.95, 3.2);
            ctx.fillStyle = '#451a03';
            ctx.fillRect(radius * 0.7, -4.8, radius * 0.35, 9.6);
            gunTipX = radius * 1.55;
        } else if (currentWeapon === 'rifle') {
            ctx.fillStyle = '#78350f';
            ctx.fillRect(radius * 0.2, -4, radius * 0.35, 8);
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(radius * 0.55, -4, radius * 0.7, 8);
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(radius * 1.25, -2, radius * 0.45, 4);
            ctx.fillStyle = '#020617';
            ctx.beginPath();
            ctx.ellipse(radius * 0.8, 5, radius * 0.45, radius * 0.12, Math.PI / 3.5, 0, Math.PI * 2);
            ctx.fill();
            gunTipX = radius * 1.7;
        } else if (currentWeapon === 'sniper') {
            ctx.fillStyle = '#14532d';
            ctx.fillRect(radius * 0.2, -4.5, radius * 0.95, 9);
            ctx.fillStyle = '#020617';
            ctx.fillRect(radius * 1.15, -2.5, radius * 0.7, 5);
            ctx.fillRect(radius * 1.85, -3.5, radius * 0.12, 7);
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(radius * 0.55, -7.5, radius * 0.35, 3);
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(radius * 0.45, -9, radius * 0.55, 3.5);
            gunTipX = radius * 1.97;
        } else if (currentWeapon === 'm4a1') {
            ctx.fillStyle = '#0891b2'; // Cyan frame
            ctx.fillRect(radius * 0.25, -4, radius * 0.75, 8);
            ctx.fillStyle = '#06b6d4'; // Glowing barrel
            ctx.fillRect(radius * 1.0, -2, radius * 0.55, 4);
            ctx.fillStyle = '#22d3ee';
            ctx.fillRect(radius * 0.45, 0, radius * 0.15, 7); // straight mag
            gunTipX = radius * 1.55;
        } else if (currentWeapon === 'ak47') {
            ctx.fillStyle = '#ea580c'; // Orange stock/frame
            ctx.fillRect(radius * 0.2, -4.2, radius * 0.8, 8.4);
            ctx.fillStyle = '#f97316'; // Glowing barrel
            ctx.fillRect(radius * 1.0, -2.2, radius * 0.6, 4.4);
            // Curved mag
            ctx.strokeStyle = '#c2410c';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(radius * 0.6, 4.5, radius * 0.35, 0, Math.PI / 2);
            ctx.stroke();
            gunTipX = radius * 1.6;
        } else {
            ctx.fillStyle = '#1c1917';
            ctx.strokeStyle = '#44403c';
            ctx.lineWidth = 1.5;
            ctx.fillRect(radius * 0.4, -4, radius * 0.6, 8);
            ctx.strokeRect(radius * 0.4, -4, radius * 0.6, 8);
        }

        // 40ms záblesk z ústí zbraně
        if (isRange && player.lastShotTime && (Date.now() - player.lastShotTime < 45)) {
            ctx.save();
            ctx.translate(gunTipX, 0);
            const gradFlash = ctx.createRadialGradient(0, 0, 1.5, 0, 0, 18);
            gradFlash.addColorStop(0, '#ffffff');
            gradFlash.addColorStop(0.2, '#f59e0b');
            gradFlash.addColorStop(0.7, 'rgba(239, 68, 68, 0.75)');
            gradFlash.addColorStop(1, 'rgba(239, 68, 68, 0)');
            ctx.fillStyle = gradFlash;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const fAngle = (i * 2 * Math.PI) / 8 + (Math.random() - 0.5) * 0.25;
                const fLen = 9 + Math.random() * 12;
                ctx.lineTo(Math.cos(fAngle) * fLen, Math.sin(fAngle) * fLen);
                ctx.lineTo(Math.cos(fAngle + 0.2) * 3, Math.sin(fAngle + 0.2) * 3);
            }
            ctx.closePath();
            ctx.fill();
        }

        // Draw 3x Scope Laser Aim line
        if (player.id === state.playerId && state.currentScope === 'scope_3x' && !player.isDead) {
            ctx.save();
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(gunTipX, 0);
            ctx.lineTo(gunTipX + 700, 0);
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(gunTipX, 0);
            ctx.lineTo(gunTipX + 700, 0);
            ctx.stroke();
            ctx.restore();
        }
    }
    ctx.restore();

    // Hlava
    ctx.fillStyle = player.isFrozen ? '#a5f3fc' : custom.color;
    ctx.beginPath();
    ctx.arc(radius * 0.25, 0, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Face / Expression
    drawFace(ctx, radius, custom.face);

    // Hat / Headwear
    drawHat(ctx, radius, custom.hat);

    ctx.restore(); // Rotate

    // 2.9 VISUAL MOBA SPELLS SPHERE / WHIRLWIND / DIVINE SHIELD
    if (player.isShielded) {
        ctx.save();
        const shieldGrad = ctx.createRadialGradient(0, 0, radius * 0.7, 0, 0, radius * 1.4);
        shieldGrad.addColorStop(0, 'rgba(253, 224, 71, 0.02)');
        shieldGrad.addColorStop(0.8, 'rgba(253, 224, 71, 0.22)');
        shieldGrad.addColorStop(1, 'rgba(252, 211, 77, 0.65)');
        ctx.fillStyle = shieldGrad;
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    if (player.isSpinning) {
        ctx.save();
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.45)';
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 3;
        ctx.beginPath();
        const spinTime = Date.now() * 0.02;
        ctx.arc(0, 0, radius * 1.5, spinTime, spinTime + Math.PI);
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.3, -spinTime, -spinTime + Math.PI * 0.6);
        ctx.stroke();
        ctx.restore();
    }

    ctx.restore(); // Translate

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
    
    // Concisely format nickname
    const emojis = ['🛡️', '🔮', '🏹', '✝️'];
    const cleanDisplayName = classIdx !== -1 ? `${cleanPlayerName} [${emojis[classIdx] || ''}]` : cleanPlayerName;

    // Rychlý "fake" text shadow
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillText(cleanDisplayName, x + 1, by - 7);
    
    ctx.fillStyle   = isLocal ? '#fff' : 'rgba(255,255,255,0.8)';
    ctx.fillText(cleanDisplayName, x, by - 8);
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
// ČÁSTICE KRVE (BLOOD FX)
// =============================================

function drawBloodParticles(ctx) {
    if (!state.bloodParticles) return;
    for (let i = state.bloodParticles.length - 1; i >= 0; i--) {
        const p = state.bloodParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.93; // tření vzduchu
        p.vy *= 0.93;
        p.alpha -= p.decay;
        
        if (p.alpha <= 0) {
            state.bloodParticles.splice(i, 1);
            continue;
        }
        
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (0.4 + p.alpha * 0.6), 0, Math.PI * 2);
        ctx.fill();
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

    // Zóna na minimapě (vykreslena bez průhledné díry)
    const zone = getZoneState();
    if (zone.radius < MAP_SIZE * 1.5) {
        mx.save();
        mx.fillStyle = 'rgba(239, 68, 68, 0.32)'; // Vyšší kontrast pro nebezpečnou zónu
        mx.beginPath();
        mx.rect(0, 0, mw, mh); // Celá plocha minimapy
        mx.arc(zone.center.x * scale, zone.center.y * scale, zone.radius * scale, 0, Math.PI * 2, true); // Safe zóna
        mx.fill();
        mx.restore();
        
        // Plynulý tečkovaný okraj bezpečné zóny na minimapě
        mx.save();
        mx.strokeStyle = '#f87171';
        mx.lineWidth = 1.2;
        mx.setLineDash([4, 3]);
        mx.beginPath();
        mx.arc(zone.center.x * scale, zone.center.y * scale, zone.radius * scale, 0, Math.PI * 2);
        mx.stroke();
        mx.restore();
    }

    // Ostatní hráči (pouze viditelní!)
    for (const id in state.activePlayers) {
        const e = state.activePlayers[id];
        if (e.hp > 0) {
            // Zjistit schování pod stromem
            let isHidden = false;
            if (e.teamId !== p.teamId) {
                for (const obs of state.mapObstacles) {
                    if (obs.type === 'tree' && obs.hp > 0) {
                        const distEnemy = Math.hypot(e.x - obs.x, e.y - obs.y);
                        if (distEnemy < obs.radius * 1.5) {
                            const distLocal = Math.hypot(p.x - obs.x, p.y - obs.y);
                            if (distLocal >= obs.radius * 1.5) {
                                isHidden = true;
                                break;
                            }
                        }
                    }
                }
            }
            if (isHidden) continue;

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

// =============================================
// RPG-MOBA VISUAL DRAW LAYERS
// =============================================

export function drawNeutralSlimes(ctx) {
    if (!state.rpgMode || !state.neutralSlimes) return;
    
    state.neutralSlimes.forEach(s => {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        
        // Organic squishy stretch based on bounce time
        const bounceFactor = Math.abs(Math.sin(s.bounceTime)) * 7;
        const squashX = 1 + (bounceFactor * 0.007);
        const squashY = 1 - (bounceFactor * 0.009);
        ctx.scale(squashX, squashY);
        
        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.arc(0, 5, s.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Slime body (Glossy green gradient)
        const grad = ctx.createRadialGradient(-s.radius * 0.25, -s.radius * 0.25, 2, 0, 0, s.radius);
        grad.addColorStop(0, '#86efac'); // Light neon mint green
        grad.addColorStop(0.6, '#22c55e'); // Green
        grad.addColorStop(1, '#15803d'); // Dark forest green
        ctx.fillStyle = grad;
        
        ctx.beginPath();
        ctx.arc(0, 0, s.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#14532d';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        
        // Cute face (eyes facing direction s.angle)
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(s.radius * 0.4, -s.radius * 0.25, 3.5, 0, Math.PI * 2);
        ctx.arc(s.radius * 0.4, s.radius * 0.25, 3.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Specular eye shine
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s.radius * 0.45, -s.radius * 0.25 - 1, 1, 0, Math.PI * 2);
        ctx.arc(s.radius * 0.45, s.radius * 0.25 - 1, 1, 0, Math.PI * 2);
        ctx.fill();
        
        // Happy little mouth
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(s.radius * 0.55, 0, 3.5, 0, Math.PI);
        ctx.stroke();
        
        ctx.restore();
    });
}

export function drawSpellEffects(ctx) {
    const now = Date.now();
    
    state.spellEffects.forEach(eff => {
        ctx.save();
        if (eff.type === 'frost_nova') {
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
            ctx.lineWidth = 3;
            ctx.fillStyle = 'rgba(186, 230, 253, 0.12)';
            ctx.beginPath();
            ctx.arc(eff.x, eff.y, eff.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (eff.type === 'holy_ring') {
            // Pulse golden light
            const scale = 1 + Math.sin(now * 0.007) * 0.05;
            ctx.fillStyle = 'rgba(253, 224, 71, 0.06)';
            ctx.strokeStyle = 'rgba(253, 224, 71, 0.45)';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#eab308';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(eff.x, eff.y, eff.radius * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (eff.type === 'meteor') {
            // Targeting indicator
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.arc(eff.x, eff.y, 100, 0, Math.PI * 2);
            ctx.stroke();
            
            // Animated falling fireball
            const remaining = eff.endTime - now;
            if (remaining > 0) {
                const t = 1 - (remaining / 1200); // 1.2s falling duration
                const startOffset = 400; // start 400px up-left
                const mx = eff.x - startOffset * (1 - t);
                const my = eff.y - startOffset * (1 - t);
                
                ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
                ctx.beginPath();
                ctx.arc(mx + 3, my + 4, 30 * t, 0, Math.PI * 2);
                ctx.fill();
                
                const grad = ctx.createRadialGradient(mx, my, 2, mx, my, 25 * t);
                grad.addColorStop(0, '#fff');
                grad.addColorStop(0.3, '#f59e0b');
                grad.addColorStop(1, 'rgba(220, 38, 38, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(mx, my, 25 * t, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (eff.type === 'meteor_explosion' || eff.type === 'smash') {
            const elapsed = now - eff.startTime;
            const ratio = elapsed / eff.duration;
            const r = eff.maxRadius * ratio;
            ctx.strokeStyle = eff.type === 'smash' ? `rgba(239, 68, 68, ${1 - ratio})` : `rgba(249, 115, 22, ${1 - ratio})`;
            ctx.lineWidth = 4 * (1 - ratio);
            ctx.fillStyle = eff.type === 'smash' ? `rgba(239, 68, 68, ${0.15 * (1 - ratio)})` : `rgba(249, 115, 22, ${0.2 * (1 - ratio)})`;
            ctx.beginPath();
            ctx.arc(eff.x, eff.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (eff.type === 'sword_slash') {
            const elapsed = now - eff.startTime;
            const ratio = elapsed / eff.duration;
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.85 * (1 - ratio)})`;
            ctx.lineWidth = 4 * (1 - ratio);
            ctx.lineCap = 'round';
            ctx.beginPath();
            // Arc swing
            ctx.arc(eff.x, eff.y, 65, eff.angle - Math.PI / 4, eff.angle + Math.PI / 4);
            ctx.stroke();
        }
        ctx.restore();
    });
}
