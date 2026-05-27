---
phase: 1
plan: 1
wave: 1
depends_on: []
files_modified:
  - src/player.js
  - src/state.js
  - src/game.js
  - src/renderer.js
autonomous: true
must_haves:
  truths:
    - "Vite compilation succeeds without commonjs/require exceptions"
    - "Canvas drawing uses a neon double-stroke glow visual style for all players, obstacles, and bullets"
    - "Offscreen Canvas draws a neon textured grid pattern behind the viewport"
  artifacts:
    - "src/state.js possesses onBotHpUpdate callback property"
    - "src/renderer.js contains offscreen grid buffer rendering logic"
---

# Plan 1.1: Core Visual Overhaul & Vite ESM Compile Cleanup

## Objective
Establish a clean ES Modules compile footprint by resolving the circular dependency require crash inside player.js, and implement the foundations of our Neon rendering engine—including double-stroke neon strokes and a hardware-optimized offscreen canvas grid texture.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/ARCHITECTURE.md
- src/state.js
- src/player.js
- src/game.js
- src/renderer.js

## Tasks

<task type="auto">
  <name>Deconstruct Circular Import & Require Blockers</name>
  <files>
    src/state.js
    src/player.js
    src/game.js
  </files>
  <action>
    Decouple `player.js` from `game.js` to fix the CommonJS `require` exception under Vite ESM compiler.
    
    Steps:
    1. In `src/state.js`, add `onBotHpUpdate: null,` to the exported `state` singleton.
    2. In `src/game.js`, export the `updateBotHpInDB` function and import `state` from `./state.js`.
    3. During initialization in `src/game.js` (or inline), assign: `state.onBotHpUpdate = updateBotHpInDB;`
    4. In `src/player.js` (specifically inside the `shoot()` melee collision logic near line 526), remove the `const { updateBotHpInDB } = require('./game.js')` block.
    5. Replace it with:
       ```javascript
       if (state.onBotHpUpdate) {
           state.onBotHpUpdate(id, enemy.hp, this.id);
       }
       ```
    
    AVOID: Keeping any `require` statements or standard circular module imports in ES Modules.
    USE: Global State event listener / callback injection to communicate across decoupled systems.
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    Vite build completes successfully without bundle or module-loading runtime errors.
  </done>
</task>

<task type="auto">
  <name>Implement Neon Double-Stroke Engine & Offscreen Grid Buffer</name>
  <files>
    src/renderer.js
  </files>
  <action>
    Revamp the 2D canvas renderer to draw stunning, glowing neon figures and cached floor textures.
    
    Steps:
    1. Create a helper function `drawNeonCircle(ctx, x, y, r, color)` in `renderer.js` that draws a circle twice:
       - First, a thick semi-transparent glowing outline: `ctx.lineWidth = 8; ctx.strokeStyle = adjustAlpha(color, 0.35); ctx.stroke();`
       - Second, a thin sharp inner circle: `ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffffff'; ctx.stroke(); ctx.fillStyle = color; ctx.fill();`
    2. Create a helper function `drawNeonRect` / `drawNeonLine` using the same double-stroke technique.
    3. Create an offscreen grid canvas inside `renderer.js` once:
       - Render a 100x100 square with glowing, thin neon blue lines (`rgba(59, 130, 246, 0.2)`).
       - Cache this pattern using `ctx.createPattern(gridCanvas, 'repeat')`.
    4. Draw the repeating floor pattern across the viewport instead of blank plain fills.
    5. Update players, trees, stones, walls, and active bullets rendering calls to use the new Neon Drawing system.
    
    AVOID: Native `ctx.shadowBlur` filters inside high-frequency loops as they cause massive performance drops.
    USE: Dual overlapping strokes with varying widths and alpha transparencies for high-performance glow emulation.
  </action>
  <verify>
    Check visual representation using local dev preview or UAT check.
  </verify>
  <done>
    Neon grids and double-stroke elements display without artifacts at constant 60fps.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Vite compiles/builds successfully.
- [ ] Floor grid renders high-tech neon matrix pattern.
- [ ] Active entities (players, rocks, trees, bullets) exhibit glowing outline double-stroke styles.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] No regressions in local browser rendering
