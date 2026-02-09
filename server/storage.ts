import { eq, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { boats, boatPositions, type Boat, type InsertBoat, type BoatPosition, type InsertBoatPosition, type BoatWithPosition, type BoatTrack } from "@shared/schema";

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
}

export class DatabaseStorage implements IStorage {
  async upsertBoat(boat: InsertBoat): Promise<Boat> {
    const [result] = await db
      .insert(boats)
      .values({ ...boat, lastSeen: new Date() })
      .onConflictDoUpdate({
        target: boats.id,
        set: {
          longName: boat.longName,
          shortName: boat.shortName,
          hwModel: boat.hwModel,
          lastSeen: new Date(),
        },
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
}

export const storage = new DatabaseStorage();
