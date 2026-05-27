# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision
Transform the 2D top-down surviv.io-style game into a visually stunning, action-packed neon shooter. Introduce tactile long-range shootouts via telescope scopes and laser sights, high-risk booster items (methamphetamine with speed/vision buffs and severe post-use crash side effects), advanced AI bots that loot, dodge, hide, and utilize class spells, and drivable vehicles to traverse the arena, all enveloped in high-fidelity glowing neon graphics, particle effects, and screen shake.

## Goals
1. **Visual Overhaul (Neon Aesthetic & Particles):** Transition the renderer to a glowing neon theme with detailed/textured floor grids and objects. Add muzzle flashes, animated bullet trails, blood splatters on hits, screen shakes on heavy impacts, and destructible debris.
2. **Tactical Combat Arsenal:**
   - **Weapons:** Add M4A1 (high accuracy, medium fire rate), AK47 (high damage, high recoil/spread), and throwable Grenades (timed explosion with area-of-effect damage, debris particles, and screen shake).
   - **Scopes & Lenses:** Implement scope items (3x, 4x, 8x) that adjust the camera zoom scale dynamically. The 3x scope includes a continuous red laser aiming line.
   - **Hyper-Stimulant (Methamphetamine):** A highly potent consumable. Grants +50% speed and 1.5x zoom-out vision for 8 seconds, followed by a 6-second "crash" (motion blur, speed reduced to 30%, and slow health decay).
3. **Drivable Vehicles:** Add interactive vehicles spawned across the map. Players can enter/exit, steer, accelerate, and run over obstacles/enemies for high crushing damage.
4. **Elite Bot AI:** Upgrade AI bots to actively loot, seek cover, dodge incoming shots, use medkits when low on health, and fully interact with RPG class-based systems (level up, cast spells, hunt slimes, and shop items).

## Non-Goals (Out of Scope)
- Persistent database schema expansions (e.g., custom user accounts, server-side auth validation).
- Dedicated lobby sound/music packs replacements.
- Multi-vehicle type stats tuning (keep to a single robust "car/buggy" vehicle class).

## Users
Players of standard Survival or RPG-MOBA modes seeking an immersive, high-speed tactical experience with advanced AI and satisfying mechanical and visual feedback.

## Constraints
- **Vite/ES Modules:** Keep all files compliant with Vite build structure (fixing the `require` technical debt in `player.js`).
- **Canvas Rendering Performance:** Maintain 60fps performance on mobile/desktop by managing particle pools efficiently.
- **Appwrite Bandwidth:** Sync vehicle states and custom scopes within existing 120ms tick budgets.

## Success Criteria
- [ ] Neon glowing visual theme applied to all rendering layers.
- [ ] M4A1, AK47, and Grenades fully functional with realistic spread/explosion behaviors.
- [ ] 3x (with laser), 4x, and 8x scopes smoothly adjust player viewports.
- [ ] Methamphetamine item provides immediate buffs followed by visual/movement penalties.
- [ ] Drivable vehicles can be occupied, steered, and deal collision damage to players/bots.
- [ ] AI bots demonstrate cover-seeking, smart looting, and RPG mode competency.
- [ ] The Vite build succeeds without module-loading runtime errors.
