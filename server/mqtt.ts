import mqtt from "mqtt";
import { storage } from "./storage";
import { log } from "./index";
import type { Server as SocketServer } from "socket.io";

const BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://98.191.147.191:1883";
const MQTT_USERNAME = process.env.MQTT_USERNAME || "boat_tracker";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "tbn123";
const MQTT_TOPICS = (process.env.MQTT_TOPIC || "msh/US/#,msh/2/#").split(",").map(t => t.trim());

interface PositionPayload {
  latitude_i: number;
  longitude_i: number;
  altitude?: number;
  sats_in_view?: number;
  time?: number;
  ground_speed?: number;
  ground_track?: number;
  precision_bits?: number;
  PDOP?: number;
}

interface NodeInfoPayload {
  longName: string;
  shortName: string;
  hwModel?: string;
}

interface MQTTMessage {
  type: string;
  sender: string;
  payload: PositionPayload | NodeInfoPayload;
}

let mqttClient: mqtt.MqttClient | null = null;
let ioInstance: SocketServer | null = null;
let isMqttConnected = false;
let lastPositions: Map<string, { lat: number; lng: number; time: number }> = new Map();

export function getMqttStatus(): boolean {
  return isMqttConnected;
}

function calculateSpeed(
  lat1: number, lon1: number, time1: number,
  lat2: number, lon2: number, time2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  const timeDiff = Math.abs(time2 - time1);
  if (timeDiff === 0) return 0;
  const mps = distance / timeDiff;
  return mps * 1.94384;
}

function calculateHeading(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

function isValidPositionPayload(payload: any): payload is PositionPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof payload.latitude_i === "number" &&
    typeof payload.longitude_i === "number"
  );
}

function isValidNodeInfoPayload(payload: any): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  return (
    typeof payload.longName === "string" ||
    typeof payload.long_name === "string" ||
    typeof payload.longname === "string" ||
    typeof payload.shortName === "string" ||
    typeof payload.short_name === "string" ||
    typeof payload.shortname === "string"
  );
}

function normalizeNodeInfoPayload(payload: any): NodeInfoPayload {
  return {
    longName: payload.longName || payload.long_name || payload.longname || "",
    shortName: payload.shortName || payload.short_name || payload.shortname || "",
    hwModel: payload.hwModel || payload.hw_model || payload.hardware?.toString() || undefined,
  };
}

async function handlePositionMessage(sender: string, payload: PositionPayload) {
  log(`Raw payload from ${sender}: lat_i=${payload.latitude_i} lon_i=${payload.longitude_i} alt=${payload.altitude} sats=${payload.sats_in_view} time=${payload.time}`, "mqtt");
  const latitude = payload.latitude_i / 10000000;
  const longitude = payload.longitude_i / 10000000;

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
  if (latitude === 0 && longitude === 0) return;

  const boat = await storage.getBoat(sender);
  if (!boat) {
    await storage.upsertBoat({ id: sender, longName: sender, shortName: sender.slice(-3) });
  }

  let speed = 0;
  let heading = 0;
  const currentTime = payload.time || Math.floor(Date.now() / 1000);

  if (payload.ground_speed !== undefined && payload.ground_speed > 0) {
    speed = payload.ground_speed * 1.94384;
    log(`Using device ground_speed: ${payload.ground_speed} m/s = ${speed.toFixed(1)} kts`, "mqtt");
  }

  if (payload.ground_track !== undefined && payload.ground_track > 0) {
    heading = payload.ground_track / 100000;
    log(`Using device ground_track: ${payload.ground_track} = ${heading.toFixed(1)}°`, "mqtt");
  }

  if (speed === 0 || heading === 0) {
    const prev = lastPositions.get(sender);
    if (prev) {
      const calcSpeed = calculateSpeed(prev.lat, prev.lng, prev.time, latitude, longitude, currentTime);
      const calcHeading = calculateHeading(prev.lat, prev.lng, latitude, longitude);
      const precisionBits = payload.precision_bits || 32;
      if (precisionBits >= 20 && calcSpeed < 500) {
        if (speed === 0 && calcSpeed >= 0.1) speed = calcSpeed;
        if (heading === 0) heading = calcHeading;
      }
    }
  }

  if (speed < 0.1) {
    speed = 0;
    heading = 0;
  }

  lastPositions.set(sender, { lat: latitude, lng: longitude, time: currentTime });

  const position = await storage.insertPosition({
    boatId: sender,
    latitude,
    longitude,
    altitude: payload.altitude ?? 0,
    satellites: payload.sats_in_view ?? 0,
    speed,
    heading,
    timestamp: payload.time ? new Date(payload.time * 1000) : new Date(),
  });

  await storage.pruneOldPositions(sender);

  if (ioInstance) {
    ioInstance.emit("boat:position", { boatId: sender, position });
  }

  log(`Position: ${sender} → ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (${speed.toFixed(1)} kts)`, "mqtt");
}

