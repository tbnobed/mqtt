import { Ship, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BoatData } from "@/lib/types";
import { isOffline, getTimeSince, formatSpeed } from "@/lib/types";

interface BoatListProps {
  boats: BoatData[];
  selectedBoatId: string | null;
  onSelectBoat: (id: string | null) => void;
  boatColorMap: Map<string, string>;
}

export default function BoatList({ boats, selectedBoatId, onSelectBoat, boatColorMap }: BoatListProps) {
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

        return (
          <button
            key={boat.id}
            data-testid={`button-boat-${boat.id}`}
            onClick={() => onSelectBoat(isSelected ? null : boat.id)}
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
        );
      })}
    </div>
  );
}
