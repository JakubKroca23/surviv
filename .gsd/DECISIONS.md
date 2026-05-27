# Architectural Decision Record (ADR) Log

This log tracks architectural decisions made during the project.

| ID | Decision | Status | Date | Rationale |
|----|----------|--------|------|-----------|
| **ADR-01** | Core visual transition to simple neon styles | Accepted | 2026-05-27 | High visual contrast, premium modern aesthetic, low performance overhead on 2D Canvas. |
| **ADR-02** | Camera viewport zoom manipulation via viewport scale factor | Accepted | 2026-05-27 | Simple execution inside Canvas render context (`ctx.scale`), avoiding complicated spatial math revisions. |
