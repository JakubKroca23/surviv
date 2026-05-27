const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Generátor Bílého Šumu pro realistické exploze, syčení a nárazy
let noiseBuffer = null;

function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    const bufferSize = audioCtx.sampleRate * 2; // 2 sekundy
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    noiseBuffer = buffer;
    return noiseBuffer;
}

// Cesty k reálným high-fidelity zvukovým souborům z balíčku
const sounds = {
    pickup: '/RPG Sound Pack/inventory/coin3.wav',
    heal:   '/RPG Sound Pack/inventory/bubble.wav',
    punch:  '/RPG Sound Pack/battle/swing2.wav',
    hit:    '/RPG Sound Pack/NPC/slime/slime1.wav',
    death:  '/RPG Sound Pack/NPC/ogre/ogre2.wav'
};

const soundBuffers = {};

async function loadSound(name, url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        audioCtx.decodeAudioData(arrayBuffer, (audioBuffer) => {
            soundBuffers[name] = audioBuffer;
            console.log(`🔊 Zvuk "${name}" úspěšně načten z ${url}`);
        }, (err) => {
            console.error(`❌ Chyba při dekódování zvuku "${name}":`, err);
        });
    } catch (err) {
        console.error(`❌ Chyba při stahování zvuku "${name}":`, err);
    }
}

export function initAudio() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    // Načíst všechny reálné zvuky na pozadí
    for (const name in sounds) {
        if (!soundBuffers[name]) {
            loadSound(name, sounds[name]);
        }
    }
}

