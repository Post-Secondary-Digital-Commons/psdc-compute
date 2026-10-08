-- Development-only H-004 subset. No student or institution data in this profile.
CREATE TABLE IF NOT EXISTS workload_requests (
  workload_id text PRIMARY KEY,
  institution_id text NOT NULL,
  idempotency_key text NOT NULL,
  manifest_digest text NOT NULL CHECK (manifest_digest ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  event_id text PRIMARY KEY,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  aggregate_sequence bigint NOT NULL CHECK (aggregate_sequence > 0),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claim_token text,
  claimed_until timestamptz,
  delivered_at timestamptz,
  UNIQUE (aggregate_type, aggregate_id, aggregate_sequence),
  CHECK ((claim_token IS NULL) = (claimed_until IS NULL))
);

CREATE INDEX IF NOT EXISTS outbox_pending_idx
  ON outbox_events (created_at, event_id) WHERE delivered_at IS NULL;
