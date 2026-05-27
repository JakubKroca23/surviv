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
    const nowTime = Date.now();

    // Update screen shake
    if (state.screenShake && state.screenShake.intensity > 0.2) {
        state.screenShake.x = (Math.random() - 0.5) * state.screenShake.intensity;
        state.screenShake.y = (Math.random() - 0.5) * state.screenShake.intensity;
        state.screenShake.intensity *= state.screenShake.decay;
    } else if (state.screenShake) {
        state.screenShake.x = 0;
        state.screenShake.y = 0;
        state.screenShake.intensity = 0;
    }

    // Update particles
    if (state.particles) {
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const pt = state.particles[i];
            pt.x += pt.vx;
            pt.y += pt.vy;
            pt.vx *= pt.friction;
            pt.vy *= pt.friction;
            pt.alpha -= pt.decay;
            pt.angle += pt.spin;
            if (pt.alpha <= 0) {
                state.particles.splice(i, 1);
            }
        }
    }

    // Update vehicles
    if (state.vehicles) {
        state.vehicles.forEach(v => {
            if (v.passengerId === state.playerId) {
                // Steer and accelerate using player input
                if (state.isMobile && state.joystickLeft.active) {
                    const impulse = -state.joystickLeft.vy;
                    if (impulse > 0.15) {
                        v.speed = Math.min(v.maxSpeed, v.speed + v.acceleration * impulse);
                    } else if (impulse < -0.15) {
                        v.speed = Math.max(v.maxReverseSpeed, v.speed + v.acceleration * impulse);
                    } else {
                        v.speed *= 0.96;
                    }
                    const steer = state.joystickLeft.vx;
                    if (Math.abs(steer) > 0.15) {
                        v.angle += v.handling * steer * Math.sign(v.speed || 1);
                    }
                } else {
                    if (state.keys.w) {
                        v.speed = Math.min(v.maxSpeed, v.speed + v.acceleration);
                    } else if (state.keys.s) {
                        v.speed = Math.max(v.maxReverseSpeed, v.speed - v.acceleration);
                    } else {
                        v.speed *= 0.96;
                        if (Math.abs(v.speed) < 0.05) v.speed = 0;
                    }
                    if (state.keys.a) {
                        v.angle -= v.handling * Math.sign(v.speed || 1);
                    }
                    if (state.keys.d) {
                        v.angle += v.handling * Math.sign(v.speed || 1);
                    }
                }

                // Update position
                v.x += Math.cos(v.angle) * v.speed;
                v.y += Math.sin(v.angle) * v.speed;

                // Boundaries collision
                if (v.x < v.radius || v.x > MAP_SIZE - v.radius) {
                    v.speed = -v.speed * 0.45;
                    v.x = Math.max(v.radius, Math.min(MAP_SIZE - v.radius, v.x));
                }
                if (v.y < v.radius || v.y > MAP_SIZE - v.radius) {
                    v.speed = -v.speed * 0.45;
                    v.y = Math.max(v.radius, Math.min(MAP_SIZE - v.radius, v.y));
                }

                // Obstacles collision (bounce + crush destructibles)
                state.mapObstacles.forEach(obs => {
                    if (obs.hp <= 0) return;
                    const dist = Math.hypot(v.x - obs.x, v.y - obs.y);
                    const minDist = v.radius + obs.radius;
                    if (dist < minDist) {
                        const normalAngle = Math.atan2(v.y - obs.y, v.x - obs.x);
                        v.x = obs.x + Math.cos(normalAngle) * minDist;
                        v.y = obs.y + Math.sin(normalAngle) * minDist;

                        const collisionSpeed = Math.abs(v.speed);
                        v.speed = -v.speed * 0.4;

                        if (collisionSpeed > 2.0) {
                            const dmg = Math.floor(collisionSpeed * 50);
                            obs.hp = Math.max(0, obs.hp - dmg);
                            playSound('punch');
                            if (state.spawnParticles) {
                                state.spawnParticles(obs.x, obs.y, 8, 'debris', obs.color || '#78716c', { speed: 3.5 });
                            }
                            if (state.triggerScreenShake) {
                                state.triggerScreenShake(collisionSpeed * 1.5);
                            }
                            if (obs.hp <= 0 && state.localPlayer) {
                                state.localPlayer.addXp(20);
                            }
                        }
                    }
                });

                // Collision with AI Bots
                if (state.aiBots) {
                    state.aiBots.forEach(bot => {
                        if (bot.hp <= 0) return;
                        const dist = Math.hypot(bot.x - v.x, bot.y - v.y);
                        const minDist = v.radius + bot.radius;
                        if (dist < minDist) {
                            const pushAngle = Math.atan2(bot.y - v.y, bot.x - v.x);
                            bot.x += Math.cos(pushAngle) * 35;
                            bot.y += Math.sin(pushAngle) * 35;

                            const collisionSpeed = Math.abs(v.speed);
                            if (collisionSpeed > 1.5) {
                                const dmg = Math.floor(collisionSpeed * 22);
                                bot.hp = Math.max(0, bot.hp - dmg);
                                playSound('hit');
                                if (state.spawnParticles) {
                                    state.spawnParticles(bot.x, bot.y, 10, 'blood', '#ef4444', { speed: 4 });
                                }
                                if (state.triggerScreenShake) {
                                    state.triggerScreenShake(collisionSpeed * 2.0);
                                }
                                if (bot.hp <= 0 && state.localPlayer) {
                                    state.localPlayer.addXp(60);
                                    state.localPlayer.kills++;
                                    updateUI();
                                }
                                if (state.onBotHpUpdate) {
                                    state.onBotHpUpdate(bot.id, bot.hp, v.passengerId || 'vehicle');
                                }
                            }
                        }
                    });
                }

                // Collision with other active players
                for (const enemyId in state.activePlayers) {
                    const enemy = state.activePlayers[enemyId];
                    if (enemy.hp <= 0 || enemyId === state.playerId) continue;
                    const dist = Math.hypot(enemy.x - v.x, enemy.y - v.y);
                    const minDist = v.radius + enemy.radius;
                    if (dist < minDist) {
                        const pushAngle = Math.atan2(enemy.y - v.y, enemy.x - v.x);
                        enemy.x += Math.cos(pushAngle) * 35;
                        enemy.y += Math.sin(pushAngle) * 35;

                        const collisionSpeed = Math.abs(v.speed);
                        if (collisionSpeed > 1.5) {
                            const dmg = Math.floor(collisionSpeed * 22);
                            enemy.hp = Math.max(0, enemy.hp - dmg);
                            playSound('hit');
                            if (state.spawnParticles) {
                                state.spawnParticles(enemy.x, enemy.y, 10, 'blood', '#ef4444', { speed: 4 });
                            }
                        }
                    }
                }
            }
        });
    }

    // Update grenades
    if (state.localGrenades) {
        for (let i = state.localGrenades.length - 1; i >= 0; i--) {
            const g = state.localGrenades[i];
            g.x += g.vx;
            g.y += g.vy;
            g.vx *= 0.96;
            g.vy *= 0.96;
            
            // Map boundaries collision
            if (g.x < 15 || g.x > MAP_SIZE - 15) {
                g.vx = -g.vx * 0.6;
                g.x = Math.max(15, Math.min(MAP_SIZE - 15, g.x));
            }
            if (g.y < 15 || g.y > MAP_SIZE - 15) {
                g.vy = -g.vy * 0.6;
                g.y = Math.max(15, Math.min(MAP_SIZE - 15, g.y));
            }
            
            // Obstacles collision (bounces)
            state.mapObstacles.forEach(obs => {
                if (obs.hp <= 0) return;
                const dist = Math.hypot(g.x - obs.x, g.y - obs.y);
                const minDist = obs.radius + 10;
                if (dist < minDist) {
                    const normalAngle = Math.atan2(g.y - obs.y, g.x - obs.x);
                    g.x = obs.x + Math.cos(normalAngle) * minDist;
                    g.y = obs.y + Math.sin(normalAngle) * minDist;
                    const speed = Math.hypot(g.vx, g.vy);
                    g.vx = Math.cos(normalAngle) * speed * 0.6;
                    g.vy = Math.sin(normalAngle) * speed * 0.6;
                }
            });
            
            // Timed detonation (2.5s)
            if (nowTime - g.spawnTime >= g.timer) {
                playSound('death');
                
                // Blast wave particles
                if (state.spawnParticles) {
                    state.spawnParticles(g.x, g.y, 16, 'spark', '#f97316', { speed: 6.5, decay: 0.04 });
                    state.spawnParticles(g.x, g.y, 12, 'debris', '#78716c', { speed: 4.5, radius: 4 });
                }
                
                if (state.triggerScreenShake) {
                    state.triggerScreenShake(8.5);
                }
                
                // Splash damage (150px radial damage)
                const damageRadius = 150;
                
                // Damage local player
                if (p.hp > 0) {
                    const distLocal = Math.hypot(p.x - g.x, p.y - g.y);
                    if (distLocal < damageRadius) {
                        const dmg = 80 * (1 - distLocal / damageRadius);
                        if (!p.isShielded) {
                            p.hp = Math.max(0, p.hp - dmg);
                            playSound('hit');
                            updateUI();
                            if (p.hp <= 0) handleDeath('Granát');
                        }
                    }
                }
                
                // Damage other players & bots
                for (const enemyId in state.activePlayers) {
                    const enemy = state.activePlayers[enemyId];
                    if (enemy.hp <= 0) continue;
                    const distEnemy = Math.hypot(enemy.x - g.x, enemy.y - g.y);
                    if (distEnemy < damageRadius) {
                        const dmg = 80 * (1 - distEnemy / damageRadius);
                        enemy.hp = Math.max(0, enemy.hp - dmg);
                        if (enemyId.startsWith('bot_')) {
                            if (state.aiBots) {
                                const localBot = state.aiBots.find(b => b.id === enemyId);
                                if (localBot) {
                                    localBot.hp = enemy.hp;
                                    if (enemy.hp <= 0) {
                                        localBot.killedBy = g.ownerId;
                                        if (g.ownerId === p.id) {
                                            p.addXp(60);
                                            p.kills++;
                                        }
                                    }
                                }
                            }
                            updateBotHpInDB(enemyId, enemy.hp, g.ownerId);
                        }
                    }
                }
                
                state.localGrenades.splice(i, 1);
            }
        }
    }

    // Stimulant (Methamphetamine) updates
    if (p.stimActive) {
        if (nowTime > p.stimEndTime) {
            p.stimActive = false;
            p.stimCrashActive = true;
            p.stimCrashEndTime = nowTime + 6000;
            p.lastCrashDamageTime = nowTime;
            updateUI();
        } else {
            p.speed = p.rpgMode ? p.getSpeedWithItems() * 1.5 : 4.5 * 1.5;
            const baseScale = state.currentScope === 'scope_3x' ? 0.75 : (state.currentScope === 'scope_4x' ? 0.60 : (state.currentScope === 'scope_8x' ? 0.40 : 1.0));
            state.viewportScale = baseScale * 0.78;
            if (state.spawnParticles && Math.random() < 0.3) {
                state.spawnParticles(p.x, p.y, 2, 'spark', '#c084fc', { speed: 0.8, decay: 0.05 });
            }
        }
    } else if (p.stimCrashActive) {
        if (nowTime > p.stimCrashEndTime) {
            p.stimCrashActive = false;
            p.speed = p.rpgMode ? p.getSpeedWithItems() : 4.5;
            const baseScale = state.currentScope === 'scope_3x' ? 0.75 : (state.currentScope === 'scope_4x' ? 0.60 : (state.currentScope === 'scope_8x' ? 0.40 : 1.0));
            state.viewportScale = baseScale;
            updateUI();
        } else {
            p.speed = p.rpgMode ? p.getSpeedWithItems() * 0.35 : 4.5 * 0.35;
            if (nowTime - (p.lastCrashDamageTime || 0) >= 500) {
                p.lastCrashDamageTime = nowTime;
                p.hp = Math.max(1, p.hp - 2);
                updateUI();
            }
        }
    } else {
        p.speed = p.rpgMode ? p.getSpeedWithItems() : 4.5;
    }

    // MOBA Init
    if (state.rpgMode && (!state.mobaStructures || state.mobaStructures.length === 0)) {
        state.mobaStructures = [
            // Blue Turrets
            { id: 'turret_blue_top', type: 'turret', teamId: 1, lane: 'top', x: 450, y: 1100, radius: 55, hp: 2000, maxHp: 2000, lastShotTime: 0 },
            { id: 'turret_blue_mid', type: 'turret', teamId: 1, lane: 'mid', x: 1450, y: 2550, radius: 55, hp: 2000, maxHp: 2000, lastShotTime: 0 },
            { id: 'turret_blue_bot', type: 'turret', teamId: 1, lane: 'bot', x: 2850, y: 3550, radius: 55, hp: 2000, maxHp: 2000, lastShotTime: 0 },
            // Red Turrets
            { id: 'turret_red_top', type: 'turret', teamId: 2, lane: 'top', x: 1150, y: 450, radius: 55, hp: 2000, maxHp: 2000, lastShotTime: 0 },
            { id: 'turret_red_mid', type: 'turret', teamId: 2, lane: 'mid', x: 2550, y: 1450, radius: 55, hp: 2000, maxHp: 2000, lastShotTime: 0 },
            { id: 'turret_red_bot', type: 'turret', teamId: 2, lane: 'bot', x: 3550, y: 2850, radius: 55, hp: 2000, maxHp: 2000, lastShotTime: 0 },
            // Nexuses
            { id: 'nexus_blue', type: 'nexus', teamId: 1, x: 300, y: 3700, radius: 75, hp: 4000, maxHp: 4000 },
            { id: 'nexus_red', type: 'nexus', teamId: 2, x: 3700, y: 300, radius: 75, hp: 4000, maxHp: 4000 }
        ];
        state.mobaMinions = [];
        state.mobaProjectiles = [];
        state.lastMinionSpawnTime = 0;
        state.lastPassiveGoldTime = 0;
    }

    // Respawn check
    if (state.rpgMode && p.isDead) {
        if (nowTime >= p.respawnTime) {
            p.isDead = false;
            const fx = p.teamId === 1 ? 250 + Math.random() * 150 : 3600 + Math.random() * 150;
            const fy = p.teamId === 1 ? 3600 + Math.random() * 150 : 250 + Math.random() * 150;
            p.x = fx;
            p.y = fy;
            p.hp = p.maxHp;
            playSound('heal');
            updateUI();
        } else {
            p.hp = 0;
            simulateMOBALogic(nowTime);
            return; // Skip normal controls while dead!
        }
    }

    // Passive gold
    if (state.rpgMode && (!state.lastPassiveGoldTime || nowTime - state.lastPassiveGoldTime >= 5000)) {
        state.lastPassiveGoldTime = nowTime;
        if (p && p.hp > 0) {
            p.gold += 15;
            updateUI();
        }
    }

    if (state.rpgMode) {
        simulateMOBALogic(nowTime);
    }

    // Odstranění neaktivních botů a hráčů, kteří se neozvali déle než 3 sekundy
    for (const pid in state.activePlayers) {
        const playerAge = nowTime - (state.activePlayers[pid].lastUpdate || nowTime);
        if (playerAge > 3000) {
            delete state.activePlayers[pid];
        }
    }

    // 1. Pohyb hráče (pokud není zmražený)
    let mx = 0, my = 0;
    if (!p.isFrozen) {
        if (p.drivingVehicleId) {
            const drivingVehicle = state.vehicles && state.vehicles.find(v => v.id === p.drivingVehicleId);
            if (drivingVehicle) {
                p.x = drivingVehicle.x;
                p.y = drivingVehicle.y;
                mx = 0;
                my = 0;
            }
        } else if (p.isLeaping) {
            mx = Math.cos(p.leapAngle) * 12.5;
            my = Math.sin(p.leapAngle) * 12.5;
            if (nowTime >= p.leapEndTime) {
                p.isLeaping = false;
                playSound('punch');
                state.spellEffects.push({
                    type: 'smash',
                    x: p.x,
                    y: p.y,
                    radius: 0,
                    maxRadius: 125,
                    startTime: nowTime,
                    duration: 400
                });
                
                // Leap smash damage
                for (const id in state.activePlayers) {
                    const enemy = state.activePlayers[id];
                    if (enemy.hp <= 0) continue;
                    if (enemy.teamId === p.teamId) continue;
                    const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
                    if (dist <= 125) {
                        const dmg = 35 * (1 + (p.level - 1) * 0.15);
                        enemy.hp = Math.max(0, enemy.hp - dmg);
                        if (id.startsWith('bot_')) {
                            if (state.aiBots) {
                                const localBot = state.aiBots.find(b => b.id === id);
                                if (localBot) {
                                    localBot.hp = enemy.hp;
                                    if (enemy.hp <= 0) {
                                        localBot.killedBy = p.id;
                                        p.addXp(60);
                                        p.kills++;
                                    }
                                }
                            }
                            updateBotHpInDB(id, enemy.hp, p.id);
                        }
                    }
                }
            }
        } else {
            const currentSpeed = p.isSpinning ? p.speed * 1.25 : p.speed;
            if (state.isMobile) {
                mx = state.joystickLeft.vx * currentSpeed;
                my = state.joystickLeft.vy * currentSpeed;
            } else {
                if (state.keys.w) my = -currentSpeed;
                if (state.keys.s) my =  currentSpeed;
                if (state.keys.a) mx = -currentSpeed;
                if (state.keys.d) mx =  currentSpeed;
                if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }
            }
        }
    } else {
        // Zmražený hráč se nehýbe
        if (nowTime >= p.freezeEndTime) {
            p.isFrozen = false;
        }
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

    // Spinnig Warrior logic
    if (p.isSpinning) {
        if (nowTime >= p.spinEndTime) {
            p.isSpinning = false;
        } else {
            if (!p.lastSpinDamageTime || nowTime - p.lastSpinDamageTime >= 200) {
                p.lastSpinDamageTime = nowTime;
                for (const id in state.activePlayers) {
                    const enemy = state.activePlayers[id];
                    if (enemy.hp <= 0) continue;
                    if (enemy.teamId === p.teamId) continue;
                    
                    const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
                    if (dist <= 85) {
                        const dmg = 7 * (1 + (p.level - 1) * 0.15);
                        enemy.hp = Math.max(0, enemy.hp - dmg);
                        if (id.startsWith('bot_')) {
                            if (state.aiBots) {
                                const localBot = state.aiBots.find(b => b.id === id);
                                if (localBot) {
                                    localBot.hp = enemy.hp;
                                    if (enemy.hp <= 0) {
                                        localBot.killedBy = p.id;
                                        p.addXp(60);
                                        p.kills++;
                                    }
                                }
                            }
                            updateBotHpInDB(id, enemy.hp, p.id);
                        }
                    }
                }
            }
        }
    }

    // Shield check local player
    if (p.isShielded && nowTime >= p.shieldEndTime) {
        p.isShielded = false;
    }

    // Host spouští AI logiku
    if (state.isHost && state.aiBots && state.aiBots.length > 0) {
        updateAIBots();
    }

    // 2.5 Efekty kouzel (Spell Effects update)
    for (let i = state.spellEffects.length - 1; i >= 0; i--) {
        const effect = state.spellEffects[i];
        if (effect.type === 'frost_nova') {
            const elapsed = nowTime - effect.startTime;
            effect.radius = (elapsed / effect.duration) * effect.maxRadius;
            if (elapsed >= effect.duration) {
                state.spellEffects.splice(i, 1);
            }
        } else if (effect.type === 'meteor') {
            if (nowTime >= effect.endTime) {
                // Exploze meteoru!
                playSound('death');
                state.spellEffects.push({
                    type: 'meteor_explosion',
                    x: effect.x,
                    y: effect.y,
                    radius: 0,
                    maxRadius: 105,
                    startTime: nowTime,
                    duration: 450
                });
                
                // Zásah meteorem
                if (state.playerId === effect.ownerId) {
                    for (const id in state.activePlayers) {
                        const enemy = state.activePlayers[id];
                        if (enemy.hp <= 0) continue;
                        if (enemy.teamId === state.teamId) continue;
                        
                        const dist = Math.hypot(enemy.x - effect.x, enemy.y - effect.y);
                        if (dist <= 105) {
                            const dmg = 45 * (1 + (p.level - 1) * 0.15);
                            enemy.hp = Math.max(0, enemy.hp - dmg);
                            if (id.startsWith('bot_')) {
                                if (state.aiBots) {
                                    const localBot = state.aiBots.find(b => b.id === id);
                                    if (localBot) {
                                        localBot.hp = enemy.hp;
                                        if (enemy.hp <= 0) {
                                            localBot.killedBy = effect.ownerId;
                                            p.addXp(60);
                                            p.kills++;
                                        }
                                    }
                                }
                                updateBotHpInDB(id, enemy.hp, effect.ownerId);
                            }
                        }
                    }
                }
                state.spellEffects.splice(i, 1);
            }
        } else if (effect.type === 'meteor_explosion' || effect.type === 'smash' || effect.type === 'sword_slash') {
            const elapsed = nowTime - effect.startTime;
            if (elapsed >= effect.duration) {
                state.spellEffects.splice(i, 1);
            }
        } else if (effect.type === 'holy_ring') {
            if (nowTime >= effect.endTime) {
                state.spellEffects.splice(i, 1);
            } else {
                if (!effect.lastHealTime || nowTime - effect.lastHealTime >= 300) {
                    effect.lastHealTime = nowTime;
                    // Léčení lokálního hráče, pokud je ve zlatém kruhu kněze
                    if (p.hp > 0 && Math.hypot(p.x - effect.x, p.y - effect.y) <= effect.radius) {
                        p.hp = Math.min(p.maxHp, p.hp + 5);
                        updateUI();
                    }
                }
            }
        }
    }

    // 2.7 Simulating Green Forest Slimes
    if (state.rpgMode) {
        // Inicializuj slizy pokud neexistují a jsme Host/Solo
        if (state.isHost && (!state.neutralSlimes || state.neutralSlimes.length === 0)) {
            state.neutralSlimes = [];
            for (let i = 0; i < 24; i++) {
                // Deterministické seedované rozmístění slizů po celé mapě
                const sx = 200 + ((i * 153) % (MAP_SIZE - 400));
                const sy = 200 + ((i * 277) % (MAP_SIZE - 400));
                state.neutralSlimes.push({
                    id: `slime_${i}`,
                    x: sx,
                    y: sy,
                    radius: 23,
                    hp: 55,
                    maxHp: 55,
                    speed: 2.2,
                    angle: Math.random() * Math.PI * 2,
                    lastAttackTime: 0,
                    bounceTime: Math.random() * 100
                });
            }
        }

        // Aktualizuj slizy
        if (state.neutralSlimes) {
            for (let i = state.neutralSlimes.length - 1; i >= 0; i--) {
                const s = state.neutralSlimes[i];
                s.bounceTime += 0.08;

                // Najít nejbližší cíl (hráč nebo bot)
                let target = null;
                let minDist = 220; // tracking radius

                if (p.hp > 0) {
                    const dist = Math.hypot(p.x - s.x, p.y - s.y);
                    if (dist < minDist) {
                        minDist = dist;
                        target = p;
                    }
                }

                // Pohyb a útok
                if (target) {
                    const angleTo = Math.atan2(target.y - s.y, target.x - s.x);
                    s.x += Math.cos(angleTo) * s.speed;
                    s.y += Math.sin(angleTo) * s.speed;
                    s.angle = angleTo;

                    // Dotek a kousnutí
                    if (minDist < p.radius + s.radius && nowTime - s.lastAttackTime > 1000) {
                        s.lastAttackTime = nowTime;
                        playSound('punch');
                        if (target === p && !p.isShielded) {
                            p.hp = Math.max(0, p.hp - 10);
                            spawnHitMarker(p.x, p.y);
                            updateUI();
                            if (p.hp <= 0) handleDeath('Forest Slime');
                        }
                    }
                } else {
                    // Náhodný malý pohyb
                    s.x += Math.cos(s.angle) * (s.speed * 0.25);
                    s.y += Math.sin(s.angle) * (s.speed * 0.25);
                    if (Math.random() < 0.02) s.angle = Math.random() * Math.PI * 2;
                }

                // Hranice mapy
                s.x = Math.max(s.radius, Math.min(MAP_SIZE - s.radius, s.x));
                s.y = Math.max(s.radius, Math.min(MAP_SIZE - s.radius, s.y));
            }
        }
    }

    // 3. Projektily
    for (let i = state.localBullets.length - 1; i >= 0; i--) {
        const b = state.localBullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.travelled += Math.hypot(b.vx, b.vy);

        // Spawn bullet trails
        if (Math.random() < 0.6) {
            spawnParticles(b.x, b.y, 1, 'trail', b.color || 'rgba(251, 191, 36, 0.45)', { speed: 0.1, radius: 1.5, decay: 0.08 });
        }

        if (b.travelled > b.range) { state.localBullets.splice(i, 1); continue; }

        let removed = false;

        // Zásah překážky
        for (const obs of state.mapObstacles) {
            if (obs.hp <= 0) continue;
            if (Math.hypot(b.x - obs.x, b.y - obs.y) < obs.radius) {
                if (obs.type === 'crate') {
                    obs.hp -= b.damage;
                    spawnParticles(b.x, b.y, 8, 'debris', '#b45309', { speed: 2.5, friction: 0.94 });
                    triggerScreenShake(2.5);
                    if (obs.hp <= 0) {
                        spawnLoot(obs.x, obs.y, obs.lootType);
                        spawnParticles(obs.x, obs.y, 16, 'debris', '#78350f', { speed: 3.5 });
                    }
                } else if (obs.type === 'tree') {
                    spawnParticles(b.x, b.y, 6, 'debris', '#15803d', { speed: 2.0, radius: 3.5 });
                    triggerScreenShake(1.5);
                } else if (obs.type === 'rock') {
                    spawnParticles(b.x, b.y, 8, 'spark', '#a8a29e', { speed: 4.0, decay: 0.05 });
                    triggerScreenShake(2.0);
                }
                state.localBullets.splice(i, 1);
                removed = true;
                break;
            }
        }
        if (removed) continue;

        const shooterTeam = b.ownerId === state.playerId ? state.teamId : (state.activePlayers[b.ownerId]?.teamId || 2);

        // Zásah MOBA minionů
        if (state.rpgMode && state.mobaMinions) {
            for (let j = state.mobaMinions.length - 1; j >= 0; j--) {
                const mn = state.mobaMinions[j];
                if (mn.teamId === shooterTeam) continue;
                if (Math.hypot(b.x - mn.x, b.y - mn.y) < mn.radius) {
                    mn.hp -= b.damage;
                    spawnHitMarker(b.x, b.y);
                    playSound('hit');
                    state.localBullets.splice(i, 1);
                    removed = true;
                    
                    if (mn.hp <= 0) {
                        if (b.ownerId === state.playerId) {
                            p.gold += 25;
                            p.addXp(20);
                            updateUI();
                        }
                        state.mobaMinions.splice(j, 1);
                    }
                    break;
                }
            }
            if (removed) continue;
        }

        // Zásah MOBA staveb (turret/Nexus)
        if (state.rpgMode && state.mobaStructures) {
            for (const st of state.mobaStructures) {
                if (st.hp <= 0) continue;
                if (st.teamId === shooterTeam) continue;
                if (Math.hypot(b.x - st.x, b.y - st.y) < st.radius) {
                    const alliedMinionsNear = state.mobaMinions.some(mn => mn.teamId === shooterTeam && Math.hypot(mn.x - st.x, mn.y - st.y) < 400);
                    const dmg = alliedMinionsNear ? b.damage : b.damage * 0.1;
                    
                    st.hp = Math.max(0, st.hp - dmg);
                    spawnHitMarker(b.x, b.y);
                    playSound('hit');
                    state.localBullets.splice(i, 1);
                    removed = true;
                    
                    if (st.hp <= 0) {
                        playSound('death');
                        if (b.ownerId === state.playerId) {
                            p.gold += 150;
                            p.addXp(150);
                            updateUI();
                        }
                        if (st.type === 'nexus') {
                            handleNexusDestroyed(st.teamId);
                        }
                    }
                    break;
                }
            }
            if (removed) continue;
        }

        // Zásah slizů (RPG sub-mode)
        if (state.rpgMode && state.neutralSlimes && b.ownerId === state.playerId) {
            for (let j = state.neutralSlimes.length - 1; j >= 0; j--) {
                const s = state.neutralSlimes[j];
                if (Math.hypot(b.x - s.x, b.y - s.y) < s.radius) {
                    s.hp -= b.damage;
                    spawnHitMarker(b.x, b.y);
                    playSound('hit');
                    state.localBullets.splice(i, 1);
                    removed = true;

                    // Sliz zemřel
                    if (s.hp <= 0) {
                        playSound('pickup');
                        p.addXp(40); // +40 XP za zničení slizu!
                        // Drop loot z oběti
                        spawnLoot(s.x, s.y, Math.random() < 0.35 ? 'medkit' : 'pistol');
                        state.neutralSlimes.splice(j, 1);
                    }
                    break;
                }
            }
            if (removed) continue;
        }

        if (b.ownerId === state.playerId) {
            // Zásah nepřítele (klientský hit detect)
            for (const id in state.activePlayers) {
                const enemy = state.activePlayers[id];
                if (enemy.hp <= 0) continue;
                
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
                        
                        if (state.aiBots) {
                            const localBot = state.aiBots.find(b => b.id === id);
                            if (localBot) {
                                localBot.hp = newHp;
                                if (newHp <= 0) {
                                    localBot.killedBy = state.playerId;
                                    p.addXp(60); // +60 XP za zabití nepřítele!
                                    p.kills++;
                                }
                            }
                        }
                        
                        updateBotHpInDB(id, newHp, state.playerId);
                    }
                    break;
                }
            }
        } else {
            // Zásah lokálního hráče
            if (Math.hypot(b.x - p.x, b.y - p.y) < p.radius && p.hp > 0) {
                if (p.teamId === shooterTeam) continue;

                // Absorbuj poškození štítem!
                if (p.isShielded) {
                    state.localBullets.splice(i, 1);
                    break;
                }

                p.hp = Math.max(0, p.hp - b.damage);
                spawnHitMarker(b.x, b.y);
                triggerScreenShake(4.0);
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
            } else if (item.type === 'grenade') {
                p.grenades = (p.grenades || 0) + 1;
            } else if (item.type === 'meth') {
                p.meth = (p.meth || 0) + 1;
            } else if (item.type && item.type.startsWith('scope_')) {
                state.currentScope = item.type;
                const power = item.type.split('_')[1];
                if (power === '3x') state.viewportScale = 0.75;
                else if (power === '4x') state.viewportScale = 0.60;
                else if (power === '8x') state.viewportScale = 0.40;
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
        if (!p.isShielded) {
            p.hp = Math.max(0, p.hp - (zone.state === 'collapsing' ? 1.0 : 0.4));
            updateUI();
            if (p.hp <= 0) handleDeath('Zóna');
        }
    }

    // 7. Kontrola konce hry (pokud zbýváš pouze ty / tvůj tým, vyhráváš!)
    if (state.gameActive && p.hp > 0) {
        let enemyAlive = 0;
        for (const id in state.activePlayers) {
            const enemy = state.activePlayers[id];
            if (enemy.hp > 0) {
                const enemyTeam = enemy.teamId || (id.startsWith('bot_') ? state.aiBots.find(b => b.id === id)?.teamId : 2);
                if (enemyTeam !== p.teamId) {
                    enemyAlive++;
                }
            }
        }
        
        const elapsed = (Date.now() - state.playStartTime) / 1000;
        if (elapsed > 6 && enemyAlive === 0) {
            handleWin();
        }
    }
}

