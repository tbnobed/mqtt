import { eq, desc, sql, and, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcrypt";
import { boats, boatPositions, users, type Boat, type InsertBoat, type BoatPosition, type InsertBoatPosition, type BoatWithPosition, type BoatTrack, type User, type SafeUser } from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);

export interface IStorage {
  upsertBoat(boat: InsertBoat): Promise<Boat>;
  getBoat(id: string): Promise<Boat | undefined>;
  getAllBoats(): Promise<Boat[]>;
  insertPosition(position: InsertBoatPosition): Promise<BoatPosition>;
  getLatestPosition(boatId: string): Promise<BoatPosition | undefined>;
  getTrackHistory(boatId: string, limit?: number): Promise<BoatPosition[]>;
  getAllBoatsWithPositions(): Promise<BoatWithPosition[]>;
  getBoatTrack(boatId: string): Promise<BoatTrack | null>;
  pruneOldPositions(boatId: string, keepCount?: number): Promise<void>;
  updateBoatLogo(boatId: string, logoUrl: string | null): Promise<void>;
  deleteBoat(id: string): Promise<void>;
  getPositionsByDate(date: string): Promise<{ boat: Boat; positions: BoatPosition[] }[]>;
  getAvailableDates(): Promise<string[]>;
  createUser(username: string, password: string, role: "admin" | "user"): Promise<SafeUser>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserById(id: number): Promise<SafeUser | undefined>;
  getAllUsers(): Promise<SafeUser[]>;
  deleteUser(id: number): Promise<void>;
  updateUserRole(id: number, role: "admin" | "user"): Promise<SafeUser | undefined>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  getUserCount(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async upsertBoat(boat: InsertBoat): Promise<Boat> {
    const updateSet: Record<string, any> = {
      longName: boat.longName,
      shortName: boat.shortName,
      hwModel: boat.hwModel,
      lastSeen: new Date(),
    };
    if (boat.pitch !== undefined) updateSet.pitch = boat.pitch;
    if (boat.roll !== undefined) updateSet.roll = boat.roll;
    if (boat.batteryLevel !== undefined) updateSet.batteryLevel = boat.batteryLevel;
    if (boat.batteryVoltage !== undefined) updateSet.batteryVoltage = boat.batteryVoltage;

    const [result] = await db
      .insert(boats)
      .values({ ...boat, lastSeen: new Date() })
      .onConflictDoUpdate({
        target: boats.id,
        set: updateSet,
      })
      .returning();
    return result;
  }

  async getBoat(id: string): Promise<Boat | undefined> {
    const [result] = await db.select().from(boats).where(eq(boats.id, id)).limit(1);
    return result;
  }

  async getAllBoats(): Promise<Boat[]> {
    return db.select().from(boats);
  }

  async insertPosition(position: InsertBoatPosition): Promise<BoatPosition> {
    const [result] = await db.insert(boatPositions).values(position).returning();
    await db
      .update(boats)
      .set({ lastSeen: new Date() })
      .where(eq(boats.id, position.boatId));
    return result;
  }

  async getLatestPosition(boatId: string): Promise<BoatPosition | undefined> {
    const [result] = await db
      .select()
      .from(boatPositions)
      .where(eq(boatPositions.boatId, boatId))
      .orderBy(desc(boatPositions.timestamp))
      .limit(1);
    return result;
  }

  async getTrackHistory(boatId: string, limit = 50): Promise<BoatPosition[]> {
    const results = await db
      .select()
      .from(boatPositions)
      .where(eq(boatPositions.boatId, boatId))
      .orderBy(desc(boatPositions.timestamp))
      .limit(limit);
    return results.reverse();
  }

  async getAllBoatsWithPositions(): Promise<BoatWithPosition[]> {
    const allBoats = await this.getAllBoats();
    const result: BoatWithPosition[] = [];

    for (const boat of allBoats) {
      const pos = await this.getLatestPosition(boat.id);
      result.push({
        ...boat,
        latitude: pos?.latitude,
        longitude: pos?.longitude,
        altitude: pos?.altitude ?? undefined,
        satellites: pos?.satellites ?? undefined,
        speed: pos?.speed ?? undefined,
        heading: pos?.heading ?? undefined,
        positionTimestamp: pos?.timestamp ?? null,
      });
    }

    return result;
  }

  async getBoatTrack(boatId: string): Promise<BoatTrack | null> {
    const boat = await this.getBoat(boatId);
    if (!boat) return null;

    const positions = await this.getTrackHistory(boatId, 50);
    const latestPos = positions[positions.length - 1];

    return {
      boat: {
        ...boat,
        latitude: latestPos?.latitude,
        longitude: latestPos?.longitude,
        altitude: latestPos?.altitude ?? undefined,
        satellites: latestPos?.satellites ?? undefined,
        speed: latestPos?.speed ?? undefined,
        heading: latestPos?.heading ?? undefined,
        positionTimestamp: latestPos?.timestamp ?? null,
      },
      positions,
    };
  }

  async pruneOldPositions(boatId: string, keepCount = 1000): Promise<void> {
    const count = await db
      .select({ count: sql<number>`count(*)` })
      .from(boatPositions)
      .where(eq(boatPositions.boatId, boatId));

    const total = Number(count[0]?.count || 0);
    if (total > keepCount) {
      const toDelete = total - keepCount;
      await db.execute(sql`
        DELETE FROM boat_positions
        WHERE id IN (
          SELECT id FROM boat_positions
          WHERE boat_id = ${boatId}
          ORDER BY timestamp ASC
          LIMIT ${toDelete}
        )
      `);
    }
  }
  async deleteBoat(id: string): Promise<void> {
    await db.delete(boatPositions).where(eq(boatPositions.boatId, id));
    await db.delete(boats).where(eq(boats.id, id));
  }

  async updateBoatLogo(boatId: string, logoUrl: string | null): Promise<void> {
    await db
      .update(boats)
      .set({ logoUrl })
      .where(eq(boats.id, boatId));
  }

  async getPositionsByDate(date: string): Promise<{ boat: Boat; positions: BoatPosition[] }[]> {
    const startOfDay = new Date(date + "T00:00:00.000Z");
    const endOfDay = new Date(date + "T23:59:59.999Z");

    const allBoats = await this.getAllBoats();
    const results: { boat: Boat; positions: BoatPosition[] }[] = [];

    for (const boat of allBoats) {
      const positions = await db
        .select()
        .from(boatPositions)
        .where(
          and(
            eq(boatPositions.boatId, boat.id),
            gte(boatPositions.timestamp, startOfDay),
            lt(boatPositions.timestamp, endOfDay)
          )
        )
        .orderBy(boatPositions.timestamp);

      if (positions.length > 0) {
        results.push({ boat, positions });
      }
    }

    return results;
  }

  async getAvailableDates(): Promise<string[]> {
    const rows = await db.execute(sql`
      SELECT DISTINCT DATE(timestamp) as day
      FROM boat_positions
      ORDER BY day DESC
      LIMIT 90
    `);
    return (rows.rows as any[]).map((r) => {
      const d = new Date(r.day);
      return d.toISOString().split("T")[0];
    });
  }
  async createUser(username: string, password: string, role: "admin" | "user"): Promise<SafeUser> {
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await db
      .insert(users)
      .values({ username, passwordHash, role })
      .returning();
    const { passwordHash: _, ...safe } = result;
    return safe;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result;
  }

  async getUserById(id: number): Promise<SafeUser | undefined> {
    const [result] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!result) return undefined;
    const { passwordHash: _, ...safe } = result;
    return safe;
  }

  async getAllUsers(): Promise<SafeUser[]> {
    const results = await db.select().from(users);
    return results.map(({ passwordHash: _, ...safe }) => safe);
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async updateUserRole(id: number, role: "admin" | "user"): Promise<SafeUser | undefined> {
    const [result] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, id))
      .returning();
    if (!result) return undefined;
    const { passwordHash: _, ...safe } = result;
    return safe;
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async getUserCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(users);
    return Number(result[0]?.count || 0);
  }
}

export const storage = new DatabaseStorage();
