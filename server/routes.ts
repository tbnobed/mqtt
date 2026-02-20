import type { Express } from "express";
import { type Server } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { setupMQTT, getMqttStatus } from "./mqtt";
import { db } from "./storage";
import { sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";

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
      logo_url TEXT,
      last_seen TIMESTAMP,
      pitch DOUBLE PRECISION,
      roll DOUBLE PRECISION,
      battery_level INTEGER,
      battery_voltage DOUBLE PRECISION
    )
  `);
  await db.execute(sql`ALTER TABLE boats ADD COLUMN IF NOT EXISTS logo_url TEXT`);
  await db.execute(sql`ALTER TABLE boats ADD COLUMN IF NOT EXISTS pitch DOUBLE PRECISION`);
  await db.execute(sql`ALTER TABLE boats ADD COLUMN IF NOT EXISTS roll DOUBLE PRECISION`);
  await db.execute(sql`ALTER TABLE boats ADD COLUMN IF NOT EXISTS battery_level INTEGER`);
  await db.execute(sql`ALTER TABLE boats ADD COLUMN IF NOT EXISTS battery_voltage DOUBLE PRECISION`);

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

  let lastOverlayState: any = null;

  io.on("connection", async (socket) => {
    try {
      const allBoats = await storage.getAllBoatsWithPositions();
      socket.emit("boats:update", allBoats);
    } catch {}
    socket.emit("mqtt:status", { connected: getMqttStatus() });

    socket.on("overlay:state", (state: any) => {
      lastOverlayState = state;
      socket.broadcast.emit("overlay:state", state);
    });

    socket.on("overlay:request", () => {
      if (lastOverlayState) {
        socket.emit("overlay:state", lastOverlayState);
      }
    });
  });

  setupMQTT(io);

  const uploadsDir = path.resolve("uploads", "logos");
  fs.mkdirSync(uploadsDir, { recursive: true });

  const logoUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || ".png";
        const name = `${Date.now()}${ext}`;
        cb(null, name);
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, allowed.includes(ext));
    },
  });

  app.use("/uploads", (await import("express")).default.static(path.resolve("uploads")));

  app.post("/api/boats/:id/logo", logoUpload.single("logo"), async (req, res) => {
    try {
      const boatId = req.params.id as string;
      const boat = await storage.getBoat(boatId);
      if (!boat) return res.status(404).json({ error: "Boat not found" });
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const logoUrl = `/uploads/logos/${req.file.filename}`;
      await storage.updateBoatLogo(boatId, logoUrl);

      const updated = await storage.getBoat(boatId);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/boats/:id/logo", async (req, res) => {
    try {
      const boatId = req.params.id as string;
      const boat = await storage.getBoat(boatId);
      if (!boat) return res.status(404).json({ error: "Boat not found" });

      if (boat.logoUrl) {
        const filePath = path.resolve("." + boat.logoUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }

      await storage.updateBoatLogo(boatId, null);
      const updated = await storage.getBoat(boatId);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

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

  app.get("/api/history/dates", async (_req, res) => {
    try {
      const dates = await storage.getAvailableDates();
      res.json(dates);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/history", async (req, res) => {
    try {
      const date = req.query.date as string;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });
      }
      const tracks = await storage.getPositionsByDate(date);
      res.json(tracks);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/xpression", async (_req, res) => {
    try {
      const allBoats = await storage.getAllBoatsWithPositions();
      const boatsObj: Record<string, any> = {};
      allBoats
        .filter((b) => b.latitude !== undefined && b.longitude !== undefined)
        .forEach((b) => {
          const boatName = b.longName || b.shortName || b.id;
          boatsObj[boatName] = {
            id: b.id,
            name: boatName,
            lat: b.latitude,
            lon: b.longitude,
            altitude: b.altitude ?? 0,
            satellites: b.satellites ?? 0,
            speed: b.speed ?? 0,
            heading: b.heading ?? 0,
            pitch: b.pitch ?? null,
            roll: b.roll ?? null,
            batteryLevel: b.batteryLevel ?? null,
            batteryVoltage: b.batteryVoltage ?? null,
            timestamp: b.positionTimestamp
              ? new Date(b.positionTimestamp).toISOString()
              : null,
          };
        });
      res.json({ Boats: boatsObj });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