// =============================================
// POMOCNÉ FUNKCE
// =============================================

export function spawnParticles(x, y, count, type, color = '#fbbf24', customConfig = {}) {
    if (!state.particles) state.particles = [];
    
    // Hard ceiling cap
    if (state.particles.length > 250) {
        state.particles.splice(0, state.particles.length - 250);
    }

    for (let i = 0; i < count; i++) {
        const angle = customConfig.angle !== undefined ? customConfig.angle + (Math.random() - 0.5) * (customConfig.spread || 0.4) : Math.random() * Math.PI * 2;
        const speed = customConfig.speed !== undefined ? customConfig.speed * (0.5 + Math.random() * 0.8) : 1.5 + Math.random() * 3.5;
        
        state.particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color,
            radius: customConfig.radius !== undefined ? customConfig.radius * (0.6 + Math.random() * 0.8) : 2.5 + Math.random() * 3.5,
            alpha: 1.0,
            decay: customConfig.decay !== undefined ? customConfig.decay * (0.8 + Math.random() * 0.4) : 0.03 + Math.random() * 0.03,
            type, // 'spark', 'debris', 'trail'
            life: customConfig.life !== undefined ? customConfig.life : 1.0,
            friction: customConfig.friction !== undefined ? customConfig.friction : 1.0,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.2
        });
    }
}

