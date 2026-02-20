import { sql } from "drizzle-orm";
import { pgTable, text, varchar, doublePrecision, integer, timestamp, serial, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, passwordHash: true }).extend({
  password: z.string().min(4),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type SafeUser = Omit<User, "passwordHash">;

export const boats = pgTable("boats", {
  id: varchar("id", { length: 32 }).primaryKey(),
  longName: text("long_name").notNull().default("Unknown"),
  shortName: text("short_name").notNull().default("??"),
  hwModel: text("hw_model"),
  logoUrl: text("logo_url"),
  lastSeen: timestamp("last_seen"),
  pitch: doublePrecision("pitch"),
  roll: doublePrecision("roll"),
  batteryLevel: integer("battery_level"),
  batteryVoltage: doublePrecision("battery_voltage"),
});

export const boatPositions = pgTable("boat_positions", {
  id: serial("id").primaryKey(),
  boatId: varchar("boat_id", { length: 32 }).notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  altitude: integer("altitude").default(0),
  satellites: integer("satellites").default(0),
  speed: doublePrecision("speed").default(0),
  heading: doublePrecision("heading").default(0),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertBoatSchema = createInsertSchema(boats).omit({ lastSeen: true });
export const insertBoatPositionSchema = createInsertSchema(boatPositions).omit({ id: true });

export type InsertBoat = z.infer<typeof insertBoatSchema>;
export type Boat = typeof boats.$inferSelect;
export type InsertBoatPosition = z.infer<typeof insertBoatPositionSchema>;
export type BoatPosition = typeof boatPositions.$inferSelect;

export interface BoatWithPosition extends Boat {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  satellites?: number;
  speed?: number;
  heading?: number;
  positionTimestamp?: Date | null;
}

export interface BoatTrack {
  boat: BoatWithPosition;
  positions: BoatPosition[];
}
