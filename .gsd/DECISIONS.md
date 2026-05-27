# Architectural Decision Record (ADR) Log

This log tracks architectural decisions made during the project.

| ID | Decision | Status | Date | Rationale |
|----|----------|--------|------|-----------|
| **ADR-01** | Core visual transition to simple neon styles | Accepted | 2026-05-27 | High visual contrast, premium modern aesthetic, low performance overhead on 2D Canvas. |
| **ADR-02** | Camera viewport zoom manipulation via viewport scale factor | Accepted | 2026-05-27 | Simple execution inside Canvas render context (`ctx.scale`), avoiding complicated spatial math revisions. |

## Phase 1 Decisions

**Date:** 2026-05-27

### Scope
- Clean up circular dependency and ESM import patterns by moving Appwrite bot synchronization out of `player.js` to ensure Vite dev/build compliance.

### Approach
- **Visuals:** Selected **Option B (Double-Stroke Neon Emulation)** to draw neon elements twice (thick semi-transparent background stroke + thin bright inner stroke). This provides a premium glow effect with maximum frame performance.
- **Grid Texture:** Selected **Option B (Offscreen Grid Buffer)** to pre-render the neon grid floor once and draw it as a repeating pattern across the client viewport.

### Constraints
- Retain high-performance 60fps across mobile and desktop.
- Screen shake intensity to be controlled by a dynamic scale multiplier in the global state.