export function triggerScreenShake(intensity) {
    if (!state.screenShake) state.screenShake = { x: 0, y: 0, intensity: 0, decay: 0.88 };
    state.screenShake.intensity = Math.max(state.screenShake.intensity, intensity);
}

state.spawnParticles = spawnParticles;
state.triggerScreenShake = triggerScreenShake;

export function spawnLoot(x, y, type) {
    state.itemsOnGround.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 30,
        type,
    });
}

export function throwLocalGrenade() {
    const p = state.localPlayer;
    if (!p || p.hp <= 0 || (p.grenades || 0) <= 0) return;
    p.grenades--;
    
    const angle = p.angle;
    const throwSpeed = 8.5;
    
    if (!state.localGrenades) state.localGrenades = [];
    state.localGrenades.push({
        id: 'g_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
        ownerId: p.id,
        x: p.x + Math.cos(angle) * (p.radius + 15),
        y: p.y + Math.sin(angle) * (p.radius + 15),
        vx: Math.cos(angle) * throwSpeed,
        vy: Math.sin(angle) * throwSpeed,
        timer: 2500,
        spawnTime: Date.now()
    });
    
    playSound('punch');
    updateUI();
}

state.throwLocalGrenade = throwLocalGrenade;

export function triggerVehicleInteraction() {
    const p = state.localPlayer;
    if (!p || p.hp <= 0) return;

    if (p.drivingVehicleId) {
        // Exit the vehicle
        const v = state.vehicles && state.vehicles.find(veh => veh.id === p.drivingVehicleId);
        if (v) {
            v.passengerId = null;
            // Place player to the side of the vehicle
            p.x = v.x + Math.cos(v.angle + Math.PI / 2) * (v.radius + 20);
            p.y = v.y + Math.sin(v.angle + Math.PI / 2) * (v.radius + 20);
            // Limit coordinate within boundary limits
            p.x = Math.max(p.radius, Math.min(MAP_SIZE - p.radius, p.x));
            p.y = Math.max(p.radius, Math.min(MAP_SIZE - p.radius, p.y));
        }
        p.drivingVehicleId = null;
        playSound('pickup');
    } else {
        // Enter closest vehicle
        if (!state.vehicles) return;
        let closestVehicle = null;
        let closestDist = 80; // maximum range of 80px to board
        
        state.vehicles.forEach(v => {
            if (v.passengerId) return; // already occupied
            const dist = Math.hypot(p.x - v.x, p.y - v.y);
            if (dist < closestDist) {
                closestDist = dist;
                closestVehicle = v;
            }
        });
        
        if (closestVehicle) {
            closestVehicle.passengerId = state.playerId;
            p.drivingVehicleId = closestVehicle.id;
            p.x = closestVehicle.x;
            p.y = closestVehicle.y;
            playSound('pickup');
        }
    }
    updateUI();
}

