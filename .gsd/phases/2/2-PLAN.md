---
phase: 2
plan: 2
wave: 2
depends_on:
  - 1-PLAN.md
files_modified:
  - src/state.js
  - src/game.js
  - src/renderer.js
  - src/player.js
  - src/controls.js
  - src/ui.js
autonomous: true
must_haves:
  truths:
    - "Grenades are pickable as loot, throwable by pressing Key 'G', bounce off walls/obstacles, and detonate after 2.5s"
    - "Grenade explosions deal area splash damage, spawn blast particles, and trigger heavy screenshakes"
    - "Methamphetamine stimulants can be consumed to provide speed/sight boosts, followed by a severe visual blur, speed drop, and health decay crash"
  artifacts:
    - "src/state.js contains definitions for localGrenades list"
---

# Plan 2.2: Throwable Grenades & High-Risk Consumable Stimulant

## Objective
Introduce high-yield throwable Grenades (rebounding physics, timed 2.5s fuses, area-of-effect splash damage, smoke/blast particles, and heavy screenshakes) and the High-Risk Stimulant (Methamphetamine/Hyper-Stim) that boosts speed and camera vision before crashing the player with blur filters, health decay, and heavy speed penalties.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/state.js
- src/game.js
- src/renderer.js
- src/player.js
- src/controls.js
- src/ui.js

## Tasks

<task type="auto">
  <name>Build Bouncing Throwable Grenades System</name>
  <files>
    src/state.js
    src/game.js
    src/renderer.js
    src/controls.js
    src/player.js
    src/ui.js
  </files>
  <action>
    Implement interactive throw actions, rebounding boundary calculations, timed fuses, splash damages, and particle detonations.
    
    Steps:
    1. In `src/state.js`, add `localGrenades: [],` and add `grenades: 0` to standard player inventory stats (`player.js`).
    2. Bind key 'G' inside `src/controls.js` desktop inputs (or a dedicated mobile HUD toggle button) to spawn a new grenade in `state.localGrenades`:
       - `{ id, x, y, vx, vy, timer: 2500, spawnTime: Date.now(), radius: 8 }`
       - The launch direction is derived from the player's aim angle; speed is set to a standard throw impulse.
    3. Add `grenade` items to ground loot spawn pools (`src/player.js`) so players can scavenge them.
    4. In `src/game.js` inside `updateGame()`, tick and move active grenades:
       - Update position: `g.x += g.vx; g.y += g.vy;`
       - Decelerate movement using friction: `g.vx *= 0.96; g.vy *= 0.96;`
       - Bounce off obstacles (stone, trees, crates) or outer map walls: invert respective velocity indices on impact and apply restitution (`g.vx = -g.vx * 0.6`).
    5. Trigger Detonation after 2.5 seconds:
       - Spawn a burst of 15 hot yellow/orange explosion particles: `state.spawnParticles(g.x, g.y, 15, 'spark', '#f97316', { speed: 6.5, decay: 0.04 });`
       - Spawn 10 grey ambient smoke particles.
       - Trigger a massive screen shake: `triggerScreenShake(8.5);`
       - Calculate radial splash damage: iterate over all bots, other players, and local player. If distance is less than 150px, deduct HP proportionally (e.g., 80 damage at center, scaling down to 10 at 150px boundaries).
       - Remove grenade from the active list.
    6. In `src/renderer.js`, render active bouncing grenades as a small blinking neon green orb with a circular dotted fuse countdown ring.
    
    AVOID: Infinite map clipping. Ensure boundary constraints restrict grenades inside MAP_SIZE coordinates.
    USE: Simple vector collision math for circular obstacles boundaries.
  </action>
  <verify>
    Pickup a grenade, press 'G' to throw, and watch the bounce and detonation behavior.
  </verify>
  <done>
    Grenades bounce realistically off boundaries, detonate after 2.5s, deal proper radial damage, and spawn satisfying particles.
  </done>
</task>

<task type="auto">
  <name>Implement Potent Consumable Stimulant & Crash Logic</name>
  <files>
    src/state.js
    src/game.js
    src/player.js
    src/renderer.js
    src/ui.js
    src/controls.js
  </files>
  <action>
    Create the Methamphetamine (Hyper-Stim) booster item featuring intense speed/vision buffs and a severe visual blur, speed drop, and health crash.
    
    Steps:
    1. Add `meth` to standard ground loot item listings (`src/player.js`). Add `meth: 0` to player inventory counts.
    2. Add dynamic states in the `Player` class constructor: `stimActive: false, stimCrashActive: false, stimEndTime: 0, stimCrashEndTime: 0`.
    3. Bind key 'H' (or clickable inventory icon) to consume `meth`:
       - If player has a `meth` stimulant, deduct it, play a booster sound, and activate stimulation.
       - Set `p.stimActive = true; p.stimEndTime = Date.now() + 8000;`
       - Set speed multiplier to `1.5` (+50% base speed increase).
       - Zoom out the camera viewport scale further (e.g., multiply `state.viewportScale` by `0.78` for heightened sight).
    4. Inside `src/game.js` update loops:
       - During the **8-second Stimmed Phase**: spawn small glowing cyan trail sparks behind the player.
       - At **8 seconds (Stim End)**: trigger the **Stim Crash Phase**:
         - Set `p.stimActive = false; p.stimCrashActive = true; p.stimCrashEndTime = Date.now() + 6000;`
         - Apply visual stimulant crash: in `src/renderer.js` draw loop, apply a heavy visual blur filter to the canvas context: `ctx.filter = 'blur(2.0px) saturate(2.5) contrast(1.2)';`
         - Slow down player movement: reduce speed to `35%` of base speed.
         - Inflict health decay: subtract `2 HP` every `500ms` during the crash.
       - At **14 seconds (Crash End)**: reset speed back to normal, clear context filters (`ctx.filter = 'none'`), and clear crash states.
    5. Draw a glowing neon blue outline ring around stimulated players, and a vibrating visual overlay when they are suffering a crash.
    
    AVOID: Persistent canvas filters. Ensure `ctx.filter` is cleared back to `'none'` once the crash expires, or if the screen/lobby resets.
    USE: Canvas 2D CSS-style dynamic context filters inside active crash updates.
  </action>
  <verify>
    Consume a meth booster, check speed/vision boosts, and ensure side-effects crash triggers correctly.
  </verify>
  <done>
    Speed and view expand dramatically during stimulation, followed by visual blurring, speed penalties, and health decay during the crash.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Grenades bounce off obstacle circles and explode after 2.5 seconds.
- [ ] Splash damage is calculated correctly on all nearby targets.
- [ ] Consumption triggers immediate speed/view scale buffs.
- [ ] Visual blur filters and speed/health decay crash trigger exactly after 8 seconds and expire after 6 seconds.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Canvas filters reset correctly under all conditions
