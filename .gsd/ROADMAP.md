# ROADMAP.md

> **Current Phase**: Phase 2: Tactical Combat Arsenal
> **Milestone**: v1.0

## Must-Haves (from SPEC)
- [x] Neon glowing graphics engine overhaul with grid textures and dynamic particles.
- [ ] AK47, M4A1, and explosive Grenades.
- [ ] Interactive Scope items (3x, 4x, 8x) and laser sights.
- [ ] Consumable stimulant (Methamphetamine) with high-risk side effects.
- [ ] Drivable vehicles with collision run-over mechanics.
- [ ] Advanced, cover-seeking, looting, and RPG-capable AI bots.

---

## Phases

### Phase 1: Foundation & Neon Visual Engine
**Status**: ✅ Complete
**Objective**: Fix ES module loading bugs and rewrite the Canvas 2D renderer to apply glowing neon styles, floor grids, custom particles (muzzle flashes, blood trails, debris), and screen shake.
**Requirements**: REQ-01, REQ-02, REQ-09

### Phase 2: Tactical Combat Arsenal
**Status**: ⬜ Not Started
**Objective**: Build AK47, M4A1, and bouncing explosive Grenades. Implement camera-scaling Scope attachments (3x, 4x, 8x), visible laser sights, and the hyper-stimulant item with custom buffs and post-stim crashes.
**Requirements**: REQ-03, REQ-04, REQ-05, REQ-06

### Phase 3: Interactive Drivable Vehicles
**Status**: ⬜ Not Started
**Objective**: Implement vehicles that spawn in the arena. Support boarding/unboarding, custom visual sprites, acceleration/braking/steering mechanics, and crushing collision damage against obstacles, players, and bots.
**Requirements**: REQ-07

### Phase 4: Elite AI Bot Upgrade
**Status**: ⬜ Not Started
**Objective**: Upgrade bots with intelligent navigational pathing. They must actively seek weapons/ammo, take cover behind stones/trees, use medkits when low on health, and dynamically utilize RPG mode features.
**Requirements**: REQ-08

### Phase 5: Multiplayer Synchronization & Final Polish
**Status**: ⬜ Not Started
**Objective**: Connect new scopes, items, stimulant animations, and vehicle positions to Appwrite databases and WebSockets. Conduct integration testing and performance audits.
**Requirements**: All
