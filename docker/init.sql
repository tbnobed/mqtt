DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'user'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS boats (
  id VARCHAR(32) PRIMARY KEY,
  long_name TEXT NOT NULL DEFAULT 'Unknown',
  short_name TEXT NOT NULL DEFAULT '??',
  hw_model TEXT,
  logo_url TEXT,
  last_seen TIMESTAMP,
  pitch DOUBLE PRECISION,
  roll DOUBLE PRECISION,
  battery_level INTEGER,
  battery_voltage DOUBLE PRECISION
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

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default",
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
