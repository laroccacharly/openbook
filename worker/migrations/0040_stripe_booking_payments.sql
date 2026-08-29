CREATE TABLE booking_payments (
  booking_id INTEGER PRIMARY KEY REFERENCES bookings(id),
  status TEXT NOT NULL CHECK (status IN ('paid', 'partially_refunded', 'refunded')),
  checkout_session_id TEXT NOT NULL UNIQUE,
  payment_intent_id TEXT NOT NULL UNIQUE,
  charged_amount INTEGER NOT NULL CHECK (charged_amount > 0),
  refunded_amount INTEGER NOT NULL DEFAULT 0 CHECK (
    refunded_amount >= 0 AND refunded_amount <= charged_amount
  ),
  currency TEXT NOT NULL CHECK (currency = 'cad'),
  payer_email TEXT,
  stripe_created_at INTEGER NOT NULL,
  paid_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE booking_checkout_sessions (
  booking_id INTEGER PRIMARY KEY REFERENCES bookings(id),
  session_id TEXT UNIQUE,
  session_url TEXT,
  expires_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('creating', 'open', 'expired', 'completed')),
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  claim_token TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE stripe_webhook_receipts (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX booking_payments_status_idx ON booking_payments (status);
