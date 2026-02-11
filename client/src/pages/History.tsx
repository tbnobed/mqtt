import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Calendar, Radio, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getBoatColor } from "@/lib/types";

interface HistoryBoat {
  id: string;
  longName: string;
  shortName: string;
  hwModel: string | null;
  lastSeen: string | null;
}

interface HistoryPosition {
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

interface HistoryTrack {
  boat: HistoryBoat;
  positions: HistoryPosition[];
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export default function History() {
  const [, setLocation] = useLocation();
  const [date, setDate] = useState(todayStr());
  const [tracks, setTracks] = useState<HistoryTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedBoatId, setSelectedBoatId] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    fetch("/api/history/dates")
      .then((r) => r.json())
      .then((data) => setAvailableDates(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/history?date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        setTracks(data);
        setSelectedBoatId(null);
      })
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [33.63, -117.89],
      zoom: 12,
      zoomControl: false,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const boatColorMap = useMemo(() => {
    const map = new Map<string, string>();
    tracks.forEach((t, i) => map.set(t.boat.id, getBoatColor(i)));
    return map;
  }, [tracks]);

  useEffect(() => {
    if (!mapRef.current || !layersRef.current) return;
    layersRef.current.clearLayers();

    const allBounds: L.LatLng[] = [];

    tracks.forEach((track) => {
      const color = boatColorMap.get(track.boat.id) || "#3b82f6";
      const isSelected = track.boat.id === selectedBoatId;
      const opacity = selectedBoatId && !isSelected ? 0.2 : 1;

      if (track.positions.length === 0) return;

      const latlngs = track.positions.map(
        (p) => [p.latitude, p.longitude] as [number, number]
      );

      latlngs.forEach((ll) => allBounds.push(L.latLng(ll[0], ll[1])));

      const line = L.polyline(latlngs, {
        color,
        weight: isSelected ? 4 : 3,
        opacity: opacity * 0.8,
      });
      layersRef.current!.addLayer(line);

      const startPos = track.positions[0];
      const startDot = L.circleMarker([startPos.latitude, startPos.longitude], {
        radius: 6,
        fillColor: "#22c55e",
        color: "white",
        weight: 2,
        fillOpacity: opacity,
        opacity: opacity,
      }).bindTooltip(`${track.boat.shortName} Start`, { permanent: false });
      layersRef.current!.addLayer(startDot);

      const endPos = track.positions[track.positions.length - 1];
      const endDot = L.circleMarker([endPos.latitude, endPos.longitude], {
        radius: 6,
        fillColor: color,
        color: "white",
        weight: 2,
        fillOpacity: opacity,
        opacity: opacity,
      }).bindTooltip(`${track.boat.shortName} End`, { permanent: false });
      layersRef.current!.addLayer(endDot);

      if (isSelected) {
        track.positions.forEach((p, i) => {
          if (i % Math.max(1, Math.floor(track.positions.length / 30)) !== 0) return;
          const dot = L.circleMarker([p.latitude, p.longitude], {
            radius: 3,
            fillColor: color,
            color: "transparent",
            fillOpacity: 0.5 + (i / track.positions.length) * 0.5,
          }).bindTooltip(
            new Date(p.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
            { permanent: false }
          );
          layersRef.current!.addLayer(dot);
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
          cursor:pointer;
        ">${track.boat.shortName}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const labelMarker = L.marker([midPos.latitude, midPos.longitude], { icon: label, interactive: true });
      labelMarker.on("click", () => setSelectedBoatId(
        selectedBoatId === track.boat.id ? null : track.boat.id
      ));
      layersRef.current!.addLayer(labelMarker);
    });

    if (allBounds.length > 0 && !selectedBoatId) {
      const bounds = L.latLngBounds(allBounds);
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [tracks, boatColorMap, selectedBoatId]);

  useEffect(() => {
    if (!mapRef.current || !selectedBoatId) return;
    const track = tracks.find((t) => t.boat.id === selectedBoatId);
    if (!track || track.positions.length === 0) return;
    const latlngs = track.positions.map((p) => L.latLng(p.latitude, p.longitude));
    const bounds = L.latLngBounds(latlngs);
    mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, animate: true });
  }, [selectedBoatId, tracks]);

  const isToday = date === todayStr();

  const handleDateInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDate(e.target.value);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background" data-testid="history-page">
      <div className="w-80 shrink-0 border-r border-border flex flex-col bg-card h-full">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <h1 className="font-semibold text-base">Track History</h1>
            </div>
            <Button
              variant="ghost"
              onClick={() => setLocation("/")}
              data-testid="button-go-live"
            >
              <Radio className="w-4 h-4 mr-1" />
              Live
            </Button>
          </div>
        </div>

        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setDate(shiftDate(date, -1))}
              data-testid="button-prev-day"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-center flex-1">
              <p className="text-sm font-medium" data-testid="text-current-date">
                {formatDateDisplay(date)}
              </p>
              {isToday && (
                <p className="text-xs text-muted-foreground">Today</p>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setDate(shiftDate(date, 1))}
              disabled={isToday}
              data-testid="button-next-day"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={handleDateInput}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            data-testid="input-date-picker"
          />
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">Loading tracks...</p>
              </div>
            ) : tracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="text-no-history">
                <Ship className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No data for this date</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try a different day
                </p>
              </div>
            ) : (
              <div className="space-y-1" data-testid="history-boat-list">
                {tracks.map((track) => {
                  const color = boatColorMap.get(track.boat.id) || "#3b82f6";
                  const isSelected = selectedBoatId === track.boat.id;
                  const firstTime = new Date(track.positions[0].timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                  const lastTime = new Date(track.positions[track.positions.length - 1].timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

                  return (
                    <button
                      key={track.boat.id}
                      data-testid={`button-history-boat-${track.boat.id}`}
                      onClick={() => setSelectedBoatId(isSelected ? null : track.boat.id)}
                      className={`
                        w-full text-left rounded-md p-3 transition-colors
                        ${isSelected ? "bg-accent" : "hover-elevate"}
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm font-medium truncate flex-1" data-testid={`text-history-boat-name-${track.boat.id}`}>
                          {track.boat.longName}
                        </span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {track.positions.length} pts
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 pl-5">
                        <span className="text-xs text-muted-foreground">
                          {firstTime} - {lastTime}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        {tracks.length > 0 && (
          <div className="border-t border-border p-3">
            <p className="text-xs text-muted-foreground text-center">
              {tracks.length} boat{tracks.length !== 1 ? "s" : ""} tracked on {formatDateDisplay(date)}
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 relative">
        <div
          ref={mapContainerRef}
          data-testid="history-map-container"
          className="w-full h-full"
          style={{ minHeight: "100%" }}
        />
      </div>
    </div>
  );
}
