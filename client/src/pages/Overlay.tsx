import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import BoatMap from "@/components/BoatMap";
import { useBoats } from "@/hooks/use-boats";
import { useOverlayReceiver } from "@/hooks/use-overlay-sync";
import { getBoatColor } from "@/lib/types";
import type { OverlayState } from "@/lib/types";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface HistoryTrack {
  boat: { id: string; longName: string; shortName: string; hwModel: string | null; lastSeen: string | null };
  positions: { id: number; boatId: string; latitude: number; longitude: number; altitude: number | null; satellites: number | null; speed: number | null; heading: number | null; timestamp: string }[];
}

export default function Overlay() {
  const { boats, selectedBoatId, selectedTrack, selectBoat } = useBoats();
  const [mode, setMode] = useState<"live" | "history">("live");
  const [controlledCenter, setControlledCenter] = useState<[number, number]>([33.63, -117.89]);
  const [controlledZoom, setControlledZoom] = useState(12);
  const [historyDate, setHistoryDate] = useState<string>("");
  const [historySelectedBoatId, setHistorySelectedBoatId] = useState<string | null>(null);
  const [historyTracks, setHistoryTracks] = useState<HistoryTrack[]>([]);
  const [hiddenBoatIds, setHiddenBoatIds] = useState<Set<string>>(new Set());

  const historyMapRef = useRef<L.Map | null>(null);
  const historyMapContainerRef = useRef<HTMLDivElement>(null);
  const historyLayersRef = useRef<L.LayerGroup | null>(null);
  const lastHistoryDateRef = useRef<string>("");

  useOverlayReceiver(useCallback((state: OverlayState) => {
    setMode(state.mode);
    setControlledCenter(state.center);
    setControlledZoom(state.zoom);
    setHiddenBoatIds(new Set(state.hiddenBoatIds || []));

    if (state.mode === "live") {
      if (state.selectedBoatId !== selectedBoatId) {
        selectBoat(state.selectedBoatId);
      }
    } else if (state.mode === "history") {
      setHistorySelectedBoatId(state.selectedBoatId);
      if (state.historyDate && state.historyDate !== lastHistoryDateRef.current) {
        lastHistoryDateRef.current = state.historyDate;
        setHistoryDate(state.historyDate);
      }
    }
  }, [selectBoat, selectedBoatId]));

  useEffect(() => {
    if (!historyDate || mode !== "history") return;
    fetch(`/api/history?date=${historyDate}`)
      .then((r) => r.json())
      .then((data) => setHistoryTracks(data))
      .catch(() => setHistoryTracks([]));
  }, [historyDate, mode]);

  useEffect(() => {
    if (mode !== "history") return;
    if (!historyMapContainerRef.current) return;

    if (!historyMapRef.current) {
      const map = L.map(historyMapContainerRef.current, {
        center: controlledCenter,
        zoom: controlledZoom,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      historyLayersRef.current = L.layerGroup().addTo(map);
      historyMapRef.current = map;
    }

    return () => {};
  }, [mode]);

  useEffect(() => {
    if (mode !== "history" || !historyMapRef.current) return;
    historyMapRef.current.setView(controlledCenter, controlledZoom, { animate: true, duration: 0.3 });
  }, [controlledCenter, controlledZoom, mode]);

  const historyBoatColorMap = useMemo(() => {
    const map = new Map<string, string>();
    historyTracks.forEach((t, i) => map.set(t.boat.id, getBoatColor(i)));
    return map;
  }, [historyTracks]);

  useEffect(() => {
    if (mode !== "history" || !historyMapRef.current || !historyLayersRef.current) return;
    historyLayersRef.current.clearLayers();

    historyTracks.forEach((track) => {
      const color = historyBoatColorMap.get(track.boat.id) || "#3b82f6";
      const isSelected = track.boat.id === historySelectedBoatId;
      const opacity = historySelectedBoatId && !isSelected ? 0.2 : 1;

      if (track.positions.length === 0) return;

      const latlngs = track.positions.map(
        (p) => [p.latitude, p.longitude] as [number, number]
      );

      const line = L.polyline(latlngs, {
        color,
        weight: isSelected ? 4 : 3,
        opacity: opacity * 0.8,
      });
      historyLayersRef.current!.addLayer(line);

      const startPos = track.positions[0];
      const startDot = L.circleMarker([startPos.latitude, startPos.longitude], {
        radius: 6,
        fillColor: "#22c55e",
        color: "white",
        weight: 2,
        fillOpacity: opacity,
        opacity: opacity,
      });
      historyLayersRef.current!.addLayer(startDot);

      const endPos = track.positions[track.positions.length - 1];
      const endDot = L.circleMarker([endPos.latitude, endPos.longitude], {
        radius: 6,
        fillColor: color,
        color: "white",
        weight: 2,
        fillOpacity: opacity,
        opacity: opacity,
      });
      historyLayersRef.current!.addLayer(endDot);

      if (isSelected) {
        track.positions.forEach((p, i) => {
          if (i % Math.max(1, Math.floor(track.positions.length / 30)) !== 0) return;
          const dot = L.circleMarker([p.latitude, p.longitude], {
            radius: 3,
            fillColor: color,
            color: "transparent",
            fillOpacity: 0.5 + (i / track.positions.length) * 0.5,
          });
          historyLayersRef.current!.addLayer(dot);
        });
      }

      const midIdx = Math.floor(track.positions.length / 2);
      const midPos = track.positions[midIdx];
      const label = L.divIcon({
        className: "history-label",
        html: `<div style="
          background:${color}${isSelected ? "" : "aa"};
          color:white;
          font-size:11px;font-weight:700;
          padding:2px 6px;
          border-radius:4px;
          white-space:nowrap;
          box-shadow:0 1px 4px rgba(0,0,0,0.4);
          font-family:system-ui,sans-serif;
        ">${track.boat.shortName}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const labelMarker = L.marker([midPos.latitude, midPos.longitude], { icon: label, interactive: false });
      historyLayersRef.current!.addLayer(labelMarker);
    });
  }, [historyTracks, historyBoatColorMap, historySelectedBoatId, mode]);

  useEffect(() => {
    if (mode === "history" && historyMapRef.current) {
      setTimeout(() => historyMapRef.current?.invalidateSize(), 100);
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      if (historyMapRef.current) {
        historyMapRef.current.remove();
        historyMapRef.current = null;
      }
    };
  }, []);

  const boatColorMap = useMemo(() => {
    const map = new Map<string, string>();
    boats.forEach((b, i) => map.set(b.id, getBoatColor(i)));
    return map;
  }, [boats.map((b) => b.id).join(",")]);

  const visibleBoats = useMemo(() => {
    return boats.filter((b) => !hiddenBoatIds.has(b.id));
  }, [boats, hiddenBoatIds]);

  const trackPositions = useMemo(() => {
    return selectedTrack?.positions || [];
  }, [selectedTrack]);

  const noop = useCallback(() => {}, []);

  return (
    <div
      className="w-screen h-screen overflow-hidden"
      style={{ background: "#000" }}
      data-testid="overlay-container"
    >
      <div style={{ display: mode === "live" ? "block" : "none" }} className="w-full h-full">
        <BoatMap
          boats={visibleBoats}
          selectedBoatId={selectedBoatId}
          trackPositions={trackPositions}
          onSelectBoat={noop}
          boatColorMap={boatColorMap}
          viewOnly
          controlledCenter={controlledCenter}
          controlledZoom={controlledZoom}
        />
      </div>
      <div
        ref={historyMapContainerRef}
        style={{ display: mode === "history" ? "block" : "none" }}
        className="w-full h-full"
        data-testid="overlay-history-map"
      />
    </div>
  );
}
