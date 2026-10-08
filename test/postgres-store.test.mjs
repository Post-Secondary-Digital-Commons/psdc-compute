import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { createStore, IdempotencyConflict } from "../control-plane/operational-store.mjs";

const connectionString = process.env.PSDC_TEST_DATABASE_URL;

test("H-004 synthetic PostgreSQL transaction and outbox", { skip: !connectionString }, async () => {
  const store = createStore(connectionString);
  const institutionId = `test-${randomUUID()}`;
  const digest = "a".repeat(64);
  const initial = await store.counts().catch(() => null);
  try {
    await store.migrate();
    const baseline = initial ?? await store.counts();
    const key = `request-${randomUUID()}`;
    const first = await store.submitWorkload({ institutionId, idempotencyKey: key, manifestDigest: digest });
    const replay = await store.submitWorkload({ institutionId, idempotencyKey: key, manifestDigest: digest });
    assert.equal(replay.workloadId, first.workloadId);
    assert.equal(replay.replayed, true);
    await assert.rejects(
      store.submitWorkload({ institutionId, idempotencyKey: key, manifestDigest: "b".repeat(64) }),
      IdempotencyConflict
    );
    const afterReplay = await store.counts();
    assert.equal(afterReplay.workloads, baseline.workloads + 1);
    assert.equal(afterReplay.events, baseline.events + 1);

    await assert.rejects(
      store.submitWorkload({ institutionId, idempotencyKey: `fail-${randomUUID()}`,
        manifestDigest: digest, failAfterInsert: true }),
      /Synthetic failure/
    );
    const afterRollback = await store.counts();
    assert.deepEqual(afterRollback, afterReplay);

    const raceKey = `race-${randomUUID()}`;
    const race = await Promise.all(Array.from({ length: 12 }, () =>
      store.submitWorkload({ institutionId, idempotencyKey: raceKey, manifestDigest: digest })));
    assert.equal(new Set(race.map((item) => item.workloadId)).size, 1);
    assert.equal(race.filter((item) => !item.replayed).length, 1);
    const afterRace = await store.counts();
    assert.equal(afterRace.workloads, baseline.workloads + 2);
    assert.equal(afterRace.events, baseline.events + 2);

    const claims = await store.claimEvents({ limit: 100 });
    const event = claims.find((item) => item.aggregate_id === first.workloadId);
    assert.ok(event);
    assert.equal(event.payload.institutionId, institutionId);
    assert.equal(await store.acknowledgeEvent(event.event_id, randomUUID()), false);
    assert.equal(await store.acknowledgeEvent(event.event_id, event.claim_token), true);
    assert.equal(await store.acknowledgeEvent(event.event_id, event.claim_token), false);

    const expiring = await store.submitWorkload({ institutionId,
      idempotencyKey: `expire-${randomUUID()}`, manifestDigest: digest });
    const shortClaim = (await store.claimEvents({ limit: 100, claimSeconds: 1 }))
      .find((item) => item.aggregate_id === expiring.workloadId);
    assert.ok(shortClaim);
    await setTimeout(1200);
    const recoveryStore = createStore(connectionString);
    try {
      const reclaimed = (await recoveryStore.claimEvents({ limit: 100, claimSeconds: 5 }))
        .find((item) => item.aggregate_id === expiring.workloadId);
      assert.ok(reclaimed);
      assert.notEqual(reclaimed.claim_token, shortClaim.claim_token);
      assert.equal(await store.acknowledgeEvent(shortClaim.event_id, shortClaim.claim_token), false);
      assert.equal(await recoveryStore.acknowledgeEvent(reclaimed.event_id, reclaimed.claim_token), true);
    } finally {
      await recoveryStore.close();
    }
  } finally {
    await store.close();
  }
});
