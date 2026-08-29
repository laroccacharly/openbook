CREATE TABLE configuration (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enable_google_calendar INTEGER NOT NULL DEFAULT 0
    CHECK (enable_google_calendar IN (0, 1))
);

INSERT INTO configuration (id) VALUES (1);
