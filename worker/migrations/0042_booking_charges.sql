ALTER TABLE bookings ADD COLUMN final_price INTEGER;
ALTER TABLE bookings ADD COLUMN balance_due_enabled_at INTEGER;

CREATE TABLE booking_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'balance')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  collectible INTEGER NOT NULL CHECK (collectible IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX booking_charges_booking_id_idx ON booking_charges (booking_id);

DROP TABLE booking_payments;

CREATE TABLE booking_payments (
  charge_id INTEGER PRIMARY KEY REFERENCES booking_charges(id),
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
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

CREATE INDEX booking_payments_booking_id_idx ON booking_payments (booking_id);
CREATE INDEX booking_payments_status_idx ON booking_payments (status);

DROP TABLE booking_checkout_sessions;

CREATE TABLE booking_checkout_sessions (
  charge_id INTEGER PRIMARY KEY REFERENCES booking_charges(id),
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  session_id TEXT UNIQUE,
  session_url TEXT,
  expires_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('creating', 'open', 'expired', 'completed')),
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  claim_token TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX booking_checkout_sessions_booking_id_idx
  ON booking_checkout_sessions (booking_id);
