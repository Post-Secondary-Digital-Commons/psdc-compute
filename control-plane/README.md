# Control Plane

The root `operational-store.mjs` and `migrations/` are a local H-004
PostgreSQL/outbox experiment. They are not a public API or production-ready
service. Callers must not access this private database directly; a versioned
service boundary will own it after H-004/H-006 contracts are accepted.

- `api/` — worker and client API
- `scheduler/` — capability, policy, locality, and queue-aware placement
- `registry/` — machine identity, inventory, capabilities, and health
- `telemetry/` — normalized metrics and events
