import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { setupMQTT, getMqttStatus } from "./mqtt";
import { db } from "./storage";
import { sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";

declare module "express-session" {
  interface SessionData {
    userId: number;
    userRole: "admin" | "user";
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (req.session.userRole !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await db.execute(sql`DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'user'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);

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

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role user_role NOT NULL DEFAULT 'user',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  const userCount = await storage.getUserCount();
  if (userCount === 0) {
    await storage.createUser("admin", "admin", "admin");
    console.log("Created default admin user (username: admin, password: admin)");
  }

  const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const PgStore = connectPgSimple(session);

  app.use(
    session({
      store: new PgStore({ pool: pgPool, createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET || "boat-tracker-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

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

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      const valid = await storage.verifyPassword(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      req.session.userId = user.id;
      req.session.userRole = user.role;

      const { passwordHash: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "User not found" });
    }
    res.json(user);
  });

  app.get("/api/auth/users", requireAdmin, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/users", requireAdmin, async (req, res) => {
    try {
      const { username, password, role } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }
      if (role && !["admin", "user"].includes(role)) {
        return res.status(400).json({ error: "Role must be admin or user" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ error: "Username already exists" });
      }

      const user = await storage.createUser(username, password, role || "user");
      res.json(user);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/auth/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (id === req.session.userId) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      await storage.deleteUser(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/auth/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { role } = req.body;
      if (!["admin", "user"].includes(role)) {
        return res.status(400).json({ error: "Role must be admin or user" });
      }
      if (id === req.session.userId) {
        return res.status(400).json({ error: "Cannot change your own role" });
      }
      const updated = await storage.updateUserRole(id, role);
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

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

  app.post("/api/boats/:id/logo", requireAuth, logoUpload.single("logo"), async (req, res) => {
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

  app.delete("/api/boats/:id/logo", requireAdmin, async (req, res) => {
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

  app.delete("/api/boats/:id", requireAdmin, async (req, res) => {
    try {
      const boatId = req.params.id as string;
      const boat = await storage.getBoat(boatId);
      if (!boat) return res.status(404).json({ error: "Boat not found" });

      if (boat.logoUrl) {
        const filePath = path.resolve("." + boat.logoUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }

      await storage.deleteBoat(boatId);
      io.emit("boats:update", await storage.getAllBoatsWithPositions());
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/boats", requireAuth, async (_req, res) => {
    try {
      const allBoats = await storage.getAllBoatsWithPositions();
      res.json(allBoats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/boats/:id", requireAuth, async (req, res) => {
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

  app.get("/api/history/dates", requireAuth, async (_req, res) => {
    try {
      const dates = await storage.getAvailableDates();
      res.json(dates);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/history", requireAuth, async (req, res) => {
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
