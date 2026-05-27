import { MAP_SIZE, WEAPONS } from './constants.js';
import { state } from './state.js';
import { updateUI } from './ui.js';
import { playSound } from './audio.js';


// =============================================
// GENEROVÁNÍ MAPY (deterministické)
// =============================================

export function generateObstacles() {
    const list = [];
    let seed = 42;
    const random = () => { const x = Math.sin(seed++) * 10000; return x - Math.floor(x); };

    if (state.rpgMode) {
        // MOBA Jungle Obstacles (leave Top, Mid, Bot lanes completely open)
        for (let i = 0; i < 95; i++) {
            const type = random() < 0.4 ? 'tree' : 'rock';
            // Choose one of the 4 jungle quadrants
            const quad = Math.floor(random() * 4);
            let qx = 0, qy = 0;
            if (quad === 0) { // Top-Left Jungle
                qx = 600 + random() * 1100;
                qy = 600 + random() * 1100;
            } else if (quad === 1) { // Bottom-Right Jungle
                qx = 2300 + random() * 1100;
                qy = 2300 + random() * 1100;
            } else if (quad === 2) { // Bottom-Left Jungle (between Mid & Bot)
                qx = 600 + random() * 1100;
                qy = 2300 + random() * 1100;
            } else { // Top-Right Jungle (between Mid & Top)
                qx = 2300 + random() * 1100;
                qy = 600 + random() * 1100;
            }
            
            list.push({
                id:      `obs_${i}`,
                type,
                x:       qx,
                y:       qy,
                radius:  type === 'tree' ? 44 : 48,
                hp:      1500,
                maxHp:   1500,
                color:   type === 'tree' ? '#14532d' : '#44403c',
                lootType: 'medkit'
            });
        }
    } else {
        // Standard Přežití obstacles
        for (let i = 0; i < 85; i++) {
            const type = random() < 0.35 ? 'tree' : (random() < 0.65 ? 'rock' : 'crate');
            list.push({
                id:      `obs_${i}`,
                type,
                x:       random() * (MAP_SIZE - 200) + 100,
                y:       random() * (MAP_SIZE - 200) + 100,
                radius:  type === 'tree' ? 42 : (type === 'rock' ? 45 : 35),
                hp:      type === 'crate' ? 100 : 1000,
                maxHp:   type === 'crate' ? 100 : 1000,
                color:   type === 'tree' ? '#15803d' : (type === 'rock' ? '#78716c' : '#b45309'),
                lootType: random() < 0.25 ? 'pistol' : (random() < 0.45 ? 'smg' : (random() < 0.65 ? 'rifle' : (random() < 0.85 ? 'shotgun' : (random() < 0.93 ? 'sniper' : 'medkit')))),
            });
        }
    }
    return list;
}

export function generateSpawnedLoot() {
    const list = [];
    let seed = 999;
    const random = () => { const x = Math.sin(seed++) * 10000; return x - Math.floor(x); };
    const types  = ['pistol', 'shotgun', 'smg', 'rifle', 'sniper', 'medkit'];

    for (let i = 0; i < 45; i++) {
        list.push({
            x:    random() * (MAP_SIZE - 200) + 100,
            y:    random() * (MAP_SIZE - 200) + 100,
            type: types[Math.floor(random() * types.length)],
        });
    }
    return list;
}

// =============================================
// =============================================
// ZÓNA (DETERMINISTICKÁ HYBRIDNÍ SMRŠŤOVACÍ KRUHOVÁ ZÓNA)
// =============================================

