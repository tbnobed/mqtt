export interface BoatData {
  id: string;
  longName: string;
  shortName: string;
  hwModel: string | null;
  lastSeen: string | null;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  satellites?: number;
  speed?: number;
  heading?: number;
  positionTimestamp?: string | null;
}

export interface BoatPositionData {
  id: number;
  boatId: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  satellites: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: string;
}

export interface BoatTrackData {
  boat: BoatData;
  positions: BoatPositionData[];
}

export const BOAT_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
];

export function getBoatColor(index: number): string {
  return BOAT_COLORS[index % BOAT_COLORS.length];
}

export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function getTimeSince(ts: string | null | undefined): string {
  if (!ts) return "N/A";
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ${diffMin % 60}m ago`;
}

export function isOffline(ts: string | null | undefined): boolean {
  if (!ts) return true;
  const now = Date.now();
  const then = new Date(ts).getTime();
  return now - then > 5 * 60 * 1000;
}

export function formatCoord(val: number | undefined, type: "lat" | "lon"): string {
  if (val === undefined) return "N/A";
  const dir = type === "lat" ? (val >= 0 ? "N" : "S") : val >= 0 ? "E" : "W";
  return `${Math.abs(val).toFixed(6)}° ${dir}`;
}

export function formatSpeed(knots: number | undefined | null): string {
  if (knots === undefined || knots === null) return "0.0 kts";
  return `${knots.toFixed(1)} kts`;
}
