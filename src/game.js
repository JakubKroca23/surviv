import { state } from './state.js';
import { MAP_SIZE, WEAPONS, COLLECTION_ID, DATABASE_ID } from './constants.js';
import { getZoneState } from './player.js';
import { updateUI } from './ui.js';
import { updatePlayerOnAppwrite, setKilledBy, removePlayerFromAppwrite, databases } from './network.js';
import { playSound } from './audio.js';
import { Permission, Role } from 'appwrite';

// =============================================
// HERNÍ LOGIKA – UPDATE LOOP
// =============================================

export function updateGame() {
    if (!state.gameActive || !state.localPlayer) return;
    const p = state.localPlayer;

    // 1. Pohyb hráče
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

    // Host spouští AI logiku
    if (state.isHost && state.aiBots && state.aiBots.length > 0) {
        updateAIBots();
    }

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

        // Určit tým střelce projektilu
        const shooterTeam = b.ownerId === state.playerId ? state.teamId : (state.activePlayers[b.ownerId]?.teamId || 2);

        if (b.ownerId === state.playerId) {
            // Zásah nepřítele (klientský hit detect)
            for (const id in state.activePlayers) {
                const enemy = state.activePlayers[id];
                if (enemy.hp <= 0) continue;
                
                // Přeskočit, pokud je to spojenec ze stejného týmu (Friendly Fire vypnuto)
                const enemyTeam = enemy.teamId || (id.startsWith('bot_') ? state.aiBots.find(b => b.id === id)?.teamId : 2);
                if (enemyTeam === shooterTeam) continue;

                if (Math.hypot(b.x - enemy.x, b.y - enemy.y) < 30) {
                    spawnHitMarker(b.x, b.y);
                    state.localBullets.splice(i, 1);
                    removed = true;
                    
                    // Zásah AI bota
                    if (id.startsWith('bot_')) {
                        const newHp = Math.max(0, enemy.hp - b.damage);
                        enemy.hp = newHp;
                        updateBotHpInDB(id, newHp, state.playerId);
                    }
                    break;
                }
            }
        } else {
            // Zásah lokálního hráče
            if (Math.hypot(b.x - p.x, b.y - p.y) < p.radius && p.hp > 0) {
                // Přeskočit, pokud je to spojenec ze stejného týmu
                if (p.teamId === shooterTeam) continue;

                p.hp = Math.max(0, p.hp - b.damage);
                spawnHitMarker(b.x, b.y);
                playSound('hit');
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
            playSound('pickup');
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

    // 7. Kontrola konce hry (pokud zbýváš pouze ty / tvůj tým, vyhráváš!)
    if (state.gameActive && p.hp > 0) {
        let enemyAlive = 0;
        for (const id in state.activePlayers) {
            const enemy = state.activePlayers[id];
            if (enemy.hp > 0) {
                // Přičíst pouze pokud je nepřítel z cizího týmu
                const enemyTeam = enemy.teamId || (id.startsWith('bot_') ? state.aiBots.find(b => b.id === id)?.teamId : 2);
                if (enemyTeam !== p.teamId) {
                    enemyAlive++;
                }
            }
        }
        
        // Povolit výhru po 6 vteřinách
        const elapsed = (Date.now() - state.playStartTime) / 1000;
        if (elapsed > 6 && enemyAlive === 0) {
            handleWin();
        }
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

export async function handleWin() {
    if (!state.gameActive) return;
    state.gameActive = false;
    playSound('heal'); // pozitivní zvuk
    if (state.networkInterval) { clearInterval(state.networkInterval); state.networkInterval = null; }
    if (state.botInterval) { clearInterval(state.botInterval); state.botInterval = null; }

    const card = document.querySelector('.death-card');
    if (card) card.style.borderColor = 'rgba(16, 185, 129, 0.6)'; // Zelená záře

    const title = document.querySelector('.death-card h2');
    if (title) {
        title.textContent = 'VÍTĚZSTVÍ!';
        title.style.color = '#34d399';
    }

    const icon = document.querySelector('.death-icon');
    if (icon) {
        icon.innerHTML = '<i class="fa-solid fa-trophy" style="font-size:2.5rem;color:#34d399"></i>';
        icon.style.background = 'rgba(6, 95, 70, 0.3)';
        icon.style.borderColor = 'rgba(52, 211, 153, 0.5)';
    }

    document.getElementById('death-killer-text').textContent = 'Gratulujeme, tvůj tým eliminoval všechny soupeře a ovládl bojiště!';
    document.getElementById('death-stat-kills').textContent  = state.localPlayer.kills;
    
    const elapsed = Math.floor((Date.now() - state.playStartTime) / 1000);
    document.getElementById('death-stat-time').textContent   = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
    
    document.getElementById('death-screen').style.display    = 'flex';
    document.getElementById('game-ui').style.display         = 'none';

    await removePlayerFromAppwrite();
}

export async function handleDeath(killerId) {
    if (!state.gameActive) return;
    state.gameActive = false;
    playSound('death');
    if (state.networkInterval) { clearInterval(state.networkInterval); state.networkInterval = null; }
    if (state.botInterval) { clearInterval(state.botInterval); state.botInterval = null; }

    const card = document.querySelector('.death-card');
    if (card) card.style.borderColor = 'rgba(220, 38, 38, 0.3)'; // Červená záře

    const title = document.querySelector('.death-card h2');
    if (title) {
        title.textContent = 'Konec hry!';
        title.style.color = '#ef4444';
    }

    const icon = document.querySelector('.death-icon');
    if (icon) {
        icon.innerHTML = '<i class="fa-solid fa-skull-crossbones" style="font-size:2.5rem;color:#ef4444"></i>';
        icon.style.background = 'rgba(127,29,29,0.3)';
        icon.style.borderColor = 'rgba(239,68,68,0.5)';
    }

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

// =============================================
// AI BOTI – LOGIKA
// =============================================

export function spawnAIBots(count) {
    state.aiBots = [];
    
    // Tvorba botů na základě herního módu
    for (let i = 0; i < count; i++) {
        const botId = `bot_${state.currentRoomId}_${i}`;
        const names = ['Rex', 'Buster', 'Viper', 'Spike', 'Shadow', 'Ghost', 'Alpha', 'Bravo', 'Hunter', 'Blade', 'Zero', 'Apex', 'Ranger', 'Titan', 'Slayer'];
        let botName = `BOT ${names[i % names.length]}`;
        const colors = ['#eab308', '#ec4899', '#a855f7', '#06b6d4', '#f43f5e'];
        let botColor = colors[Math.floor(Math.random() * colors.length)];
        
        let team = i + 2; // výchozí chování (každý sám za sebe)
        
        if (state.gameMode === 'solo') {
            team = i + 2;
        } else if (state.gameMode === 'duo') {
            if (count === 19) {
                // Hrajeme s AI parťákem! (bot 0 je náš spojenec)
                if (i === 0) {
                    team = 1; // Team 1 s námi!
                    botName = `PARŤÁK ${names[0]}`;
                    botColor = '#34d399'; // Mintově zelená barva pro společníka
                } else {
                    // Ostatních 18 botů je rozděleno po dvojicích do týmů 2 až 10
                    team = Math.floor((i - 1) / 2) + 2;
                }
            } else {
                // Hrajeme ve dvou reálných hráčích. Všichni boti tvoří týmy po dvou od Teamu 2
                team = Math.floor(i / 2) + 2;
            }
        }

        const bot = {
            id: botId,
            name: botName,
            color: botColor,
            x: Math.random() * (MAP_SIZE - 400) + 200,
            y: Math.random() * (MAP_SIZE - 400) + 200,
            hp: 100,
            maxHp: 100,
            kills: 0,
            currentWeapon: 'rifle',
            angle: Math.random() * Math.PI * 2,
            speed: 3.2,
            lastShotTime: 0,
            radius: 28,
            roomId: state.currentRoomId,
            teamId: team,
            bulletsToSend: []
        };
        
        state.aiBots.push(bot);
        updateBotOnAppwrite(bot);
    }

    // Host spouští sync botů každých 120ms
    if (state.botInterval) clearInterval(state.botInterval);
    state.botInterval = setInterval(() => {
        if (state.isHost && state.aiBots) {
            state.aiBots.forEach(bot => {
                if (bot.hp > 0 || bot.killedBy) {
                    updateBotOnAppwrite(bot);
                    bot.bulletsToSend = [];
                }
            });
        }
    }, 120);
}

export function updateAIBots() {
    if (!state.aiBots) return;
    
    const zone = getZoneState();
    
    state.aiBots.forEach(bot => {
        if (bot.hp <= 0) return;
        
        const dToCenter = Math.hypot(bot.x - zone.center.x, bot.y - zone.center.y);
        let moveX = 0;
        let moveY = 0;
        
        let targetAngle = bot.angle;
        
        // Najít nejbližšího nepřítele z cizího týmu
        let nearestEnemy = null;
        let minDist = 750;
        
        // Kontrola lokálního hráče
        if (state.localPlayer && state.localPlayer.hp > 0 && state.localPlayer.teamId !== bot.teamId) {
            const dist = Math.hypot(bot.x - state.localPlayer.x, bot.y - state.localPlayer.y);
            if (dist < minDist) {
                minDist = dist;
                nearestEnemy = state.localPlayer;
            }
        }
        
        // Kontrola ostatních hráčů (reálných i AI)
        for (const pid in state.activePlayers) {
            const enemy = state.activePlayers[pid];
            if (enemy.hp <= 0) continue;
            
            // Ověřit, zda je nepřítel z cizího týmu
            const enemyTeam = enemy.teamId || (pid.startsWith('bot_') ? state.aiBots.find(b => b.id === pid)?.teamId : 2);
            if (enemyTeam === bot.teamId) continue; // stejný tým, ignorovat!

            const dist = Math.hypot(bot.x - enemy.x, bot.y - enemy.y);
            if (dist < minDist) {
                minDist = dist;
                nearestEnemy = enemy;
            }
        }
        
        if (nearestEnemy) {
            // Zaměřit cíl
            targetAngle = Math.atan2(nearestEnemy.y - bot.y, nearestEnemy.x - bot.x);
            
            // Pohyb k cíli
            if (minDist > 180) {
                moveX = Math.cos(targetAngle) * bot.speed;
                moveY = Math.sin(targetAngle) * bot.speed;
            } else {
                moveX = -Math.sin(targetAngle) * bot.speed;
                moveY = Math.cos(targetAngle) * bot.speed;
            }
            
            // Střelba
            const now = Date.now();
            if (now - bot.lastShotTime > 1300 + Math.random() * 900) {
                bot.lastShotTime = now;
                
                const weapon = WEAPONS.rifle;
                const dev = (Math.random() - 0.5) * 0.12;
                const ba = targetAngle + dev;
                
                state.localBullets.push({
                    id:        `${bot.id}_${now}_0`,
                    ownerId:   bot.id,
                    x:         bot.x + Math.cos(targetAngle) * (bot.radius + 15),
                    y:         bot.y + Math.sin(targetAngle) * (bot.radius + 15),
                    vx:        Math.cos(ba) * weapon.speed,
                    vy:        Math.sin(ba) * weapon.speed,
                    damage:    weapon.damage,
                    range:     weapon.range,
                    travelled: 0,
                    color:     bot.color,
                    timestamp: now,
                });
                
                if (state.localPlayer && Math.hypot(bot.x - state.localPlayer.x, bot.y - state.localPlayer.y) < 1000) {
                    playSound('shoot_rifle');
                }
                
                bot.bulletsToSend.push({
                    id:        `${bot.id}_${now}_0`,
                    ownerId:   bot.id,
                    x:         bot.x + Math.cos(targetAngle) * (bot.radius + 15),
                    y:         bot.y + Math.sin(targetAngle) * (bot.radius + 15),
                    vx:        Math.cos(ba) * weapon.speed,
                    vy:        Math.sin(ba) * weapon.speed,
                    damage:    weapon.damage,
                    range:     weapon.range,
                    color:     bot.color,
                    timestamp: now
                });
            }
        } else {
            // Není cíl -> jít do zóny nebo bloudit
            if (dToCenter > zone.radius * 0.75) {
                const a = Math.atan2(zone.center.y - bot.y, zone.center.x - bot.x);
                targetAngle = a;
                moveX = Math.cos(a) * bot.speed;
                moveY = Math.sin(a) * bot.speed;
            } else {
                const wanderAngle = bot.angle + (Math.random() - 0.5) * 0.4;
                targetAngle = wanderAngle;
                moveX = Math.cos(wanderAngle) * (bot.speed * 0.4);
                moveY = Math.sin(wanderAngle) * (bot.speed * 0.4);
            }
        }
        
        // Pohyb botů
        bot.x = Math.max(bot.radius, Math.min(MAP_SIZE - bot.radius, bot.x + moveX));
        bot.y = Math.max(bot.radius, Math.min(MAP_SIZE - bot.radius, bot.y + moveY));
        
        // Plynulé otáčení
        let diff = targetAngle - bot.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        bot.angle += diff * 0.15;
        
        // Kolize s překážkami
        state.mapObstacles.forEach(obs => {
            if (obs.hp <= 0) return;
            const d = Math.hypot(bot.x - obs.x, bot.y - obs.y);
            const min = bot.radius + obs.radius;
            if (d < min) {
                const a = Math.atan2(bot.y - obs.y, bot.x - obs.x);
                bot.x = obs.x + Math.cos(a) * min;
                bot.y = obs.y + Math.sin(a) * min;
            }
        });
        
        // Poškození zónou
        if (dToCenter > zone.radius) {
            bot.hp = Math.max(0, bot.hp - (zone.state === 'collapsing' ? 0.8 : 0.35));
            if (bot.hp <= 0) {
                bot.killedBy = 'Zóna';
            }
        }

        // Host render optim
        if (bot.hp > 0) {
            if (!state.activePlayers[bot.id]) {
                state.activePlayers[bot.id] = { ...bot, targetX: bot.x, targetY: bot.y };
            } else {
                Object.assign(state.activePlayers[bot.id], {
                    x: bot.x,
                    y: bot.y,
                    angle: bot.angle,
                    hp: bot.hp,
                    kills: bot.kills,
                    currentWeapon: bot.currentWeapon,
                    color: bot.color,
                    name: bot.name,
                    teamId: bot.teamId,
                    targetX: bot.x,
                    targetY: bot.y
                });
            }
        } else {
            delete state.activePlayers[bot.id];
        }
    });
}

export async function updateBotOnAppwrite(bot) {
    const payload = {
        name:          bot.name,
        x:             bot.x,
        y:             bot.y,
        angle:         bot.angle,
        hp:            bot.hp,
        color:         bot.color,
        kills:         bot.kills,
        currentWeapon: bot.currentWeapon,
        activeBullets: JSON.stringify(bot.bulletsToSend || []),
        lastUpdate:    Date.now(),
        killedBy:      bot.killedBy || '',
        roomId:        bot.roomId,
        teamId:        bot.teamId
    };
    
    try {
        await databases.updateDocument(DATABASE_ID, COLLECTION_ID, bot.id, payload);
    } catch (err) {
        if (err.code === 404 || String(err.type).includes('not_found')) {
            try {
                await databases.createDocument(DATABASE_ID, COLLECTION_ID, bot.id, payload, [
                    Permission.read(Role.any()),
                    Permission.update(Role.any()),
                    Permission.delete(Role.any()),
                ]);
            } catch {}
        }
    }
}

export async function updateBotHpInDB(botId, hp, killerId) {
    try {
        const payload = { hp };
        if (hp <= 0) {
            payload.killedBy = killerId;
        }
        await databases.updateDocument(DATABASE_ID, COLLECTION_ID, botId, payload);
    } catch (err) {
        console.error('updateBotHpInDB chyba:', err);
    }
}
