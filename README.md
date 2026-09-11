# fpsdc-compute

Parallel research and engineering workspace for the Commons Compute Fabric
(Commons Compute Fabric). Its first milestone is hardware census and telemetry, not distributed
inference.

## Initial vertical slice

1. `commons-worker` registers an authorized machine.
2. The worker reports CPU, RAM, GPU, VRAM, operating system, network, and idle
   state.
3. The control API stores and serves the inventory.
4. The dashboard presents current and aggregate capacity.
5. Benchmarks validate reporting overhead and hardware capability.

This repository remains independent of `fpsdc-ai` until the main platform's
Phase 9 readiness point. The repositories do not merge; they integrate through
versioned contracts. Do not make the AI gateway depend on Commons Compute Fabric during the early
research phases.

Within the full Federated Post-Secondary Digital Commons, Commons Compute Fabric is a general compute substrate for
Commons AI Fabric, Commons Media and Spatial Fabric, Commons Social Fabric background work, and Commons Cloud Fabric platform jobs.
Callers submit capability-based jobs; they do not select worker machines directly.

## Ecosystem dependencies

Commons Compute Fabric depends on Commons Cloud Fabric for normalized workload identity, policy, event transport,
secrets, and observability. Commons AI Fabric, Media Fabric, Fediverse, and Cloud submit jobs
through the shared compute contract; none may address workers or rely on Commons Compute Fabric's
private database. Commons Compute Fabric runtime adapters remain replaceable and self-hosted.
Federated capacity is accepted only from explicitly trusted post-secondary peers
inside a workload envelope. No capacity or savings claim is valid before the
hardware census and non-disruptive pilot.

- [Consolidated ecosystem architecture](../fpsdc-architecture/docs/architecture/Consolidated-Ecosystem-Architecture.md)
- [Dependency contract](../fpsdc-architecture/docs/architecture/Ecosystem-Dependency-Contract.md)
- [Cross-pollination model](../fpsdc-architecture/docs/architecture/Cross-Pollination-and-Shared-Capabilities.md)
- [Open-source reference stack](../fpsdc-architecture/docs/vision/12-Open-Source-Reference-Stack.md)
- [Commons architecture](../fpsdc-architecture/docs/vision/constitutional/Post-Secondary-Digital-Commons-Architecture.md)

## Repository map

| Path | Responsibility |
|---|---|
| `worker/commons-worker/` | Cross-platform inventory and telemetry agent |
| `control-plane/api/` | Registration, inventory, health, and query API |
| `dashboard/` | Operator-facing capacity view |
| `benchmarks/` | Repeatable hardware and overhead measurements |
| `docs/` | Architecture, security boundaries, and research notes |
| `infrastructure/docker/` | Local development environment |
| `infrastructure/opentofu/` | OpenTofu modules and institution deployment composition |
