/**
 * One bounded outbox delivery pass. The transport is injected so this module
 * does not claim that NATS or any other broker is already deployed.
 */
export async function dispatchOutboxOnce(store, publish, { limit = 10, claimSeconds = 30 } = {}) {
  if (typeof store?.claimEvents !== "function" ||
      typeof store?.acknowledgeEvent !== "function" ||
      typeof publish !== "function") {
    throw new TypeError("store claim/ack methods and a publish function are required");
  }

  const events = await store.claimEvents({ limit, claimSeconds });
  const result = { claimed: events.length, acknowledged: 0, failed: [] };
  for (const event of events) {
    try {
      await publish({
        eventId: event.event_id,
        aggregateId: event.aggregate_id,
        aggregateSequence: event.aggregate_sequence,
        eventType: event.event_type,
        payload: event.payload,
      });
    } catch (error) {
      // Do not acknowledge a failed publication. The claim will expire and
      // permit a later pass to retry, possibly with a new claim token.
      result.failed.push({ eventId: event.event_id, reason: "publish-failed", error });
      continue;
    }
    try {
      const acknowledged = await store.acknowledgeEvent(event.event_id, event.claim_token);
      if (acknowledged) {
        result.acknowledged += 1;
      } else {
        // Publication succeeded. The consumer must deduplicate by eventId
        // when this event is claimed again after expiry.
        result.failed.push({ eventId: event.event_id, reason: "claim-lost-after-publish" });
      }
    } catch (error) {
      result.failed.push({ eventId: event.event_id, reason: "ack-failed-after-publish", error });
    }
  }
  return result;
}
