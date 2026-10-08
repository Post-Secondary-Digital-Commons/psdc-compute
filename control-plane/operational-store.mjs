import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const migrationUrl = new URL("./migrations/001_operational_outbox.sql", import.meta.url);
const digestPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class IdempotencyConflict extends Error {
  constructor() {
    super("Idempotency key already belongs to a different manifest");
    this.name = "IdempotencyConflict";
  }
}

function boundedId(value, label) {
  if (typeof value !== "string" || !idPattern.test(value)) {
    throw new TypeError(`${label} must be a bounded identifier`);
  }
  return value;
}

export function createStore(connectionString) {
  if (!connectionString) throw new Error("A PostgreSQL connection string is required");
  const pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000 });

  return {
    async migrate() {
      const sql = await fs.readFile(fileURLToPath(migrationUrl), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(645901)");
        await client.query(sql);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async submitWorkload({ institutionId, idempotencyKey, manifestDigest, failAfterInsert = false }) {
      boundedId(institutionId, "institutionId");
      boundedId(idempotencyKey, "idempotencyKey");
      if (typeof manifestDigest !== "string" || !digestPattern.test(manifestDigest)) {
        throw new TypeError("manifestDigest must be a lowercase SHA-256 hex digest");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const workloadId = randomUUID();
        const inserted = await client.query(
          `INSERT INTO workload_requests
             (workload_id, institution_id, idempotency_key, manifest_digest, state)
           VALUES ($1, $2, $3, $4, 'accepted')
           ON CONFLICT (institution_id, idempotency_key) DO NOTHING
           RETURNING workload_id`,
          [workloadId, institutionId, idempotencyKey, manifestDigest]
        );
        if (inserted.rowCount === 0) {
          const existing = await client.query(
            `SELECT workload_id, manifest_digest FROM workload_requests
             WHERE institution_id = $1 AND idempotency_key = $2`,
            [institutionId, idempotencyKey]
          );
          if (existing.rows[0].manifest_digest !== manifestDigest) throw new IdempotencyConflict();
          await client.query("COMMIT");
          return { workloadId: existing.rows[0].workload_id, replayed: true };
        }
        await client.query(
          `INSERT INTO outbox_events
             (event_id, aggregate_type, aggregate_id, aggregate_sequence, event_type, payload)
           VALUES ($1, 'workload', $2, 1, 'workload.accepted.v1', $3::jsonb)`,
          [randomUUID(), workloadId, JSON.stringify({ workloadId, institutionId })]
        );
        if (failAfterInsert) throw new Error("Synthetic failure before commit");
        await client.query("COMMIT");
        return { workloadId, replayed: false };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async claimEvents({ limit = 10, claimSeconds = 30 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
          !Number.isSafeInteger(claimSeconds) || claimSeconds < 1 || claimSeconds > 300) {
        throw new RangeError("Outbox claim bounds exceeded");
      }
      const claimToken = randomUUID();
      const result = await pool.query(
        `WITH ready AS (
           SELECT event_id FROM outbox_events
           WHERE delivered_at IS NULL AND (claimed_until IS NULL OR claimed_until <= now())
           ORDER BY created_at, event_id
           LIMIT $1 FOR UPDATE SKIP LOCKED
         )
         UPDATE outbox_events AS o
         SET claim_token = $2, claimed_until = now() + ($3 * interval '1 second')
         FROM ready WHERE o.event_id = ready.event_id
         RETURNING o.event_id, o.aggregate_id, o.event_type, o.payload,
                   o.aggregate_sequence, o.claim_token`,
        [limit, claimToken, claimSeconds]
      );
      return result.rows;
    },

    async acknowledgeEvent(eventId, claimToken) {
      boundedId(eventId, "eventId");
      boundedId(claimToken, "claimToken");
      const result = await pool.query(
        `UPDATE outbox_events SET delivered_at = now(), claim_token = NULL, claimed_until = NULL
         WHERE event_id = $1 AND claim_token = $2 AND claimed_until > now()
           AND delivered_at IS NULL RETURNING event_id`,
        [eventId, claimToken]
      );
      return result.rowCount === 1;
    },

    async counts() {
      const result = await pool.query(
        `SELECT (SELECT count(*)::integer FROM workload_requests) AS workloads,
                (SELECT count(*)::integer FROM outbox_events) AS events,
                (SELECT count(*)::integer FROM outbox_events WHERE delivered_at IS NOT NULL) AS delivered`
      );
      return result.rows[0];
    },

    async close() { await pool.end(); }
  };
}
