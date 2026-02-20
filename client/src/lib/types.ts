export interface BoatData {
  id: string;
  longName: string;
  shortName: string;
  hwModel: string | null;
  logoUrl?: string | null;
  lastSeen: string | null;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  satellites?: number;
  speed?: number;
  heading?: number;
  positionTimestamp?: string;
  pitch?: number | null;
  roll?: number | null;
  batteryLevel?: number | null;
  batteryVoltage?: number | null;
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

const boatColors = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
  "#e11d48", "#84cc16",
];

export function getBoatColor(index: number): string {
  return boatColors[index % boatColors.length];
}

export function isOffline(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return true;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff > 5 * 60 * 1000;
}

export function getTimeSince(timestamp: string | null | undefined): string {
  if (!timestamp) return "never";
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function formatCoord(val: number | undefined): string {
  if (val === undefined) return "—";
  return val.toFixed(6);
}

export function formatSpeed(knots: number | null | undefined): string {
  if (knots === undefined || knots === null) return "0.0 kts";
  return `${knots.toFixed(1)} kts`;
}

export interface OverlayState {
  mode: "live" | "history";
  center: [number, number];
  zoom: number;
  selectedBoatId: string | null;
  historyDate?: string;
  hiddenBoatIds?: string[];
}
