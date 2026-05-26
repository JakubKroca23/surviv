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

    for (let i = 0; i < 85; i++) {
        const type = random() < 0.35 ? 'tree' : (random() < 0.65 ? 'rock' : 'crate');
        list.push({
            id:      `obs_${i}`,
            type,
            x:       random() * (MAP_SIZE - 200) + 100,
            y:       random() * (MAP_SIZE - 200) + 100,
            radius:  type === 'tree' ? 30 : (type === 'rock' ? 45 : 35),
            hp:      type === 'crate' ? 100 : 1000,
            maxHp:   type === 'crate' ? 100 : 1000,
            color:   type === 'tree' ? '#15803d' : (type === 'rock' ? '#78716c' : '#b45309'),
            lootType: random() < 0.25 ? 'pistol' : (random() < 0.45 ? 'smg' : (random() < 0.65 ? 'rifle' : (random() < 0.85 ? 'shotgun' : (random() < 0.93 ? 'sniper' : 'medkit')))),
        });
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
// ZÓNA
// =============================================

export function getZoneState() {
    if (!state.gameActive || state.playStartTime === 0) {
        return { 
            center: { x: MAP_SIZE / 2, y: MAP_SIZE / 2 }, 
            radius: MAP_SIZE * 1.1, 
            timerText: "00:00", 
            statusText: "Čekání na start", 
            state: "stable" 
        };
    }

    const elapsed = (Date.now() - state.playStartTime) / 1000;
    const center = { x: MAP_SIZE / 2, y: MAP_SIZE / 2 };
    
    // Počátečních 10s klidu
    if (elapsed < 10) {
        const rem = Math.ceil(10 - elapsed);
        return {
            center,
            radius: MAP_SIZE * 1.1,
            timerText: `0:${String(rem).padStart(2, "0")}`,
            statusText: "Příprava (Zóna stabilní)",
            state: "stable"
        };
    }
    
    // Poté 5 cyklů (30s zmenšování + 10s pauza = 40s na vlnu)
    const cycleTime = 40;
    const cycleElapsed = elapsed - 10;
    const cycleIndex = Math.floor(cycleElapsed / cycleTime);
    
    if (cycleIndex < 5) {
        const cycleProgress = cycleElapsed % cycleTime;
        const currentCycleMaxRadius = MAP_SIZE * 1.1 * (1 - cycleIndex * 0.2);
        const nextCycleMaxRadius = MAP_SIZE * 1.1 * (1 - (cycleIndex + 1) * 0.2);
        
        if (cycleProgress < 30) {
            // Zmenšování (30s)
            const t = cycleProgress / 30;
            const radius = currentCycleMaxRadius - t * (currentCycleMaxRadius - nextCycleMaxRadius);
            const rem = Math.ceil(30 - cycleProgress);
            return {
                center,
                radius,
                timerText: `0:${String(rem).padStart(2, "0")}`,
                statusText: `Zóna se smršťuje (Vlna ${cycleIndex + 1}/5)`,
                state: "shrinking"
            };
        } else {
            // Pauza (10s)
            const radius = nextCycleMaxRadius;
            const rem = Math.ceil(40 - cycleProgress);
            return {
                center,
                radius,
                timerText: `0:${String(rem).padStart(2, "0")}`,
                statusText: `Zóna je stabilní (Vlna ${cycleIndex + 1}/5)`,
                state: "stable"
            };
        }
    } else {
        // Po skončení 5. vlny zóna zkolabuje úplně
        return {
            center,
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
        this.name  = name;
        this.color = color;
        this.x = Math.random() * (MAP_SIZE - 400) + 200;
        this.y = Math.random() * (MAP_SIZE - 400) + 200;
        this.radius = 28;
        this.speed  = 4.5;
        this.angle  = 0;
        this.hp     = 100;
        this.maxHp  = 100;
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
    }

    shoot() {
        if (this.hp <= 0) return;
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
        if (this.currentWeapon === 'fists') return;
        const weapon = WEAPONS[this.currentWeapon];
        if (this.ammo[this.currentWeapon] === weapon.ammoMax) return;
        const rTime = weapon.reloadTime || 1200;
        this.lastShotTime = Date.now() + rTime;
        setTimeout(() => {
            if (this.currentWeapon !== 'fists') {
                this.ammo[this.currentWeapon] = weapon.ammoMax;
                playSound('reload');
                updateUI();
            }
        }, rTime);
    }

    useHeal() {
        if (this.medkits <= 0 || this.hp >= this.maxHp || this.isHealRunning) return;
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
