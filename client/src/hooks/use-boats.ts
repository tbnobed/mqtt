import { useState, useEffect, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import type { BoatData, BoatTrackData, BoatPositionData } from "@/lib/types";

export function useBoats() {
  const [boats, setBoats] = useState<BoatData[]>([]);
  const [selectedBoatId, setSelectedBoatId] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<BoatTrackData | null>(null);
  const [connected, setConnected] = useState(false);
  const [mqttConnected, setMqttConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    const stableSort = (arr: BoatData[]) =>
      [...arr].sort((a, b) => a.id.localeCompare(b.id));

    socket.on("boats:update", (data: BoatData[]) => {
      setBoats(stableSort(data));
    });

    socket.on("boat:position", (data: { boatId: string; position: BoatPositionData }) => {
      setBoats((prev) => {
        const exists = prev.some((b) => b.id === data.boatId);
        if (!exists) {
          return stableSort([
            ...prev,
            {
              id: data.boatId,
              longName: data.boatId,
              shortName: data.boatId.slice(-3),
              hwModel: null,
              logoUrl: null,
              lastSeen: data.position.timestamp,
              latitude: data.position.latitude,
              longitude: data.position.longitude,
              altitude: data.position.altitude ?? undefined,
              satellites: data.position.satellites ?? undefined,
              speed: data.position.speed ?? undefined,
              heading: data.position.heading ?? undefined,
              positionTimestamp: data.position.timestamp,
            },
          ];
        }
        return prev.map((b) =>
          b.id === data.boatId
            ? {
                ...b,
                latitude: data.position.latitude,
                longitude: data.position.longitude,
                altitude: data.position.altitude ?? b.altitude,
                satellites: data.position.satellites ?? b.satellites,
                speed: data.position.speed ?? b.speed,
                heading: data.position.heading ?? b.heading,
                positionTimestamp: data.position.timestamp,
                lastSeen: data.position.timestamp,
              }
            : b
        );
      });

      setSelectedTrack((prev) => {
        if (prev && prev.boat.id === data.boatId) {
          return {
            ...prev,
            boat: {
              ...prev.boat,
              latitude: data.position.latitude,
              longitude: data.position.longitude,
              altitude: data.position.altitude ?? prev.boat.altitude,
              satellites: data.position.satellites ?? prev.boat.satellites,
              speed: data.position.speed ?? prev.boat.speed,
              heading: data.position.heading ?? prev.boat.heading,
              positionTimestamp: data.position.timestamp,
              lastSeen: data.position.timestamp,
            },
            positions: [...prev.positions, data.position].slice(-50),
          };
        }
        return prev;
      });
    });

    socket.on("mqtt:status", (status: { connected: boolean }) => {
      setMqttConnected(status.connected);
    });

    fetch("/api/boats")
      .then((r) => r.json())
      .then((data) => setBoats(stableSort(data)))
      .catch(() => {});

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("boats:update");
      socket.off("boat:position");
      socket.off("mqtt:status");
    };
  }, []);

  const selectBoat = useCallback(async (boatId: string | null) => {
    setSelectedBoatId(boatId);
    if (boatId) {
      try {
        const r = await fetch(`/api/boats/${boatId}`);
        const data = await r.json();
        setSelectedTrack(data);
      } catch {
        setSelectedTrack(null);
      }
    } else {
      setSelectedTrack(null);
    }
  }, []);

  const refreshBoats = useCallback(async () => {
    try {
      const r = await fetch("/api/boats");
      const data = await r.json();
      setBoats(data);
    } catch {}
  }, []);

  return { boats, selectedBoatId, selectedTrack, connected, mqttConnected, selectBoat, refreshBoats };
}
