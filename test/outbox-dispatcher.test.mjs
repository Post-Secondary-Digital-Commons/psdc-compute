import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchOutboxOnce } from "../control-plane/outbox-dispatcher.mjs";

function event(id) {
  return {
    event_id: id, aggregate_id: `workload-${id}`, aggregate_sequence: 1,
    event_type: "workload.accepted.v1", payload: { workloadId: `workload-${id}` },
    claim_token: `claim-${id}`,
  };
}

test("publishes a stable event identity before acknowledging its claim", async () => {
  const calls = [];
  const store = {
    async claimEvents(options) { calls.push(["claim", options]); return [event("e1")]; },
    async acknowledgeEvent(...args) { calls.push(["ack", ...args]); return true; },
  };
  const result = await dispatchOutboxOnce(store, async (message) => {
    calls.push(["publish", message]);
  }, { limit: 1, claimSeconds: 5 });
  assert.deepEqual(result, { claimed: 1, acknowledged: 1, failed: [] });
  assert.deepEqual(calls.map(([action]) => action), ["claim", "publish", "ack"]);
  assert.deepEqual(calls[0][1], { limit: 1, claimSeconds: 5 });
  assert.deepEqual(calls[1][1], {
    eventId: "e1", aggregateId: "workload-e1", aggregateSequence: 1,
    eventType: "workload.accepted.v1", payload: { workloadId: "workload-e1" },
  });
  assert.deepEqual(calls[2], ["ack", "e1", "claim-e1"]);
});

test("a failed publication is not acknowledged and does not block the next event", async () => {
  const acknowledged = [];
  const store = {
    async claimEvents() { return [event("e1"), event("e2")]; },
    async acknowledgeEvent(id) { acknowledged.push(id); return true; },
  };
  const result = await dispatchOutboxOnce(store, async ({ eventId }) => {
    if (eventId === "e1") throw new Error("transport unavailable");
  });
  assert.deepEqual(acknowledged, ["e2"]);
  assert.equal(result.claimed, 2);
  assert.equal(result.acknowledged, 1);
  assert.deepEqual(result.failed.map(({ eventId, reason }) => [eventId, reason]),
    [["e1", "publish-failed"]]);
});

test("a lost claim after publication is reported as a possible duplicate", async () => {
  const published = [];
  const store = {
    async claimEvents() { return [event("e1")]; },
    async acknowledgeEvent() { return false; },
  };
  const result = await dispatchOutboxOnce(store, async ({ eventId }) => {
    published.push(eventId);
  });
  assert.deepEqual(published, ["e1"]);
  assert.equal(result.acknowledged, 0);
  assert.deepEqual(result.failed, [{ eventId: "e1", reason: "claim-lost-after-publish" }]);
});

test("an acknowledgement error is not misreported as a publication failure", async () => {
  const failure = new Error("database unavailable");
  const store = {
    async claimEvents() { return [event("e1")]; },
    async acknowledgeEvent() { throw failure; },
  };
  const result = await dispatchOutboxOnce(store, async () => {});
  assert.equal(result.acknowledged, 0);
  assert.deepEqual(result.failed, [{
    eventId: "e1", reason: "ack-failed-after-publish", error: failure,
  }]);
});

test("invalid delivery dependencies fail before claiming events", async () => {
  await assert.rejects(dispatchOutboxOnce({}, () => {}), TypeError);
  await assert.rejects(dispatchOutboxOnce({ claimEvents() {}, acknowledgeEvent() {} }, null), TypeError);
});