state.triggerVehicleInteraction = triggerVehicleInteraction;


export function spawnHitMarker(x, y) {
    state.hitMarkers.push({ x, y, alpha: 1 });
    
    // Generování 6 dynamických létajících částic krve
    if (!state.bloodParticles) state.bloodParticles = [];
    for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 2.8;
        state.bloodParticles.push({
            x:      x,
            y:      y,
            vx:     Math.cos(angle) * speed,
            vy:     Math.sin(angle) * speed,
            radius: 2.5 + Math.random() * 3.5,
            color:  Math.random() < 0.3 ? '#7f1d1d' : '#dc2626', // Tmavá karmínová a zářivá červená
            alpha:  1.0,
            decay:  0.03 + Math.random() * 0.03
        });
    }
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

    if (state.rpgMode) {
        // Fountain base respawning!
        const p = state.localPlayer;
        if (!p || p.isDead) return;
        p.isDead = true;
        p.hp = 0;
        p.respawnTime = Date.now() + 6000;
        playSound('death');
        updateUI();
        return;
    }

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
        // Náhodná customizace pro AI boty ve formátu #RRGGBBHFA
        const botColors = ['#22c55e', '#3b82f6', '#f97316', '#ef4444', '#eab308', '#a855f7', '#06b6d4', '#ec4899'];
        const randomBaseColor = botColors[Math.floor(Math.random() * botColors.length)];
        const randomHat = String(Math.floor(Math.random() * 6)); // 0-5
        const randomFace = String(Math.floor(Math.random() * 4)); // 0-3
        const randomVest = String(Math.floor(Math.random() * 5)); // 0-4
        let botColor = randomBaseColor + randomHat + randomFace + randomVest;
        
        let team = i + 2; // výchozí chování (každý sám za sebe)
        
        if (state.gameMode === 'solo') {
            team = i + 2;
        } else if (state.gameMode === 'duo') {
            if (count === 19) {
                // Hrajeme s AI parťákem! (bot 0 je náš spojenec)
                if (i === 0) {
                    team = 1; // Team 1 s námi!
                    botName = `PARŤÁK ${names[0]}`;
                    botColor = '#34d399031'; // Speciální skin pro společníka (zelená, happy tvář, camo vesta)
                } else {
                    // Ostatních 18 botů je rozděleno po dvojicích do týmů 2 až 10
                    team = Math.floor((i - 1) / 2) + 2;
                }
            } else {
                // Hrajeme ve dvou reálných hráčích. Všichni boti tvoří týmy po dvou od Teamu 2
                team = Math.floor(i / 2) + 2;
            }
        }

        // RPG attributes for bots
        const botClassIndex = state.rpgMode ? Math.floor(Math.random() * 4) : -1;
        const botLevel = 1;
        if (state.rpgMode) {
            botName = `${botName}|${botClassIndex}|${botLevel}`;
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
            bulletsToSend: [],
            rpgMode: state.rpgMode,
            classIndex: botClassIndex,
            level: botLevel,
            isFrozen: false,
            freezeEndTime: 0,
            isShielded: false,
            shieldEndTime: 0,
            lastSpellCastTime: 0
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
    const now = Date.now();
    
    state.aiBots.forEach(bot => {
        if (bot.hp <= 0) return;
        
        // Zmrazení botů
        if (bot.isFrozen) {
            if (now >= bot.freezeEndTime) {
                bot.isFrozen = false;
            } else {
                return; // Zmrazený bot se nehýbe ani neútočí
            }
        }

        // Ticking shield
        if (bot.isShielded && now >= bot.shieldEndTime) {
            bot.isShielded = false;
        }
        
        const dToCenter = Math.hypot(bot.x - zone.center.x, bot.y - zone.center.y);
        let moveX = 0;
        let moveY = 0;
        
        let targetAngle = bot.angle;
        
        // Najít nejbližšího nepřítele z cizího týmu
        let nearestEnemy = null;
        let minDist = 750;
        
        if (state.localPlayer && state.localPlayer.hp > 0 && state.localPlayer.teamId !== bot.teamId) {
            const dist = Math.hypot(bot.x - state.localPlayer.x, bot.y - state.localPlayer.y);
            if (dist < minDist) {
                minDist = dist;
                nearestEnemy = state.localPlayer;
            }
        }
        
        for (const pid in state.activePlayers) {
            const enemy = state.activePlayers[pid];
            if (enemy.hp <= 0) continue;
            
            const enemyTeam = enemy.teamId || (pid.startsWith('bot_') ? state.aiBots.find(b => b.id === pid)?.teamId : 2);
            if (enemyTeam === bot.teamId) continue;

            const dist = Math.hypot(bot.x - enemy.x, bot.y - enemy.y);
            if (dist < minDist) {
                minDist = dist;
                nearestEnemy = enemy;
            }
        }
        
        if (nearestEnemy) {
            targetAngle = Math.atan2(nearestEnemy.y - bot.y, nearestEnemy.x - bot.x);
            
            // Pohyb k cíli
            if (minDist > 140) {
                moveX = Math.cos(targetAngle) * bot.speed;
                moveY = Math.sin(targetAngle) * bot.speed;
            } else {
                moveX = -Math.sin(targetAngle) * bot.speed;
                moveY = Math.cos(targetAngle) * bot.speed;
            }
            
            // AI casting spells in RPG Mode
            if (bot.rpgMode && now - bot.lastSpellCastTime > 6000 + Math.random() * 4000) {
                bot.lastSpellCastTime = now;
                if (bot.classIndex === 1 && minDist < 240) {
                    // Bot Mage - Frost Nova
                    playSound('shoot_smg');
                    state.spellEffects.push({
                        type: 'frost_nova',
                        x: bot.x,
                        y: bot.y,
                        radius: 0,
                        maxRadius: 130,
                        startTime: now,
                        duration: 400
                    });
                    // Freeze target
                    if (nearestEnemy === state.localPlayer && !state.localPlayer.isShielded) {
                        state.localPlayer.isFrozen = true;
                        state.localPlayer.freezeEndTime = now + 2000;
                    }
                } else if (bot.classIndex === 3 && bot.hp < 40) {
                    // Bot Healer - Divine Shield
                    playSound('heal');
                    bot.isShielded = true;
                    bot.shieldEndTime = now + 2000;
                }
            }

            // Střelba / Zbraně
            if (now - bot.lastShotTime > 1400 + Math.random() * 800) {
                bot.lastShotTime = now;
                
                if (bot.rpgMode) {
                    const levelMultiplier = 1 + (bot.level - 1) * 0.15;
                    if (bot.classIndex === 0) {
                        // Warrior Melee swing
                        playSound('punch');
                        state.spellEffects.push({
                            type: 'sword_slash',
                            x: bot.x,
                            y: bot.y,
                            angle: targetAngle,
                            startTime: now,
                            duration: 200
                        });
                        
                        if (nearestEnemy === state.localPlayer && minDist < 90 && !state.localPlayer.isShielded) {
                            state.localPlayer.hp = Math.max(0, state.localPlayer.hp - 16 * levelMultiplier);
                            playSound('hit');
                            updateUI();
                            if (state.localPlayer.hp <= 0) handleDeath(bot.id);
                        }
                    } else if (bot.classIndex === 1) {
                        // Mage fireball
                        playSound('shoot_rifle');
                        const dev = (Math.random() - 0.5) * 0.1;
                        const ba = targetAngle + dev;
                        state.localBullets.push({
                            id: `${bot.id}_fb_${now}`,
                            ownerId: bot.id,
                            x: bot.x + Math.cos(targetAngle) * (bot.radius + 15),
                            y: bot.y + Math.sin(targetAngle) * (bot.radius + 15),
                            vx: Math.cos(ba) * 9.5,
                            vy: Math.sin(ba) * 9.5,
                            damage: 20 * levelMultiplier,
                            range: 520,
                            travelled: 0,
                            color: '#f97316',
                            timestamp: now,
                            bulletType: 'fireball'
                        });
                    } else if (bot.classIndex === 2) {
                        // Ranger bow arrow
                        playSound('shoot_pistol');
                        const dev = (Math.random() - 0.5) * 0.05;
                        const ba = targetAngle + dev;
                        state.localBullets.push({
                            id: `${bot.id}_arr_${now}`,
                            ownerId: bot.id,
                            x: bot.x + Math.cos(targetAngle) * (bot.radius + 15),
                            y: bot.y + Math.sin(targetAngle) * (bot.radius + 15),
                            vx: Math.cos(ba) * 17.5,
                            vy: Math.sin(ba) * 17.5,
                            damage: 15 * levelMultiplier,
                            range: 820,
                            travelled: 0,
                            color: '#fbbf24',
                            timestamp: now,
                            bulletType: 'arrow'
                        });
                    } else if (bot.classIndex === 3) {
                        // Priest holy beam
                        playSound('shoot_smg');
                        const dev = (Math.random() - 0.5) * 0.02;
                        const ba = targetAngle + dev;
                        state.localBullets.push({
                            id: `${bot.id}_hb_${now}`,
                            ownerId: bot.id,
                            x: bot.x + Math.cos(targetAngle) * (bot.radius + 15),
                            y: bot.y + Math.sin(targetAngle) * (bot.radius + 15),
                            vx: Math.cos(ba) * 20,
                            vy: Math.sin(ba) * 20,
                            damage: 12 * levelMultiplier,
                            range: 700,
                            travelled: 0,
                            color: '#fbbf24',
                            timestamp: now,
                            bulletType: 'holy_beam'
                        });
                    }
                } else {
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
            }
        } else {
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
        
        bot.x = Math.max(bot.radius, Math.min(MAP_SIZE - bot.radius, bot.x + moveX));
        bot.y = Math.max(bot.radius, Math.min(MAP_SIZE - bot.radius, bot.y + moveY));
        
        let diff = targetAngle - bot.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        bot.angle += diff * 0.15;
        
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
        
        if (dToCenter > zone.radius) {
            if (!bot.isShielded) {
                bot.hp = Math.max(0, bot.hp - (zone.state === 'collapsing' ? 0.8 : 0.35));
                if (bot.hp <= 0) {
                    bot.killedBy = 'Zóna';
                }
            }
        }

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
                    targetY: bot.y,
                    isFrozen: bot.isFrozen,
                    isShielded: bot.isShielded
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
state.onBotHpUpdate = updateBotHpInDB;


export function simulateMOBALogic(nowTime) {
    if (!state.mobaMinions) return;

    // 1. Minion Wave Spawning
    if (nowTime - (state.lastMinionSpawnTime || 0) >= 30000) {
        state.lastMinionSpawnTime = nowTime;
        const lanes = ['top', 'mid', 'bot'];
        const types = ['knight', 'caster', 'tank'];
        
        lanes.forEach(lane => {
            types.forEach((type, index) => {
                // Blue Minion
                state.mobaMinions.push({
                    id: `minion_blue_${lane}_${type}_${nowTime}`,
                    teamId: 1,
                    lane,
                    type,
                    x: 300 + (Math.random() - 0.5) * 40,
                    y: 3700 + (Math.random() - 0.5) * 40,
                    radius: type === 'knight' ? 20 : (type === 'caster' ? 18 : 24),
                    hp: type === 'knight' ? 120 : (type === 'caster' ? 80 : 200),
                    maxHp: type === 'knight' ? 120 : (type === 'caster' ? 80 : 200),
                    speed: type === 'knight' ? 2.5 : (type === 'caster' ? 2.2 : 2.0),
                    damage: type === 'knight' ? 10 : (type === 'caster' ? 15 : 25),
                    range: type === 'caster' ? 220 : 60,
                    lastAttackTime: 0,
                    currentPathIndex: 0,
                    target: null
                });
                
                // Red Minion
                state.mobaMinions.push({
                    id: `minion_red_${lane}_${type}_${nowTime}`,
                    teamId: 2,
                    lane,
                    type,
                    x: 3700 + (Math.random() - 0.5) * 40,
                    y: 300 + (Math.random() - 0.5) * 40,
                    radius: type === 'knight' ? 20 : (type === 'caster' ? 18 : 24),
                    hp: type === 'knight' ? 120 : (type === 'caster' ? 80 : 200),
                    maxHp: type === 'knight' ? 120 : (type === 'caster' ? 80 : 200),
                    speed: type === 'knight' ? 2.5 : (type === 'caster' ? 2.2 : 2.0),
                    damage: type === 'knight' ? 10 : (type === 'caster' ? 15 : 25),
                    range: type === 'caster' ? 220 : 60,
                    lastAttackTime: 0,
                    currentPathIndex: 0,
                    target: null
                });
            });
        });
    }

    // Path definitions
    const getMinionPath = (teamId, lane) => {
        if (lane === 'top') {
            return teamId === 1 
                ? [{ x: 300, y: 3700 }, { x: 300, y: 300 }, { x: 3700, y: 300 }]
                : [{ x: 3700, y: 300 }, { x: 300, y: 300 }, { x: 300, y: 3700 }];
        } else if (lane === 'bot') {
            return teamId === 1
                ? [{ x: 300, y: 3700 }, { x: 3700, y: 3700 }, { x: 3700, y: 300 }]
                : [{ x: 3700, y: 300 }, { x: 3700, y: 3700 }, { x: 300, y: 3700 }];
        } else { // mid
            return teamId === 1
                ? [{ x: 300, y: 3700 }, { x: 2000, y: 2000 }, { x: 3700, y: 300 }]
                : [{ x: 3700, y: 300 }, { x: 2000, y: 2000 }, { x: 300, y: 3700 }];
        }
    };

    // 2. Minions Marching & Aggro Loop
    for (let i = state.mobaMinions.length - 1; i >= 0; i--) {
        const mn = state.mobaMinions[i];
        
        // Target tracking & scanning
        let target = mn.target;
        if (target && (target.hp <= 0 || Math.hypot(mn.x - target.x, mn.y - target.y) > 300)) {
            mn.target = null;
            target = null;
        }

        if (!target) {
            let nearestEnemy = null;
            let minDist = 220; // aggro range
            
            // Allied structures backdoor detection & aggro
            state.mobaStructures.forEach(st => {
                if (st.hp > 0 && st.teamId !== mn.teamId) {
                    const d = Math.hypot(mn.x - st.x, mn.y - st.y);
                    if (d < minDist) {
                        minDist = d;
                        nearestEnemy = st;
                    }
                }
            });

            // Enemy players
            if (state.localPlayer && state.localPlayer.hp > 0 && state.localPlayer.teamId !== mn.teamId) {
                const d = Math.hypot(mn.x - state.localPlayer.x, mn.y - state.localPlayer.y);
                if (d < minDist) {
                    minDist = d;
                    nearestEnemy = state.localPlayer;
                }
            }
            
            for (const pid in state.activePlayers) {
                const enemy = state.activePlayers[pid];
                if (enemy.hp > 0 && enemy.teamId !== mn.teamId) {
                    const d = Math.hypot(mn.x - enemy.x, mn.y - enemy.y);
                    if (d < minDist) {
                        minDist = d;
                        nearestEnemy = enemy;
                    }
                }
            }

            // Other minions
            state.mobaMinions.forEach(emn => {
                if (emn.teamId !== mn.teamId) {
                    const d = Math.hypot(mn.x - emn.x, mn.y - emn.y);
                    if (d < minDist) {
                        minDist = d;
                        nearestEnemy = emn;
                    }
                }
            });

            if (nearestEnemy) {
                mn.target = nearestEnemy;
                target = nearestEnemy;
            }
        }

        // Action
        if (target) {
            const dist = Math.hypot(target.x - mn.x, target.y - mn.y);
            if (dist <= mn.range + target.radius) {
                // Halt and attack!
                if (nowTime - mn.lastAttackTime >= 1000) {
                    mn.lastAttackTime = nowTime;
                    playSound('hit');
                    
                    target.hp = Math.max(0, target.hp - mn.damage);
                    
                    // If target died
                    if (target.hp <= 0) {
                        if (target.id === state.playerId) {
                            handleDeath('Enemy Minion');
                        } else if (target.type === 'nexus') {
                            handleNexusDestroyed(target.teamId);
                        }
                        mn.target = null;
                    }
                }
            } else {
                // Move towards target
                const a = Math.atan2(target.y - mn.y, target.x - mn.x);
                mn.x += Math.cos(a) * mn.speed;
                mn.y += Math.sin(a) * mn.speed;
            }
        } else {
            // March lane path points
            const path = getMinionPath(mn.teamId, mn.lane);
            const pt = path[mn.currentPathIndex];
            if (pt) {
                const distToPt = Math.hypot(mn.x - pt.x, mn.y - pt.y);
                if (distToPt < 35) {
                    mn.currentPathIndex = Math.min(path.length - 1, mn.currentPathIndex + 1);
                }
                const nextPt = path[mn.currentPathIndex];
                const a = Math.atan2(nextPt.y - mn.y, nextPt.x - mn.x);
                mn.x += Math.cos(a) * mn.speed;
                mn.y += Math.sin(a) * mn.speed;
            }
        }
    }

    // 3. Turret Magical Targeting & Homing projectile shooting
    state.mobaStructures.forEach(st => {
        if (st.type !== 'turret' || st.hp <= 0) return;
        
        let target = null;
        let minDist = 420; // turret range

        // Prioritize enemy minions
        state.mobaMinions.forEach(mn => {
            if (mn.teamId !== st.teamId) {
                const d = Math.hypot(st.x - mn.x, st.y - mn.y);
                if (d < minDist) {
                    minDist = d;
                    target = mn;
                }
            }
        });

        // Then players
        if (!target) {
            if (state.localPlayer && state.localPlayer.hp > 0 && state.localPlayer.teamId !== st.teamId) {
                const d = Math.hypot(st.x - state.localPlayer.x, st.y - state.localPlayer.y);
                if (d < minDist) {
                    minDist = d;
                    target = state.localPlayer;
                }
            }
            
            for (const pid in state.activePlayers) {
                const enemy = state.activePlayers[pid];
                if (enemy.hp > 0 && enemy.teamId !== st.teamId) {
                    const d = Math.hypot(st.x - enemy.x, st.y - enemy.y);
                    if (d < minDist) {
                        minDist = d;
                        target = enemy;
                    }
                }
            }
        }

        if (target && nowTime - st.lastShotTime >= 1500) {
            st.lastShotTime = nowTime;
            playSound('shoot_rifle');
            
            state.mobaProjectiles.push({
                id: `proj_${st.id}_${nowTime}`,
                teamId: st.teamId,
                x: st.x,
                y: st.y,
                target: target,
                speed: 8.5,
                damage: 45
            });
        }
    });

    // 4. Homing Projectiles update
    for (let i = state.mobaProjectiles.length - 1; i >= 0; i--) {
        const pr = state.mobaProjectiles[i];
        const target = pr.target;
        
        if (!target || target.hp <= 0) {
            state.mobaProjectiles.splice(i, 1);
            continue;
        }

        const dist = Math.hypot(target.x - pr.x, target.y - pr.y);
        if (dist < 22) {
            // Hit!
            target.hp = Math.max(0, target.hp - pr.damage);
            playSound('hit');
            
            if (target.hp <= 0) {
                if (target.id === state.playerId) {
                    handleDeath('Defense Turret');
                } else {
                    const idx = state.mobaMinions.indexOf(target);
                    if (idx !== -1) state.mobaMinions.splice(idx, 1);
                }
            }
            state.mobaProjectiles.splice(i, 1);
        } else {
            const a = Math.atan2(target.y - pr.y, target.x - pr.x);
            pr.x += Math.cos(a) * pr.speed;
            pr.y += Math.sin(a) * pr.speed;
        }
    }
}

export async function handleNexusDestroyed(destroyedTeamId) {
    if (!state.gameActive) return;
    state.gameActive = false;
    playSound('death');
    
    if (state.networkInterval) { clearInterval(state.networkInterval); state.networkInterval = null; }
    if (state.botInterval) { clearInterval(state.botInterval); state.botInterval = null; }

    const isVictory = destroyedTeamId === 2; // Red Nexus fell

    const title = document.querySelector('.death-card h2');
    if (title) {
        title.textContent = isVictory ? 'VÍTĚZSTVÍ!' : 'PORÁŽKA!';
        title.style.color = isVictory ? '#fbbf24' : '#ef4444';
    }

    const card = document.querySelector('.death-card');
    if (card) {
        card.style.borderColor = isVictory ? 'rgba(251, 191, 36, 0.4)' : 'rgba(220, 38, 38, 0.3)';
    }

    const icon = document.querySelector('.death-icon');
    if (icon) {
        icon.innerHTML = isVictory 
            ? '<i class="fa-solid fa-trophy" style="font-size:2.5rem;color:#fbbf24"></i>'
            : '<i class="fa-solid fa-skull-crossbones" style="font-size:2.5rem;color:#ef4444"></i>';
        icon.style.background = isVictory ? 'rgba(251,191,36,0.1)' : 'rgba(127,29,29,0.3)';
        icon.style.borderColor = isVictory ? 'rgba(251,191,36,0.4)' : 'rgba(239,68,68,0.5)';
    }

    document.getElementById('death-killer-text').textContent = isVictory 
        ? 'Zničili jste nepřátelský Nexus!' 
        : 'Váš Nexus byl zničen!';
        
    document.getElementById('death-stat-kills').textContent  = state.localPlayer.kills;
    const elapsed = Math.floor((Date.now() - state.playStartTime) / 1000);
    document.getElementById('death-stat-time').textContent   = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
    
    document.getElementById('death-screen').style.display    = 'flex';
    document.getElementById('game-ui').style.display         = 'none';

    await removePlayerFromAppwrite();
}
