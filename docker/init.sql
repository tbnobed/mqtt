CREATE TABLE IF NOT EXISTS boats (
  id VARCHAR(32) PRIMARY KEY,
  long_name TEXT NOT NULL DEFAULT 'Unknown',
  short_name TEXT NOT NULL DEFAULT '??',
  hw_model TEXT,
  logo_url TEXT,
  last_seen TIMESTAMP
);

CREATE TABLE IF NOT EXISTS boat_positions (
  id SERIAL PRIMARY KEY,
  boat_id VARCHAR(32) NOT NULL REFERENCES boats(id),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude INTEGER DEFAULT 0,
  satellites INTEGER DEFAULT 0,
  speed DOUBLE PRECISION DEFAULT 0,
  heading DOUBLE PRECISION DEFAULT 0,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bp_boat_id ON boat_positions(boat_id);
CREATE INDEX IF NOT EXISTS idx_bp_timestamp ON boat_positions(boat_id, timestamp DESC);
