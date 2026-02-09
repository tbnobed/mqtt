import type { Express } from "express";
import { type Server } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { setupMQTT, getMqttStatus } from "./mqtt";
import { db } from "./storage";
import { sql } from "drizzle-orm";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS boats (
      id VARCHAR(32) PRIMARY KEY,
      long_name TEXT NOT NULL DEFAULT 'Unknown',
      short_name TEXT NOT NULL DEFAULT '??',
      hw_model TEXT,
      last_seen TIMESTAMP
    )
  `);

  await db.execute(sql`
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
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bp_boat_id ON boat_positions(boat_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bp_timestamp ON boat_positions(boat_id, timestamp DESC)`);

  const io = new SocketServer(httpServer, {
    cors: { origin: "*" },
    transports: ["websocket", "polling"],
  });

  io.on("connection", async (socket) => {
    try {
      const allBoats = await storage.getAllBoatsWithPositions();
      socket.emit("boats:update", allBoats);
    } catch {}
    socket.emit("mqtt:status", { connected: getMqttStatus() });
  });

  setupMQTT(io);

  app.get("/api/boats", async (_req, res) => {
    try {
      const allBoats = await storage.getAllBoatsWithPositions();
      res.json(allBoats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/boats/:id", async (req, res) => {
    try {
      const track = await storage.getBoatTrack(req.params.id);
      if (!track) {
        return res.status(404).json({ error: "Boat not found" });
      }
      res.json(track);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/xpression", async (_req, res) => {
    try {
      const allBoats = await storage.getAllBoatsWithPositions();
      const result = {
        boats: allBoats
          .filter((b) => b.latitude !== undefined && b.longitude !== undefined)
          .map((b) => ({
            id: b.id,
            name: b.longName,
            lat: b.latitude,
            lon: b.longitude,
            altitude: b.altitude ?? 0,
            satellites: b.satellites ?? 0,
            timestamp: b.positionTimestamp
              ? new Date(b.positionTimestamp).toISOString()
              : null,
          })),
      };
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