// Pomocná funkce pro syntézu výstřelu zbraně s realistickým šumem a frekvenčním průběhem
function playSynthesizedShot({
    t,
    oscType = 'sawtooth',
    startFreq = 300,
    endFreq = 80,
    duration = 0.15,
    noiseVolume = 0.4,
    oscVolume = 0.3,
    lowpassFreq = 1000,
    bandpassFreq = 1500,
    tinnitusFreq = 0
}) {
    const gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
    
    // 1. Zvukový oscilátor pro "tělo" a ránu výstřelu
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    const lowpass = audioCtx.createBiquadFilter();
    
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(lowpassFreq, t);
    
    osc.type = oscType;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    
    oscGain.gain.setValueAtTime(oscVolume, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    
    osc.connect(lowpass);
    lowpass.connect(oscGain);
    oscGain.connect(gainNode);
    
    // 2. Šumový generátor pro realistickou akustickou explozi a expanzi plynů
    const noise = audioCtx.createBufferSource();
    noise.buffer = getNoiseBuffer();
    
    const noiseGain = audioCtx.createGain();
    const bandpass = audioCtx.createBiquadFilter();
    
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(bandpassFreq, t);
    bandpass.Q.setValueAtTime(3.0, t);
    
    noiseGain.gain.setValueAtTime(noiseVolume, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.95);
    
    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(gainNode);
    
    // Spuštění zdrojů
    osc.start(t);
    osc.stop(t + duration);
    noise.start(t);
    noise.stop(t + duration);
    
    // 3. Volitelný metalický dozvuk / tinitus pro těžké zbraně (odstřelovačka)
    if (tinnitusFreq > 0) {
        const ringOsc = audioCtx.createOscillator();
        const ringGain = audioCtx.createGain();
        
        ringOsc.type = 'sine';
        ringOsc.frequency.setValueAtTime(tinnitusFreq, t);
        
        ringGain.gain.setValueAtTime(0.08, t);
        ringGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        
        ringOsc.connect(ringGain);
        ringGain.connect(audioCtx.destination);
        
        ringOsc.start(t);
        ringOsc.stop(t + 0.9);
    }
}

export function playSound(type) {
    if (audioCtx.state !== 'running') return;

    const t = audioCtx.currentTime;

    // Pokud máme předem nahraný high-fidelity zvuk úspěšně dekódovaný, přehrajeme ho
    if (soundBuffers[type]) {
        const source = audioCtx.createBufferSource();
        source.buffer = soundBuffers[type];
        source.connect(audioCtx.destination);
        source.start(t);
        return;
    }

    switch (type) {
        case 'shoot_pistol':
            // Rychlý, ostřejší zvuk pistole
            playSynthesizedShot({
                t,
                oscType: 'triangle',
                startFreq: 450,
                endFreq: 120,
                duration: 0.12,
                noiseVolume: 0.35,
                oscVolume: 0.2,
                lowpassFreq: 1200,
                bandpassFreq: 2000
            });
            break;
            
        case 'shoot_shotgun':
            // Mohutný basový výbuch brokovnice s drsným metalickým dozvukem
            playSynthesizedShot({
                t,
                oscType: 'sawtooth',
                startFreq: 160,
                endFreq: 30,
                duration: 0.28,
                noiseVolume: 0.65,
                oscVolume: 0.45,
                lowpassFreq: 400,
                bandpassFreq: 800
            });
            
            // Kovový mechanismus přebití (pump-action) o kousek později
            setTimeout(() => {
                if (audioCtx.state === 'running') {
                    const t2 = audioCtx.currentTime;
                    const oscClick = audioCtx.createOscillator();
                    const clickGain = audioCtx.createGain();
                    oscClick.type = 'triangle';
                    oscClick.frequency.setValueAtTime(1800, t2);
                    clickGain.gain.setValueAtTime(0.04, t2);
                    clickGain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.04);
                    oscClick.connect(clickGain);
                    clickGain.connect(audioCtx.destination);
                    oscClick.start(t2);
                    oscClick.stop(t2 + 0.04);
                    
                    setTimeout(() => {
                        const t3 = audioCtx.currentTime;
                        const oscClick2 = audioCtx.createOscillator();
                        const clickGain2 = audioCtx.createGain();
                        oscClick2.type = 'triangle';
                        oscClick2.frequency.setValueAtTime(1200, t3);
                        clickGain2.gain.setValueAtTime(0.03, t3);
                        clickGain2.gain.exponentialRampToValueAtTime(0.001, t3 + 0.05);
                        oscClick2.connect(clickGain2);
                        clickGain2.connect(audioCtx.destination);
                        oscClick2.start(t3);
                        oscClick2.stop(t3 + 0.05);
                    }, 120);
                }
            }, 300);
            break;
            
        case 'shoot_smg':
            // Rychlý, méně basový, ale velmi hlasitý prskavý zvuk ze samopalu
            playSynthesizedShot({
                t,
                oscType: 'square',
                startFreq: 580,
                endFreq: 220,
                duration: 0.08,
                noiseVolume: 0.28,
                oscVolume: 0.15,
                lowpassFreq: 2000,
                bandpassFreq: 2500
            });
            break;
            
        case 'shoot_rifle':
            // Plný, dunivý a velmi uspokojivý zvuk útočné pušky
            playSynthesizedShot({
                t,
                oscType: 'sawtooth',
                startFreq: 280,
                endFreq: 70,
                duration: 0.18,
                noiseVolume: 0.48,
                oscVolume: 0.32,
                lowpassFreq: 800,
                bandpassFreq: 1200
            });
            break;
            
        case 'shoot_sniper':
            // Obrovský otřes odstřelovačky s metalickým tinitusem
            playSynthesizedShot({
                t,
                oscType: 'sawtooth',
                startFreq: 140,
                endFreq: 25,
                duration: 0.45,
                noiseVolume: 0.85,
                oscVolume: 0.6,
                lowpassFreq: 300,
                bandpassFreq: 600,
                tinnitusFreq: 4000
            });
            break;
            
        case 'punch':
            // Syntetická záloha pro úder
            playSynthesizedShot({
                t,
                oscType: 'sine',
                startFreq: 120,
                endFreq: 40,
                duration: 0.09,
                noiseVolume: 0.18,
                oscVolume: 0.45,
                lowpassFreq: 200,
                bandpassFreq: 300
            });
            break;
            
        case 'hit':
            // Syntetická záloha pro zásah
            {
                const hGain = audioCtx.createGain();
                hGain.connect(audioCtx.destination);
                const oscH = audioCtx.createOscillator();
                const oGain = audioCtx.createGain();
                oscH.type = 'sine';
                oscH.frequency.setValueAtTime(90, t);
                oscH.frequency.exponentialRampToValueAtTime(30, t + 0.1);
                oGain.gain.setValueAtTime(0.45, t);
                oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                oscH.connect(oGain);
                oGain.connect(hGain);
                
                const noiseH = audioCtx.createBufferSource();
                noiseH.buffer = getNoiseBuffer();
                const nGain = audioCtx.createGain();
                const bp = audioCtx.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.setValueAtTime(350, t);
                nGain.gain.setValueAtTime(0.3, t);
                nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                noiseH.connect(bp);
                bp.connect(nGain);
                nGain.connect(hGain);
                
                oscH.start(t);
                oscH.stop(t + 0.1);
                noiseH.start(t);
                noiseH.stop(t + 0.1);
            }
            break;
            
        case 'pickup':
            // Retro syntetická záloha pro sebrání
            {
                const osc1 = audioCtx.createOscillator();
                const osc2 = audioCtx.createOscillator();
                const pGain = audioCtx.createGain();
                pGain.connect(audioCtx.destination);
                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(523.25, t);
                osc1.frequency.setValueAtTime(659.25, t + 0.05);
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(783.99, t + 0.05);
                osc2.frequency.setValueAtTime(1046.50, t + 0.1);
                pGain.gain.setValueAtTime(0.08, t);
                pGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
                osc1.connect(pGain);
                osc2.connect(pGain);
                osc1.start(t);
                osc1.stop(t + 0.22);
                osc2.start(t + 0.05);
                osc2.stop(t + 0.22);
            }
            break;
            
        case 'reload':
            // Kovový zvuk přebíjení
            {
                const oscR1 = audioCtx.createOscillator();
                const gR1 = audioCtx.createGain();
                oscR1.type = 'triangle';
                oscR1.frequency.setValueAtTime(1200, t);
                oscR1.frequency.exponentialRampToValueAtTime(600, t + 0.07);
                gR1.gain.setValueAtTime(0.06, t);
                gR1.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
                oscR1.connect(gR1);
                gR1.connect(audioCtx.destination);
                oscR1.start(t);
                oscR1.stop(t + 0.07);
                
                setTimeout(() => {
                    if (audioCtx.state === 'running') {
                        const t2 = audioCtx.currentTime;
                        const oscR2 = audioCtx.createOscillator();
                        const gR2 = audioCtx.createGain();
                        oscR2.type = 'triangle';
                        oscR2.frequency.setValueAtTime(900, t2);
                        oscR2.frequency.exponentialRampToValueAtTime(1600, t2 + 0.08);
                        gR2.gain.setValueAtTime(0.05, t2);
                        gR2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.08);
                        oscR2.connect(gR2);
                        gR2.connect(audioCtx.destination);
                        oscR2.start(t2);
                        oscR2.stop(t2 + 0.08);
                    }
                }, 180);
            }
            break;
            
        case 'death':
            // Syntetická záloha pro smrt
            {
                const dGain = audioCtx.createGain();
                dGain.connect(audioCtx.destination);
                const oscD = audioCtx.createOscillator();
                const dLow = audioCtx.createBiquadFilter();
                dLow.type = 'lowpass';
                dLow.frequency.setValueAtTime(150, t);
                oscD.type = 'sawtooth';
                oscD.frequency.setValueAtTime(180, t);
                oscD.frequency.exponentialRampToValueAtTime(10, t + 1.2);
                dGain.gain.setValueAtTime(0.45, t);
                dGain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
                oscD.connect(dLow);
                dLow.connect(dGain);
                oscD.start(t);
                oscD.stop(t + 1.2);
            }
            break;
            
        case 'heal':
            // Syntetická záloha pro léčení
            {
                const hGain = audioCtx.createGain();
                hGain.connect(audioCtx.destination);
                const numWaves = 4;
                for (let i = 0; i < numWaves; i++) {
                    const osc = audioCtx.createOscillator();
                    const oG = audioCtx.createGain();
                    osc.type = 'sine';
                    const startF = 300 + i * 150;
                    const endF = 600 + i * 200;
                    osc.frequency.setValueAtTime(startF, t + i * 0.1);
                    osc.frequency.exponentialRampToValueAtTime(endF, t + 0.4 + i * 0.1);
                    oG.gain.setValueAtTime(0, t);
                    oG.gain.linearRampToValueAtTime(0.08, t + 0.2 + i * 0.1);
                    oG.gain.exponentialRampToValueAtTime(0.001, t + 0.4 + i * 0.1);
                    osc.connect(oG);
                    oG.connect(hGain);
                    osc.start(t + i * 0.1);
                    osc.stop(t + 0.4 + i * 0.1);
                }
            }
            break;
    }
}
