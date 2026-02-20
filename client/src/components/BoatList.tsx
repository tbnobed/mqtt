import { useState } from "react";
import { Ship, Clock, Eye, EyeOff, Battery, BatteryLow, BatteryMedium, BatteryFull, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BoatData } from "@/lib/types";
import { isOffline, getTimeSince, formatSpeed } from "@/lib/types";

interface BoatListProps {
  boats: BoatData[];
  selectedBoatId: string | null;
  onSelectBoat: (id: string | null) => void;
  boatColorMap: Map<string, string>;
  hiddenBoatIds: Set<string>;
  onToggleVisibility: (id: string) => void;
  onDeleteBoat?: (id: string) => void;
}

function BatteryIcon({ level }: { level: number }) {
  if (level <= 20) return <BatteryLow className="w-3.5 h-3.5 text-red-500" />;
  if (level <= 50) return <BatteryMedium className="w-3.5 h-3.5 text-yellow-500" />;
  return <BatteryFull className="w-3.5 h-3.5 text-green-500" />;
}

export default function BoatList({ boats, selectedBoatId, onSelectBoat, boatColorMap, hiddenBoatIds, onToggleVisibility, onDeleteBoat }: BoatListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (boats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="text-no-boats">
        <Ship className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No boats detected yet</p>
        <p className="text-xs text-muted-foreground mt-1">Waiting for MQTT data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid="boat-list">
      {boats.map((boat) => {
        const offline = isOffline(boat.positionTimestamp || boat.lastSeen);
        const color = boatColorMap.get(boat.id) || "#3b82f6";
        const isSelected = selectedBoatId === boat.id;
        const isHidden = hiddenBoatIds.has(boat.id);
        const isConfirmingDelete = confirmDeleteId === boat.id;

        return (
          <div
            key={boat.id}
            className={`
              flex items-center rounded-md transition-colors
              ${isSelected ? "bg-accent" : "hover-elevate"}
              ${isHidden ? "opacity-50" : ""}
            `}
          >
            <button
              data-testid={`button-boat-${boat.id}`}
              onClick={() => onSelectBoat(isSelected ? null : boat.id)}
              className="flex-1 text-left p-3 min-w-0"
            >
              <div className="flex items-center gap-2">
                {boat.logoUrl ? (
                  <img
                    src={boat.logoUrl}
                    alt={boat.shortName}
                    className="w-6 h-6 rounded-full shrink-0 object-cover"
                    style={{ border: `2px solid ${color}` }}
                    data-testid={`img-boat-logo-${boat.id}`}
                  />
                ) : (
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                )}
                <span className="text-sm font-medium truncate flex-1" data-testid={`text-boat-name-${boat.id}`}>
                  {boat.longName}
                </span>
                {boat.batteryLevel != null && (
                  <span className="flex items-center gap-0.5 text-xs" data-testid={`text-battery-${boat.id}`}>
                    <BatteryIcon level={boat.batteryLevel} />
                    <span className="text-muted-foreground">{boat.batteryLevel}%</span>
                  </span>
                )}
                <Badge
                  variant={offline ? "destructive" : "secondary"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {offline ? "OFF" : "ON"}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1 pl-5">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {getTimeSince(boat.positionTimestamp || boat.lastSeen)}
                </span>
                {boat.speed !== undefined && boat.speed > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {formatSpeed(boat.speed)}
                  </span>
                )}
              </div>
            </button>
            <div className="flex items-center shrink-0 mr-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(boat.id);
                }}
                data-testid={`button-toggle-visibility-${boat.id}`}
                title={isHidden ? "Show on map" : "Hide from map"}
              >
                {isHidden ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
              </Button>
              {onDeleteBoat ? (
                isConfirmingDelete ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBoat(boat.id);
                        setConfirmDeleteId(null);
                      }}
                      data-testid={`button-confirm-delete-${boat.id}`}
                    >
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                      data-testid={`button-cancel-delete-${boat.id}`}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(boat.id);
                    }}
                    data-testid={`button-delete-${boat.id}`}
                    title="Delete boat"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
