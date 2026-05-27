// =============================================
// KONFIGURACE & KONSTANTY
// =============================================

export const APPWRITE_ENDPOINT   = 'https://appwrite.propoj.app/v1';
export const APPWRITE_PROJECT_ID = 'surviv';
export const DATABASE_ID         = 'surviv';
export const COLLECTION_ID       = 'players';
export const ROOMS_COLLECTION_ID = 'rooms';
export const MESSAGES_COLLECTION_ID = 'messages';

export const MAP_SIZE = 4000;

export const WEAPONS = {
    fists:  { name: 'Pěsti',             damage: 15, cooldown: 350,  speed: 12, spread: 0,    count: 1, range: 60,   icon: 'fa-solid fa-hand-fist' },
    pistol: { name: 'Pistole M9',         damage: 22, cooldown: 250,  speed: 20, spread: 0.05, count: 1, range: 600,  icon: 'fa-solid fa-gun',           ammoMax: 15, reloadTime: 1200 },
    shotgun:{ name: 'MP-220 Brokovnice',  damage: 13, cooldown: 150,  speed: 17, spread: 0.35, count: 6, range: 350,  icon: 'fa-solid fa-shield-halved', ammoMax: 2,  reloadTime: 1800 },
    smg:    { name: 'Samopal Vector',      damage: 14, cooldown: 80,   speed: 22, spread: 0.12, count: 1, range: 500,  icon: 'fa-solid fa-fire',          ammoMax: 33, reloadTime: 1400 },
    rifle:  { name: 'Puška AK-47',         damage: 30, cooldown: 150,  speed: 25, spread: 0.08, count: 1, range: 800,  icon: 'fa-solid fa-person-rifle',  ammoMax: 30, reloadTime: 1500 },
    sniper: { name: 'Odstřelovačka AWM',  damage: 70, cooldown: 1500, speed: 32, spread: 0.01, count: 1, range: 1200, icon: 'fa-solid fa-crosshairs',    ammoMax: 5,  reloadTime: 2200 },
    m4a1:   { name: 'Neon M4A1',          damage: 18, cooldown: 110,  speed: 25, spread: 0.04, count: 1, range: 680,  icon: 'fa-solid fa-person-rifle',  ammoMax: 30, reloadTime: 1400 },
    ak47:   { name: 'Neon AK-47',          damage: 24, cooldown: 140,  speed: 23, spread: 0.09, count: 1, range: 640,  icon: 'fa-solid fa-person-rifle',  ammoMax: 30, reloadTime: 1600 },
};
