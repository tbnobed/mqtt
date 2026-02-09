import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { BoatData, BoatPositionData } from "@/lib/types";
import { getBoatColor, formatTimestamp, isOffline, getTimeSince } from "@/lib/types";

interface BoatMapProps {
  boats: BoatData[];
  selectedBoatId: string | null;
  trackPositions: BoatPositionData[];
  onSelectBoat: (id: string | null) => void;
  boatColorMap: Map<string, string>;
}

function createBoatIcon(color: string, heading: number, offline: boolean): L.DivIcon {
  const opacity = offline ? 0.5 : 1;
  const rotation = heading || 0;
  return L.divIcon({
    className: "boat-marker",
    html: `
      <div style="position:relative;width:36px;height:36px;opacity:${opacity};" data-testid="marker-icon">
        <div style="
          width:36px;height:36px;
          background:${color};
          border-radius:50%;
          border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          position:relative;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="transform:rotate(${rotation}deg)">
            <path d="M12 2L6 20L12 16L18 20L12 2Z" fill="white" stroke="white" stroke-width="1"/>
          </svg>
        </div>
        ${offline ? `<div style="
          position:absolute;top:-4px;right:-4px;
          width:12px;height:12px;
          background:#ef4444;
          border-radius:50%;
          border:2px solid white;
        "></div>` : `<div style="
          position:absolute;top:-4px;right:-4px;
          width:12px;height:12px;
          background:#22c55e;
          border-radius:50%;
          border:2px solid white;
        "></div>`}
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

export default function BoatMap({ boats, selectedBoatId, trackPositions, onSelectBoat, boatColorMap }: BoatMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const trackLineRef = useRef<L.Polyline | null>(null);
  const trackDotsRef = useRef<L.CircleMarker[]>([]);

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

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const existingIds = new Set<string>();

    boats.forEach((boat) => {
      if (boat.latitude === undefined || boat.longitude === undefined) return;
      existingIds.add(boat.id);
      const color = boatColorMap.get(boat.id) || "#3b82f6";
      const offline = isOffline(boat.positionTimestamp || boat.lastSeen);
      const icon = createBoatIcon(color, boat.heading || 0, offline);

      let marker = markersRef.current.get(boat.id);
      if (marker) {
        marker.setLatLng([boat.latitude, boat.longitude]);
        marker.setIcon(icon);
      } else {
        marker = L.marker([boat.latitude, boat.longitude], { icon }).addTo(map);
        marker.on("click", () => onSelectBoat(boat.id));
        markersRef.current.set(boat.id, marker);
      }

      marker.bindPopup(
        `<div style="font-family:system-ui;min-width:140px;">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px;color:${color};">${boat.longName}</div>
          <div style="font-size:12px;color:#888;">${boat.shortName} &middot; ${getTimeSince(boat.positionTimestamp || boat.lastSeen)}</div>
        </div>`,
        { closeButton: false }
      );
    });

    markersRef.current.forEach((marker, id) => {
      if (!existingIds.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });
  }, [boats, boatColorMap, onSelectBoat]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (trackLineRef.current) {
      map.removeLayer(trackLineRef.current);
      trackLineRef.current = null;
    }
    trackDotsRef.current.forEach((dot) => map.removeLayer(dot));
    trackDotsRef.current = [];

    if (trackPositions.length > 1 && selectedBoatId) {
      const color = boatColorMap.get(selectedBoatId) || "#3b82f6";
      const latlngs = trackPositions.map((p) => [p.latitude, p.longitude] as [number, number]);

      trackLineRef.current = L.polyline(latlngs, {
        color,
        weight: 3,
        opacity: 0.7,
        dashArray: "6 4",
      }).addTo(map);

      trackPositions.forEach((p, i) => {
        const opacity = 0.3 + (i / trackPositions.length) * 0.7;
        const dot = L.circleMarker([p.latitude, p.longitude], {
          radius: 3,
          fillColor: color,
          color: "transparent",
          fillOpacity: opacity,
        }).addTo(map);
        trackDotsRef.current.push(dot);
      });
    }
  }, [trackPositions, selectedBoatId, boatColorMap]);

  useEffect(() => {
    if (!mapRef.current || !selectedBoatId) return;
    const boat = boats.find((b) => b.id === selectedBoatId);
    if (boat?.latitude !== undefined && boat?.longitude !== undefined) {
      mapRef.current.setView([boat.latitude, boat.longitude], 14, { animate: true });
    }
  }, [selectedBoatId]);

  return (
    <div
      ref={mapContainerRef}
      data-testid="map-container"
      className="w-full h-full"
      style={{ minHeight: "100%" }}
    />
  );
}
