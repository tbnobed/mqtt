import { Ship, Clock, Eye, EyeOff } from "lucide-react";
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
}

export default function BoatList({ boats, selectedBoatId, onSelectBoat, boatColorMap, hiddenBoatIds, onToggleVisibility }: BoatListProps) {
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
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0 mr-1"
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(boat.id);
              }}
              data-testid={`button-toggle-visibility-${boat.id}`}
              title={isHidden ? "Show on map" : "Hide from map"}
            >
              {isHidden ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
