---
phase: 2
plan: 1
wave: 1
depends_on: []
files_modified:
  - src/constants.js
  - src/player.js
  - src/renderer.js
  - src/state.js
  - src/ui.js
autonomous: true
must_haves:
  truths:
    - "M4A1 and AK47 weapons are spawnable as loot, pickable, and fire with realistic damage/cooldown profiles"
    - "Picking up 3x, 4x, or 8x Scopes scales the viewport zoom factor dynamically"
    - "Equipping a 3x scope projects a continuous red neon laser line forward in the player's shooting trajectory"
  artifacts:
    - "src/constants.js contains definitions for M4A1 and AK47"
    - "src/state.js tracks viewport scale factors and laser sights configurations"
---

# Plan 2.1: Assault Rifles (AK47 & M4A1) & Dynamic Lenses (Scopes & Laser Aim)

## Objective
Implement our long-range tactical gunplay arsenal by adding the AK47 (heavy damage, high recoil/spread) and M4A1 (highly accurate, steady firing). Support interactive Telescope Scopes (3x with laser sights, 4x, 8x) that dynamically zoom the canvas viewport scale to enable precise long-distance engagements.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/constants.js
- src/player.js
- src/renderer.js
- src/state.js

## Tasks

<task type="auto">
  <name>Implement M4A1 and AK47 Weapon Parameters & Visuals</name>
  <files>
    src/constants.js
    src/player.js
    src/renderer.js
    src/ui.js
  </files>
  <action>
    Add M4A1 and AK47 options to the weapons list, loot tables, player shooting profiles, and renderers.
    
    Steps:
    1. In `src/constants.js`, append `m4a1` and `ak47` configurations to the `WEAPONS` object:
       - **M4A1:** `{ damage: 18, cooldown: 110, spread: 0.05, speed: 17, range: 680, ammoMax: 30, count: 1, reloadTime: 1400 }`
       - **AK47:** `{ damage: 24, cooldown: 140, spread: 0.12, speed: 15, range: 640, ammoMax: 30, count: 1, reloadTime: 1600 }`
    2. Add `m4a1` and `ak47` to player ammo trackers and weapon inventory properties in the `Player` constructor (`src/player.js`).
    3. Update `generateSpawnedLoot` and obstacles-breaking loot drops (`src/player.js`) to support random M4A1 and AK47 item generation.
    4. In `src/renderer.js` inside `drawLoot()`, add realistic vector outlines for M4A1 (neon cyan frame) and AK47 (neon orange frame with curved magazine).
    5. In `src/renderer.js` inside `drawCharacter()` under standard shooter gun overrides, add detailed M4A1 and AK47 double-barreled overlay sketches.
    
    AVOID: Breaking existing weapon selectors or ammo HUD slots. Ensure new weapons populate cleanly.
    USE: Consistent naming conventions ('m4a1', 'ak47') mapped uniformly across arrays.
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    AK47 and M4A1 are pickable from ground loot, hold ammunition correctly, reload, and render custom weapon silhouettes.
  </done>
</task>

<task type="auto">
  <name>Implement Viewport Zoom Scopes & Laser Aiming sights</name>
  <files>
    src/state.js
    src/player.js
    src/renderer.js
    src/ui.js
  </files>
  <action>
    Build camera viewport scaling modifiers triggered by picking up 3x, 4x, or 8x Scopes, and draw active red laser sights.
    
    Steps:
    1. In `src/state.js`, add `viewportScale: 1.0, currentScope: '1x',` to the global state.
    2. Add three scope types to ground loot tables: `scope_3x`, `scope_4x`, `scope_8x` inside `src/player.js`.
    3. When player walks over a scope item in `src/game.js` loot collision:
       - Set `state.currentScope` to the scope item type (e.g. '3x').
       - Scale `state.viewportScale` to: `1x = 1.0`, `3x = 0.75` (zoomed out), `4x = 0.6` (zoomed out further), `8x = 0.4` (maximum zoomed out view).
       - Play pickup sound and update HUD.
    4. In `src/renderer.js` inside `drawGame()`, modify camera scaling:
       - Right after clearing canvas and saving context (lines 45-50), apply context scale adjustment:
         ```javascript
         const scale = state.viewportScale || 1.0;
         ctx.save();
         // Translate to center, scale, translate back
         ctx.translate(cw / 2, ch / 2);
         ctx.scale(scale, scale);
         ctx.translate(-p.x, -p.y);
         ```
       - Ensure `drawZoneHUD` and `drawMinimap` remain outside this scaled viewport context so their screen coordinates are untouched.
    5. Draw continuous glowing red laser sight in `renderer.js` under character weapon draws:
       - If `state.currentScope === '3x'`, draw a highly transparent neon red line (`rgba(239, 68, 68, 0.45)`) starting from the player's weapon tip extending `700px` in the direction of their aim angle.
    
    AVOID: Off-center camera scaling. The viewport must scale outward from the center of the client's screen.
    USE: Multi-layered scaling translations inside the Canvas context rendering save blocks.
  </action>
  <verify>
    Pickup scope_3x or scope_4x and observe viewport zooming.
  </verify>
  <done>
    Telescopes successfully modify viewport scaling smoothly, and equipping the 3x scope projects a bright aiming laser.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] AK47 and M4A1 are fully pickable and fire with correct recoil/damage characteristics.
- [ ] Scopes scale the camera outwards uniformly from the screen center.
- [ ] 3x scopes project the continuous red neon aiming laser.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Render loop framerates remain at constant 60fps
