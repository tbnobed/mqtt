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
  viewOnly?: boolean;
  controlledCenter?: [number, number];
  controlledZoom?: number;
  onViewChange?: (center: [number, number], zoom: number) => void;
}

function createBoatIcon(color: string, heading: number, offline: boolean, label: string, offsetX: number, offsetY: number, selected: boolean, logoUrl?: string | null): L.DivIcon {
  const opacity = offline ? 0.5 : 1;
  const rotation = heading || 0;
  const statusColor = offline ? "#ef4444" : "#22c55e";
  const size = selected ? 42 : 36;
  const anchor = Math.floor(size / 2);

  let innerContent: string;
  if (logoUrl) {
    const ringStyle = selected
      ? `box-shadow:0 0 0 4px ${color}44, 0 0 12px ${color}88, 0 2px 8px rgba(0,0,0,0.3);border:3px solid ${color};`
      : `box-shadow:0 2px 8px rgba(0,0,0,0.3);border:3px solid ${color};`;
    innerContent = `
      <div style="
        width:${size}px;height:${size}px;
        border-radius:50%;
        ${ringStyle}
        overflow:hidden;
        position:relative;
      ">
        <img src="${logoUrl}" style="width:100%;height:100%;object-fit:cover;" />
      </div>`;
  } else {
    const svgSize = selected ? 20 : 18;
    const ringStyle = selected
      ? `box-shadow:0 0 0 4px ${color}44, 0 0 12px ${color}88, 0 2px 8px rgba(0,0,0,0.3);border:3px solid #ffffff;`
      : `box-shadow:0 2px 8px rgba(0,0,0,0.3);border:3px solid white;`;
    innerContent = `
      <div style="
        width:${size}px;height:${size}px;
        background:${color};
        border-radius:50%;
        ${ringStyle}
        display:flex;align-items:center;justify-content:center;
        position:relative;
      ">
        <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 24 24" fill="none" style="transform:rotate(${rotation}deg)">
          <path d="M12 2L6 20L12 16L18 20L12 2Z" fill="white" stroke="white" stroke-width="1"/>
        </svg>
      </div>`;
  }

  return L.divIcon({
    className: "boat-marker",
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;opacity:${opacity};transform:translate(${offsetX}px,${offsetY}px);" data-testid="marker-icon">
        ${innerContent}
        <div style="
          position:absolute;top:-4px;right:-4px;
          width:12px;height:12px;
          background:${statusColor};
          border-radius:50%;
          border:2px solid white;
        "></div>
        <div style="
          position:absolute;top:${size + 2}px;left:50%;transform:translateX(-50%);
          background:${selected ? color : color + "cc"};
          color:white;
          font-size:${selected ? 12 : 11}px;font-weight:700;
          padding:${selected ? "2px 8px" : "1px 6px"};
          border-radius:4px;
          white-space:nowrap;
          box-shadow:0 1px 4px rgba(0,0,0,0.4);
          letter-spacing:0.5px;
          font-family:system-ui,sans-serif;
        ">${label}</div>
      </div>
    `,
    iconSize: [size, size + 20],
    iconAnchor: [anchor, anchor],
    popupAnchor: [0, -anchor - 2],
  });
}

function computeOffsets(boats: BoatData[]): Map<string, [number, number]> {
  const offsets = new Map<string, [number, number]>();
  const threshold = 0.0001;
  const groups: BoatData[][] = [];

  const assigned = new Set<string>();
  boats.forEach((boat) => {
    if (assigned.has(boat.id) || boat.latitude === undefined || boat.longitude === undefined) return;
    const group = [boat];
    assigned.add(boat.id);
    boats.forEach((other) => {
      if (assigned.has(other.id) || other.latitude === undefined || other.longitude === undefined) return;
      if (
        Math.abs((boat.latitude ?? 0) - (other.latitude ?? 0)) < threshold &&
        Math.abs((boat.longitude ?? 0) - (other.longitude ?? 0)) < threshold
      ) {
        group.push(other);
        assigned.add(other.id);
      }
    });
    if (group.length > 1) groups.push(group);
  });

  groups.forEach((group) => {
    const spread = 22;
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((boat, i) => {
      const angle = (2 * Math.PI * i) / sorted.length - Math.PI / 2;
      offsets.set(boat.id, [Math.cos(angle) * spread, Math.sin(angle) * spread]);
    });
  });

  return offsets;
}

export default function BoatMap({ boats, selectedBoatId, trackPositions, onSelectBoat, boatColorMap, viewOnly, controlledCenter, controlledZoom, onViewChange }: BoatMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const trackLineRef = useRef<L.Polyline | null>(null);
  const trackDotsRef = useRef<L.CircleMarker[]>([]);
  const isExternalMoveRef = useRef(false);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [33.63, -117.89],
      zoom: 12,
      zoomControl: !viewOnly,
      dragging: !viewOnly,
      scrollWheelZoom: !viewOnly,
      doubleClickZoom: !viewOnly,
      touchZoom: !viewOnly,
      boxZoom: !viewOnly,
      keyboard: !viewOnly,
      attributionControl: !viewOnly,
    });

    if (!viewOnly) {
      L.control.zoom({ position: "topright" }).addTo(map);
    }

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    if (!viewOnly) {
      const emitChange = () => {
        if (isExternalMoveRef.current) return;
        const c = map.getCenter();
        onViewChangeRef.current?.([c.lat, c.lng], map.getZoom());
      };
      map.on("moveend", emitChange);
      map.on("zoomend", emitChange);
    }

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
    const offsets = computeOffsets(boats);

    boats.forEach((boat) => {
      if (boat.latitude === undefined || boat.longitude === undefined) return;
      existingIds.add(boat.id);
      const color = boatColorMap.get(boat.id) || "#3b82f6";
      const offline = isOffline(boat.positionTimestamp || boat.lastSeen);
      const [ox, oy] = offsets.get(boat.id) || [0, 0];
      const isSelected = boat.id === selectedBoatId;
      const icon = createBoatIcon(color, boat.heading || 0, offline, boat.shortName, ox, oy, isSelected, boat.logoUrl);

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
  }, [boats, boatColorMap, onSelectBoat, selectedBoatId]);

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
    if (!mapRef.current || !viewOnly || !controlledCenter || controlledZoom === undefined) return;
    isExternalMoveRef.current = true;
    mapRef.current.setView(controlledCenter, controlledZoom, { animate: true, duration: 0.3 });
    setTimeout(() => { isExternalMoveRef.current = false; }, 400);
  }, [controlledCenter?.[0], controlledCenter?.[1], controlledZoom, viewOnly]);

  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapRef.current || !selectedBoatId || viewOnly) {
      prevSelectedRef.current = selectedBoatId;
      return;
    }
    if (prevSelectedRef.current === selectedBoatId) return;
    prevSelectedRef.current = selectedBoatId;
    const boat = boats.find((b) => b.id === selectedBoatId);
    if (boat?.latitude !== undefined && boat?.longitude !== undefined) {
      mapRef.current.setView([boat.latitude, boat.longitude], 14, { animate: true });
    }
  }, [selectedBoatId, boats, viewOnly]);

  return (
    <div
      ref={mapContainerRef}
      data-testid="map-container"
      className="w-full h-full"
      style={{ minHeight: "100%" }}
    />
  );
}
