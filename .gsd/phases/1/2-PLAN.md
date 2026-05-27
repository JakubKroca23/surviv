---
phase: 1
plan: 2
wave: 2
depends_on:
  - 1-PLAN.md
files_modified:
  - src/state.js
  - src/game.js
  - src/renderer.js
  - src/player.js
autonomous: true
must_haves:
  truths:
    - "Shooting a weapon spawns neon spark muzzle flash particles"
    - "Active bullets leave thin, glowing particle trails behind them"
    - "Damaging a player or bot leaves persistent blood decals on the floor"
    - "Damaging crates or trees spawns debris splinter particles"
    - "Heavy impacts (such as player hits or shooting heavy guns) trigger noticeable screen shake"
  artifacts:
    - "src/state.js contains definitions for particles pool and screenshake attributes"
---

# Plan 1.2: Dynamic Particle Effects & Screen Shake System

## Objective
Establish a rich, tactile feedback loop by implementing a high-performance particle system (neon muzzle flashes, glowing bullet trails, wooden debris, and persistent blood splatters) combined with camera viewport shake modifiers.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/ARCHITECTURE.md
- src/state.js
- src/game.js
- src/renderer.js
- src/player.js

## Tasks

<task type="auto">
  <name>Build High-Performance Visual Particle Engine</name>
  <files>
    src/state.js
    src/game.js
    src/renderer.js
    src/player.js
  </files>
  <action>
    Create a centralized particle system to render satisfying combat decals and debris.
    
    Steps:
    1. In `src/state.js`, add `particles: [],` to the state object.
    2. Create a helper function `spawnParticles(x, y, count, type, color, customConfig)` inside `game.js` (or a dedicated utilities section) to push new particle descriptors into `state.particles`.
    3. Types of particles to configure:
       - **Spark:** Fast velocity, rapid size decay, neon yellow/cyan colors. Hook into `shoot()` in `player.js` for muzzle flashes, and into bullet impact points in `game.js`.
       - **Bullet Trail:** Fades out within 150ms. Bullet trajectories should spawn thin lines or tiny dots behind them.
       - **Blood Splatter:** Red/crimson circles that decelerate quickly and remain as static ground decals for 5 seconds before fading out completely. Hook into bullet-player collision logic in `game.js`.
       - **Debris Splinters:** Brown/grey wooden shards that spin and bounce outward. Hook into crate/foliage damage logic in `game.js`.
    4. In `src/game.js` inside `updateGame()`, iterate and update active particles (velocity drift, size decay, lifetime reduction). Remove dead particles.
    5. In `src/renderer.js` inside `drawGame()`, draw particles on top of the ground layers but below player and foliage models.
    
    AVOID: Pushing too many particles without a ceiling caps. Keep a maximum threshold (e.g. 300 active particles) to prevent memory allocation spikes.
    USE: Object pools or simple array truncation to maintain a clean limit.
  </action>
  <verify>
    Observe weapon firing in dev interface.
  </verify>
  <done>
    Fired weapons spawn muzzle sparkles, bullets draw trail paths, and damaging obstacles creates splinters.
  </done>
</task>

<task type="auto">
  <name>Implement Viewport Camera Screen Shake System</name>
  <files>
    src/state.js
    src/game.js
    src/renderer.js
  </files>
  <action>
    Create a screen shake camera matrix modifier triggered during violent gameplay events.
    
    Steps:
    1. In `src/state.js`, add a configuration block:
       ```javascript
       screenShake: { x: 0, y: 0, intensity: 0, decay: 0.88 },
       ```
    2. Create `triggerScreenShake(intensity)` in `src/game.js` that assigns/increases `state.screenShake.intensity`.
    3. Call `triggerScreenShake` during:
       - Firing high-caliber weapons (e.g., Shotguns or Snipers in standard mode).
       - When a player gets damaged.
    4. In `src/game.js` inside `updateGame()`, decay the shake intensity:
       ```javascript
       if (state.screenShake.intensity > 0.2) {
           state.screenShake.x = (Math.random() - 0.5) * state.screenShake.intensity;
           state.screenShake.y = (Math.random() - 0.5) * state.screenShake.intensity;
           state.screenShake.intensity *= state.screenShake.decay;
       } else {
           state.screenShake.x = 0;
           state.screenShake.y = 0;
           state.screenShake.intensity = 0;
       }
       ```
    5. In `src/renderer.js` inside `drawGame()`, wrap the core map rendering calls in `ctx.save()` and `ctx.translate(state.screenShake.x, state.screenShake.y)` translation matrix shifts, then `ctx.restore()`. Ensure the HUD stays static and unaffected by the shake.
    
    AVOID: Shaking the HUD, mini-maps, or overlay menus, as it causes player disorientation.
    USE: Matrix displacement on the main viewport drawing commands only.
  </action>
  <verify>
    Fire heavy weapons or absorb bullet hits and check camera shake.
  </verify>
  <done>
    Main canvas shifts dynamically upon impact events, while interface overlays remain anchored.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Muzzle flashes and sparks emit on firing and hitting objects.
- [ ] Blood splatters accumulate on the arena surface.
- [ ] Screen shakes dynamically during shot actions or damage receipts.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] High performance 60fps preserved