function getSeededRandom(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
        h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return function() {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
}

export function getZoneState() {
    if (!state.gameActive || state.playStartTime === 0) {
        return { 
            center: { x: MAP_SIZE / 2, y: MAP_SIZE / 2 }, 
            radius: MAP_SIZE * 1.05, 
            timerText: "00:00", 
            statusText: "Čekání na start", 
            state: "stable" 
        };
    }

    const elapsed = (Date.now() - state.playStartTime) / 1000;
    const roomId = state.currentRoomId || 'default_surviv_seed';
    const rand = getSeededRandom(roomId);
    
    // Generování 5 vln s náhodnými středy, které jsou vnořeny do předchozích vln
    const waves = [];
    waves.push({
        center: { x: MAP_SIZE / 2, y: MAP_SIZE / 2 },
        radius: MAP_SIZE * 1.05
    });

    for (let i = 1; i <= 5; i++) {
        const prev = waves[i - 1];
        const radius = prev.radius * 0.46; // Každá vlna zmenší zónu o cca 54 %
        
        // Nový střed musí ležet uvnitř předchozího kruhu
        const maxOffset = prev.radius - radius;
        const angle = rand() * Math.PI * 2;
        const dist = rand() * maxOffset * 0.85; // 85% dosah
        const cx = prev.center.x + Math.cos(angle) * dist;
        const cy = prev.center.y + Math.sin(angle) * dist;
        
        waves.push({
            center: { x: cx, y: cy },
            radius
        });
    }

    // Počátečních 10 sekund klidu před 1. vlnou
    if (elapsed < 10) {
        const rem = Math.ceil(10 - elapsed);
        return {
            center: waves[0].center,
            radius: waves[0].radius,
            timerText: `0:${String(rem).padStart(2, "0")}`,
            statusText: "Příprava (Zóna stabilní)",
            state: "stable"
        };
    }

    // 5 cyklů (30s zmenšování + 10s pauza = 40s na vlnu)
    const cycleTime = 40;
    const cycleElapsed = elapsed - 10;
    const cycleIndex = Math.floor(cycleElapsed / cycleTime);
    
    if (cycleIndex < 5) {
        const cycleProgress = cycleElapsed % cycleTime;
        const wStart = waves[cycleIndex];
        const wEnd = waves[cycleIndex + 1];
        
        if (cycleProgress < 30) {
            // Zmenšování (30s) - plynule interpolujeme střed i poloměr
            const t = cycleProgress / 30;
            const cx = wStart.center.x + (wEnd.center.x - wStart.center.x) * t;
            const cy = wStart.center.y + (wEnd.center.y - wStart.center.y) * t;
            const radius = wStart.radius + (wEnd.radius - wStart.radius) * t;
            const rem = Math.ceil(30 - cycleProgress);
            
            return {
                center: { x: cx, y: cy },
                radius,
                timerText: `0:${String(rem).padStart(2, "0")}`,
                statusText: `Zóna se smršťuje (Vlna ${cycleIndex + 1}/5)`,
                state: "shrinking"
            };
        } else {
            // Pauza (10s) - zóna je stabilní na cílových hodnotách
            const rem = Math.ceil(40 - cycleProgress);
            return {
                center: wEnd.center,
                radius: wEnd.radius,
                timerText: `0:${String(rem).padStart(2, "0")}`,
                statusText: `Zóna je stabilní (Vlna ${cycleIndex + 1}/5)`,
                state: "stable"
            };
        }
    } else {
        // Totální kolaps po skončení 5. vlny
        const finalCenter = waves[5].center;
        return {
            center: finalCenter,
            radius: 0,
            timerText: "00:00",
            statusText: "FINÁLNÍ KOLAPS ZÓNY!",
            state: "collapsing"
        };
    }
}

// =============================================
// TŘÍDA HRÁČE
// =============================================

export class Player {
    constructor(id, name, color) {
        this.id    = id;
        this.color = color;
        this.radius = 28;
        this.angle  = 0;
        this.kills  = 0;
        this.countedKills = {};
        this.currentWeapon = 'fists';
        this.weapons = { fists: true };
        this.ammo = {
            pistol: WEAPONS.pistol.ammoMax,
            shotgun: WEAPONS.shotgun.ammoMax,
            smg:    WEAPONS.smg.ammoMax,
            rifle:  WEAPONS.rifle.ammoMax,
            sniper: WEAPONS.sniper.ammoMax,
        };
        this.medkits       = 1;
        this.lastShotTime  = 0;
        this.isHealRunning = false;
        
        // Sledování animace přebíjení
        this.reloadStartTime = 0;
        this.reloadDuration = 0;

        // RPG MOBA State
        this.rpgMode = state.rpgMode;
        this.classIndex = state.rpgMode ? state.selectedClassIndex : -1;
        this.level = 1;
        this.xp = 0;
        this.maxXp = 100;
        
        this.qCooldown = 0;
        this.eCooldown = 0;
        this.qLastUsed = 0;
        this.eLastUsed = 0;

        this.isShielded = false;
        this.shieldEndTime = 0;
        this.isFrozen = false;
        this.freezeEndTime = 0;
        
        this.isSpinning = false;
        this.spinEndTime = 0;
        this.isLeaping = false;
        this.leapEndTime = 0;
        this.leapAngle = 0;

        // LoL MOBA Expansion
        this.gold = 0;
        this.items = []; // 'ie', 'dc', 'warmog', 'boots'
        this.isDead = false;
        this.respawnTime = 0;

        // Tým a spawn pozice podle LoL mapy
        this.teamId = id === state.playerId ? state.teamId : 2; // Výchozí nastavení
        if (this.rpgMode) {
            // Blue team spawne v levém dolním rohu, Red v pravém horním
            if (this.teamId === 1) {
                this.x = 250 + Math.random() * 150;
                this.y = 3600 + Math.random() * 150;
            } else {
                this.x = 3600 + Math.random() * 150;
                this.y = 250 + Math.random() * 150;
            }
            this.maxHp = this.getMaxHpWithItems();
            this.hp = this.maxHp;
        } else {
            this.x = Math.random() * (MAP_SIZE - 400) + 200;
            this.y = Math.random() * (MAP_SIZE - 400) + 200;
            this.maxHp = 100;
            this.hp = 100;
        }

        this.speed = this.getSpeedWithItems();

        // Serializujeme jméno jako Name|ClassIndex|Level v RPG režimu pro plnou Appwrite kompatibilitu!
        if (this.rpgMode) {
            this.name = `${name}|${this.classIndex}|${this.level}`;
        } else {
            this.name = name;
        }
    }

    getMaxHpWithItems() {
        if (!this.rpgMode) return 100;
        const levelBonus = (this.level - 1) * 20;
        const warmogBonus = this.items.filter(it => it === 'warmog').length * 100;
        return 100 + levelBonus + warmogBonus;
    }

    getSpeedWithItems() {
        if (!this.rpgMode) return 4.5;
        const bootsBonus = this.items.filter(it => it === 'boots').length * 0.25;
        return 4.5 * (1 + bootsBonus);
    }

    getDamageMultiplier() {
        if (!this.rpgMode) return 1.0;
        const ieBonus = this.items.filter(it => it === 'ie').length * 0.30;
        return 1 + (this.level - 1) * 0.15 + ieBonus;
    }

    getSpellPowerMultiplier() {
        if (!this.rpgMode) return 1.0;
        const dcBonus = this.items.filter(it => it === 'dc').length * 0.40;
        return 1 + (this.level - 1) * 0.15 + dcBonus;
    }

    addXp(amount) {
        if (!this.rpgMode || this.level >= 5) return;
        this.xp += amount;
        if (this.xp >= this.maxXp) {
            this.xp -= this.maxXp;
            this.level++;
            this.maxXp = this.level * 100;
            this.maxHp = this.getMaxHpWithItems();
            this.hp = this.maxHp; // Heal k plnému zdraví!
            
            // Přejmenování s novým levelem
            const rawName = this.name.split('|')[0];
            this.name = `${rawName}|${this.classIndex}|${this.level}`;
            
            // Zlaté kolo level up
            this.levelUpGlow = Date.now() + 1500;
            playSound('heal'); // Pěkný zvuk pro level up
            
            if (this.id === state.playerId) {
                updateUI();
            }
        }
        if (this.id === state.playerId) {
            updateUI();
        }
    }

    castSpellQ() {
        if (this.hp <= 0 || !this.rpgMode || this.isFrozen) return;
        const now = Date.now();
        const qCooldowns = [6000, 8000, 5000, 8000]; // Cooldowny v ms: Warrior, Mage, Ranger, Priest
        const cooldown = qCooldowns[this.classIndex] || 5000;
        if (now - (this.qLastUsed || 0) < cooldown) return;
        
        this.qLastUsed = now;
        
        if (this.classIndex === 0) {
            // Warrior - Whirlwind Spin
            this.isSpinning = true;
            this.spinEndTime = now + 2000;
            playSound('punch');
        } else if (this.classIndex === 1) {
            // Mage - Frost Nova
            playSound('shoot_smg');
            state.spellEffects.push({
                type: 'frost_nova',
                x: this.x,
                y: this.y,
                radius: 0,
                maxRadius: 140,
                startTime: now,
                duration: 400
            });
            
            // Frost freeze detection
            if (this.id === state.playerId) {
                for (const id in state.activePlayers) {
                    const enemy = state.activePlayers[id];
                    if (enemy.hp <= 0) continue;
                    if (enemy.teamId === state.teamId) continue;
                    const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
                    if (dist <= 140) {
                        enemy.isFrozen = true;
                        enemy.freezeEndTime = now + 2000;
                    }
                }
            }
        } else if (this.classIndex === 2) {
            // Ranger - Multi-Shot (3 arrows)
            playSound('shoot_pistol');
            for (let i = -1; i <= 1; i++) {
                const ba = this.angle + (i * 0.2);
                state.localBullets.push({
                    id: `${this.id}_q_${now}_${i}`,
                    ownerId: this.id,
                    x: this.x + Math.cos(this.angle) * (this.radius + 15),
                    y: this.y + Math.sin(this.angle) * (this.radius + 15),
                    vx: Math.cos(ba) * 16,
                    vy: Math.sin(ba) * 16,
                    damage: 12 * this.getDamageMultiplier(),
                    range: 800,
                    travelled: 0,
                    color: '#60a5fa',
                    timestamp: now,
                    bulletType: 'arrow'
                });
            }
        } else if (this.classIndex === 3) {
            // Healer - Holy Ring (Healing Circle)
            playSound('heal');
            state.spellEffects.push({
                type: 'holy_ring',
                x: this.x,
                y: this.y,
                radius: 110,
                startTime: now,
                endTime: now + 3000,
                ownerId: this.id
            });
        }
        
        if (this.id === state.playerId) {
            updateUI();
        }
    }

    castSpellE() {
        if (this.hp <= 0 || !this.rpgMode || this.isFrozen) return;
        const now = Date.now();
        const eCooldowns = [12000, 14000, 10000, 15000]; // Warrior, Mage, Ranger, Priest
        const cooldown = eCooldowns[this.classIndex] || 10000;
        if (now - (this.eLastUsed || 0) < cooldown) return;
        
        this.eLastUsed = now;
        
        if (this.classIndex === 0) {
            // Warrior - Leap Smash
            this.isLeaping = true;
            this.leapEndTime = now + 400;
            this.leapAngle = this.angle;
            playSound('punch');
        } else if (this.classIndex === 1) {
            // Mage - Meteor Shower
            playSound('shoot_rifle');
            const targetX = this.x + Math.cos(this.angle) * 220;
            const targetY = this.y + Math.sin(this.angle) * 220;
            state.spellEffects.push({
                type: 'meteor',
                x: targetX,
                y: targetY,
                startTime: now,
                endTime: now + 1200,
                ownerId: this.id
            });
        } else if (this.classIndex === 2) {
            // Ranger - Explosive Shot
            playSound('shoot_sniper');
            const ba = this.angle;
            state.localBullets.push({
                id: `${this.id}_e_${now}`,
                ownerId: this.id,
                x: this.x + Math.cos(this.angle) * (this.radius + 15),
                y: this.y + Math.sin(this.angle) * (this.radius + 15),
                vx: Math.cos(ba) * 14,
                vy: Math.sin(ba) * 14,
                damage: 16 * this.getDamageMultiplier(),
                range: 750,
                travelled: 0,
                color: '#ec4899',
                timestamp: now,
                bulletType: 'explosive_arrow'
            });
        } else if (this.classIndex === 3) {
            // Healer - Divine Shield (Absolute invulnerability)
            playSound('heal');
            this.isShielded = true;
            this.shieldEndTime = now + 2500;
        }
        
        if (this.id === state.playerId) {
            updateUI();
        }
    }

    shoot() {
        if (this.hp <= 0 || this.isFrozen) return;
        
        if (this.rpgMode) {
            const now = Date.now();
            
            if (this.classIndex === 0) {
                // Warrior melee slash swing sword
                if (now - this.lastShotTime < 450) return;
                this.lastShotTime = now;
                if (state.triggerScreenShake) state.triggerScreenShake(2.0);
                playSound('punch');
                
                // Visual swipe effect
                state.spellEffects.push({
                    type: 'sword_slash',
                    x: this.x,
                    y: this.y,
                    angle: this.angle,
                    startTime: now,
                    duration: 200
                });
                
                // Deal melee swipe damage
                if (this.id === state.playerId) {
                    for (const id in state.activePlayers) {
                        const enemy = state.activePlayers[id];
                        if (enemy.hp <= 0) continue;
                        if (enemy.teamId === state.teamId) continue;
                        
                        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
                        if (dist <= 85) {
                            let diffAngle = Math.atan2(enemy.y - this.y, enemy.x - this.x) - this.angle;
                            while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
                            while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
                            
                            if (Math.abs(diffAngle) < Math.PI / 3) {
                                // Hit enemy with melee!
                                enemy.hp = Math.max(0, enemy.hp - 16 * this.getDamageMultiplier());
                                if (id.startsWith('bot_')) {
                                    if (state.aiBots) {
                                        const localBot = state.aiBots.find(b => b.id === id);
                                        if (localBot) {
                                            localBot.hp = enemy.hp;
                                            if (enemy.hp <= 0) localBot.killedBy = this.id;
                                        }
                                    }
                                    if (state.onBotHpUpdate) {
                                        state.onBotHpUpdate(id, enemy.hp, this.id);
                                    }
                                }
                                playSound('hit');
                            }
                        }
                    }
                }
            } else if (this.classIndex === 1) {
                // Mage fireball ranged attack
                if (now - this.lastShotTime < 800) return;
                this.lastShotTime = now;
                if (state.spawnParticles) {
                    state.spawnParticles(
                        this.x + Math.cos(this.angle) * (this.radius + 15),
                        this.y + Math.sin(this.angle) * (this.radius + 15),
                        6,
                        'spark',
                        '#f97316',
                        { angle: this.angle, spread: 0.4, speed: 4.5 }
                    );
                }
                if (state.triggerScreenShake) state.triggerScreenShake(2.5);
                playSound('shoot_rifle');
                
                state.localBullets.push({
                    id: `${this.id}_fb_${now}`,
                    ownerId: this.id,
                    x: this.x + Math.cos(this.angle) * (this.radius + 15),
                    y: this.y + Math.sin(this.angle) * (this.radius + 15),
                    vx: Math.cos(this.angle) * 9.5,
                    vy: Math.sin(this.angle) * 9.5,
                    damage: 20 * this.getSpellPowerMultiplier(),
                    range: 520,
                    travelled: 0,
                    color: '#f97316',
                    timestamp: now,
                    bulletType: 'fireball'
                });
            } else if (this.classIndex === 2) {
                // Ranger precision bow shot arrow
                if (now - this.lastShotTime < 600) return;
                this.lastShotTime = now;
                if (state.spawnParticles) {
                    state.spawnParticles(
                        this.x + Math.cos(this.angle) * (this.radius + 15),
                        this.y + Math.sin(this.angle) * (this.radius + 15),
                        5,
                        'spark',
                        '#60a5fa',
                        { angle: this.angle, spread: 0.35, speed: 4.0 }
                    );
                }
                if (state.triggerScreenShake) state.triggerScreenShake(1.5);
                playSound('shoot_pistol');
                
                state.localBullets.push({
                    id: `${this.id}_arr_${now}`,
                    ownerId: this.id,
                    x: this.x + Math.cos(this.angle) * (this.radius + 15),
                    y: this.y + Math.sin(this.angle) * (this.radius + 15),
                    vx: Math.cos(this.angle) * 17.5,
                    vy: Math.sin(this.angle) * 17.5,
                    damage: 15 * this.getDamageMultiplier(),
                    range: 820,
                    travelled: 0,
                    color: '#fbbf24',
                    timestamp: now,
                    bulletType: 'arrow'
                });
            } else if (this.classIndex === 3) {
                // Priest holy beam attack
                if (now - this.lastShotTime < 500) return;
                this.lastShotTime = now;
                if (state.spawnParticles) {
                    state.spawnParticles(
                        this.x + Math.cos(this.angle) * (this.radius + 15),
                        this.y + Math.sin(this.angle) * (this.radius + 15),
                        5,
                        'spark',
                        '#fbbf24',
                        { angle: this.angle, spread: 0.38, speed: 4.2 }
                    );
                }
                if (state.triggerScreenShake) state.triggerScreenShake(1.8);
                playSound('shoot_smg');
                
                state.localBullets.push({
                    id: `${this.id}_hb_${now}`,
                    ownerId: this.id,
                    x: this.x + Math.cos(this.angle) * (this.radius + 15),
                    y: this.y + Math.sin(this.angle) * (this.radius + 15),
                    vx: Math.cos(this.angle) * 20,
                    vy: Math.sin(this.angle) * 20,
                    damage: 12 * this.getSpellPowerMultiplier(),
                    range: 700,
                    travelled: 0,
                    color: '#fbbf24',
                    timestamp: now,
                    bulletType: 'holy_beam'
                });
            }
            return;
        }

        const weapon = WEAPONS[this.currentWeapon];
        const now    = Date.now();
        if (now - this.lastShotTime < weapon.cooldown) return;

        if (this.currentWeapon !== 'fists') {
            if (this.ammo[this.currentWeapon] <= 0) { this.reload(); return; }
            this.ammo[this.currentWeapon]--;
            playSound('shoot_' + this.currentWeapon);
            updateUI();
        } else {
            playSound('punch');
        }
        this.lastShotTime = now;

        // Muzzle Flash sparks & screen shake
        if (this.currentWeapon !== 'fists') {
            if (state.spawnParticles) {
                state.spawnParticles(
                    this.x + Math.cos(this.angle) * (this.radius + 15),
                    this.y + Math.sin(this.angle) * (this.radius + 15),
                    6,
                    'spark',
                    '#fbbf24',
                    { angle: this.angle, spread: 0.5, speed: 4.5, decay: 0.05 }
                );
            }
            if (state.triggerScreenShake) {
                const weaponShake = this.currentWeapon === 'sniper' ? 5.5 : (this.currentWeapon === 'shotgun' ? 4.5 : (this.currentWeapon === 'rifle' ? 2.5 : 1.5));
                state.triggerScreenShake(weaponShake);
            }
        }

        for (let i = 0; i < weapon.count; i++) {
            const dev = (Math.random() - 0.5) * weapon.spread;
            const ba  = this.angle + dev;
            state.localBullets.push({
                id:        `${this.id}_${now}_${i}`,
                ownerId:   this.id,
                x:         this.x + Math.cos(this.angle) * (this.radius + 15),
                y:         this.y + Math.sin(this.angle) * (this.radius + 15),
                vx:        Math.cos(ba) * weapon.speed,
                vy:        Math.sin(ba) * weapon.speed,
                damage:    weapon.damage,
                range:     weapon.range,
                travelled: 0,
                color:     this.color,
                timestamp: now,
            });
        }
    }

    reload() {
        if (this.rpgMode || this.currentWeapon === 'fists') return;
        const weapon = WEAPONS[this.currentWeapon];
        if (this.ammo[this.currentWeapon] === weapon.ammoMax) return;
        const rTime = weapon.reloadTime || 1200;
        
        this.lastShotTime = Date.now() + rTime;
        this.reloadStartTime = Date.now();
        this.reloadDuration = rTime;
        
        setTimeout(() => {
            if (this.currentWeapon !== 'fists') {
                this.ammo[this.currentWeapon] = weapon.ammoMax;
                playSound('reload');
                updateUI();
            }
        }, rTime);
    }

    useHeal() {
        if (this.medkits <= 0 || this.hp >= this.maxHp || this.isHealRunning || this.isFrozen) return;
        this.isHealRunning = true;
        setTimeout(() => {
            if (this.hp > 0 && this.medkits > 0) {
                this.hp = Math.min(this.maxHp, this.hp + 50);
                this.medkits--;
                this.isHealRunning = false;
                playSound('heal');
                updateUI();
            }
        }, 3000);
    }
}
