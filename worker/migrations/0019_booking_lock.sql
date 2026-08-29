-- A single application-wide lease serializes scheduler validation and booking
-- writes. The fencing token prevents an expired owner from acting on a lease
-- after another caller has acquired it.

CREATE TABLE booking_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner TEXT,
  expires_at_ms INTEGER NOT NULL DEFAULT 0,
  fencing_token INTEGER NOT NULL DEFAULT 0
);

INSERT INTO booking_lock (id) VALUES (1);
