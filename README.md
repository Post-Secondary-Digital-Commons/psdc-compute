# psdc-compute

## Local VS-01 operational-store experiment

`control-plane/operational-store.mjs` implements a **development-only subset**
of H-004 against PostgreSQL: an idempotent synthetic workload record and its
outbox event commit in one transaction, plus bounded claim/ack operations.
`control-plane/outbox-dispatcher.mjs` adds a transport-neutral, one-pass
delivery attempt. It publishes a stable event ID before acknowledging the
claim. A failed publication is left for retry; a publication followed by a
lost claim is reported as a possible duplicate. Consumers must deduplicate
that event ID to achieve exactly-once **effects**; this prototype does not
provide such a consumer or claim exactly-once delivery.
The proposed [upstream-adoption record](docs/research/adoption-records/vs01-operational-store.json)
captures why this prototype uses PostgreSQL and `pg`, the local evidence, and
the decisions still required before that choice is accepted for deployment.
The PostgreSQL test covers duplicate and concurrent requests, a digest
conflict, forced rollback, claim-token fencing after expiry, and a failed
publication followed by a successful retry. Run it with
`PSDC_TEST_DATABASE_URL` pointing to a disposable PostgreSQL database, then
`npm ci --ignore-scripts` and `npm run test:postgres`. Without that variable,
Node marks the integration test skipped; a green default `npm test` is **not**
PostgreSQL evidence.

This is not a workload API, provider registry, scheduler, worker, meter,
settlement service, released contract implementation, or campus deployment.
It uses synthetic identifiers and an existing PostgreSQL image for local
testing. Do not connect real institutional data. H-004 remains below D2 until
the accepted contract bundle, review, migration/rollback and licensing gates
are complete. The repository's existing Apache-2.0 license is not a decision
to publish future network services under Apache: ADR-0030's target AGPL
boundary requires its legal/copyright gate before a public service release.

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

This repository remains independent of `psdc-ai` until the main platform's
Phase 9 readiness point. The repositories do not merge; they integrate through
versioned contracts. Do not make the AI gateway depend on Commons Compute Fabric during the early
research phases.

Within the full Post-Secondary Digital Commons, Commons Compute Fabric is a general compute substrate for
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

- [Consolidated ecosystem architecture](../psdc-architecture/docs/architecture/Consolidated-Ecosystem-Architecture.md)
- [Dependency contract](../psdc-architecture/docs/architecture/Ecosystem-Dependency-Contract.md)
- [Cross-pollination model](../psdc-architecture/docs/architecture/Cross-Pollination-and-Shared-Capabilities.md)
- [Open-source reference stack](../psdc-architecture/docs/vision/12-Open-Source-Reference-Stack.md)
- [Commons architecture](../psdc-architecture/docs/vision/constitutional/Post-Secondary-Digital-Commons-Architecture.md)

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