async function handleNodeInfoMessage(sender: string, payload: NodeInfoPayload) {
  await storage.upsertBoat({
    id: sender,
    longName: payload.longName || sender,
    shortName: payload.shortName || sender.slice(-3),
    hwModel: payload.hwModel || null,
  });

  if (ioInstance) {
    const allBoats = await storage.getAllBoatsWithPositions();
    ioInstance.emit("boats:update", allBoats);
  }

  log(`NodeInfo: ${sender} → ${payload.longName} (${payload.shortName})`, "mqtt");
}

export function setupMQTT(io: SocketServer) {
  ioInstance = io;

  log(`Connecting to MQTT broker at ${BROKER_URL}...`, "mqtt");

  mqttClient = mqtt.connect(BROKER_URL, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    keepalive: 60,
  });

  mqttClient.on("connect", () => {
    log("Connected to MQTT broker", "mqtt");
    isMqttConnected = true;
    mqttClient!.subscribe(MQTT_TOPICS, { qos: 0 }, (err) => {
      if (err) {
        log(`MQTT subscribe error: ${err.message}`, "mqtt");
      } else {
        log(`Subscribed to ${MQTT_TOPICS.join(", ")}`, "mqtt");
      }
    });
    io.emit("mqtt:status", { connected: true });
  });

  mqttClient.on("message", async (_topic, message) => {
    try {
      const raw = message.toString();
      const msg = JSON.parse(raw);

      if (!msg.type || !msg.sender) return;

      if (msg.type === "position" && msg.payload) {
        if (!isValidPositionPayload(msg.payload)) {
          log(`Invalid position payload from ${msg.sender}: ${JSON.stringify(msg.payload).slice(0, 200)}`, "mqtt");
          return;
        }
        log(`Full position msg from ${msg.sender}: ${JSON.stringify(msg.payload).slice(0, 500)}`, "mqtt");
        await handlePositionMessage(msg.sender, msg.payload);
      } else if (msg.type === "nodeinfo") {
        const payload = msg.payload || msg;
        if (!isValidNodeInfoPayload(payload)) {
          log(`Invalid nodeinfo payload from ${msg.sender}: ${JSON.stringify(msg).slice(0, 300)}`, "mqtt");
          return;
        }
        await handleNodeInfoMessage(msg.sender, normalizeNodeInfoPayload(payload));
      } else {
        log(`MQTT msg type="${msg.type}" from ${msg.sender}`, "mqtt");
      }
    } catch {
    }
  });

  mqttClient.on("error", (err) => {
    log(`MQTT error: ${err.message}`, "mqtt");
    isMqttConnected = false;
    io.emit("mqtt:status", { connected: false });
  });

  mqttClient.on("offline", () => {
    log("MQTT offline", "mqtt");
    isMqttConnected = false;
    io.emit("mqtt:status", { connected: false });
  });

  mqttClient.on("reconnect", () => {
    log("MQTT reconnecting...", "mqtt");
  });

  mqttClient.on("close", () => {
    isMqttConnected = false;
    io.emit("mqtt:status", { connected: false });
  });
}
