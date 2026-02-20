import { useRef, useState } from "react";
import { Navigation, Satellite, Mountain, Clock, Waves, ArrowUp, Upload, X, ImageIcon, RotateCw, Battery, Gauge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BoatData, BoatPositionData } from "@/lib/types";
import { formatCoord, formatTimestamp, getTimeSince, isOffline, formatSpeed } from "@/lib/types";

interface BoatInfoPanelProps {
  boat: BoatData;
  trackPositions: BoatPositionData[];
  color: string;
  onClose: () => void;
  onLogoUpdated?: () => void;
}

export default function BoatInfoPanel({ boat, trackPositions, color, onClose, onLogoUpdated }: BoatInfoPanelProps) {
  const offline = isOffline(boat.positionTimestamp || boat.lastSeen);
  const lastTs = boat.positionTimestamp || boat.lastSeen;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch(`/api/boats/${boat.id}/logo`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        onLogoUpdated?.();
      }
    } catch {}
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveLogo = async () => {
    setUploading(true);
    try {
      const res = await fetch(`/api/boats/${boat.id}/logo`, { method: "DELETE" });
      if (res.ok) {
        onLogoUpdated?.();
      }
    } catch {}
    setUploading(false);
  };

  return (
    <Card className="p-4 space-y-4" data-testid="boat-info-panel">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {boat.logoUrl ? (
            <img
              src={boat.logoUrl}
              alt={boat.shortName}
              className="w-8 h-8 rounded-full shrink-0 object-cover"
              style={{ border: `2px solid ${color}` }}
              data-testid="img-boat-logo"
            />
          ) : (
            <div
              className="w-4 h-4 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate" data-testid="text-boat-name">{boat.longName}</h3>
            <p className="text-xs text-muted-foreground">{boat.shortName} &middot; {boat.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={offline ? "destructive" : "default"}
            className="text-xs"
            data-testid="badge-status"
          >
            {offline ? "Offline" : "Online"}
          </Badge>
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-panel">
            <ArrowUp className="w-4 h-4 rotate-90" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleLogoUpload}
          data-testid="input-logo-upload"
        />
        <Button
          variant="outline"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          data-testid="button-upload-logo"
        >
          {uploading ? (
            <span className="text-xs">Uploading...</span>
          ) : (
            <>
              <ImageIcon className="w-4 h-4 mr-1" />
              <span className="text-xs">{boat.logoUrl ? "Change Logo" : "Set Team Logo"}</span>
            </>
          )}
        </Button>
        {boat.logoUrl && (
          <Button
            size="icon"
            variant="ghost"
            onClick={handleRemoveLogo}
            disabled={uploading}
            data-testid="button-remove-logo"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoItem
          icon={<Navigation className="w-3.5 h-3.5" />}
          label="Latitude"
          value={formatCoord(boat.latitude)}
          testId="text-latitude"
        />
        <InfoItem
          icon={<Navigation className="w-3.5 h-3.5 rotate-90" />}
          label="Longitude"
          value={formatCoord(boat.longitude)}
          testId="text-longitude"
        />
        <InfoItem
          icon={<Mountain className="w-3.5 h-3.5" />}
          label="Altitude"
          value={boat.altitude !== undefined ? `${boat.altitude}m` : "N/A"}
          testId="text-altitude"
        />
        <InfoItem
          icon={<Satellite className="w-3.5 h-3.5" />}
          label="Satellites"
          value={boat.satellites !== undefined ? `${boat.satellites}` : "N/A"}
          testId="text-satellites"
        />
        <InfoItem
          icon={<Waves className="w-3.5 h-3.5" />}
          label="Speed"
          value={formatSpeed(boat.speed)}
          testId="text-speed"
        />
        <InfoItem
          icon={<Clock className="w-3.5 h-3.5" />}
          label="Last Update"
          value={getTimeSince(lastTs)}
          testId="text-last-update"
        />
        {boat.pitch != null && (
          <InfoItem
            icon={<RotateCw className="w-3.5 h-3.5" />}
            label="Pitch"
            value={`${boat.pitch.toFixed(1)}°`}
            testId="text-pitch"
          />
        )}
        {boat.roll != null && (
          <InfoItem
            icon={<RotateCw className="w-3.5 h-3.5 rotate-90" />}
            label="Roll"
            value={`${boat.roll.toFixed(1)}°`}
            testId="text-roll"
          />
        )}
        {(boat.batteryLevel != null || boat.batteryVoltage != null) && (
          <InfoItem
            icon={<Battery className="w-3.5 h-3.5" />}
            label="Battery"
            value={boat.batteryLevel != null ? `${boat.batteryLevel}%${boat.batteryVoltage != null ? ` (${boat.batteryVoltage.toFixed(1)}V)` : ""}` : `${boat.batteryVoltage!.toFixed(1)}V`}
            testId="text-battery"
          />
        )}
      </div>

      {boat.hwModel && (
        <p className="text-xs text-muted-foreground">
          Device: {boat.hwModel}
        </p>
      )}

      {trackPositions.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Track history: {trackPositions.length} positions
          </p>
        </div>
      )}
    </Card>
  );
}

function InfoItem({ icon, label, value, testId }: { icon: React.ReactNode; label: string; value: string; testId: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate" data-testid={testId}>{value}</p>
      </div>
    </div>
  );
}
