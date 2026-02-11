import { useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { Anchor, PanelLeftClose, PanelLeft, History } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import BoatMap from "@/components/BoatMap";
import BoatList from "@/components/BoatList";
import BoatInfoPanel from "@/components/BoatInfoPanel";
import StatusBar from "@/components/StatusBar";
import { useBoats } from "@/hooks/use-boats";
import { getBoatColor } from "@/lib/types";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { boats, selectedBoatId, selectedTrack, connected, mqttConnected, selectBoat } = useBoats();
  const [panelOpen, setPanelOpen] = useState(true);

  const boatColorMap = useMemo(() => {
    const map = new Map<string, string>();
    boats.forEach((b, i) => map.set(b.id, getBoatColor(i)));
    return map;
  }, [boats.map((b) => b.id).join(",")]);

  const trackPositions = useMemo(() => {
    return selectedTrack?.positions || [];
  }, [selectedTrack]);

  const selectedBoat = useMemo(() => {
    if (!selectedBoatId) return null;
    return boats.find((b) => b.id === selectedBoatId) || selectedTrack?.boat || null;
  }, [selectedBoatId, boats, selectedTrack]);

  const handleSelectBoat = useCallback(
    (id: string | null) => {
      selectBoat(id);
    },
    [selectBoat]
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background" data-testid="dashboard">
      {panelOpen && (
        <div className="w-80 shrink-0 border-r border-border flex flex-col bg-card h-full">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Anchor className="w-5 h-5 text-primary" />
                <h1 className="font-semibold text-base">Boat Tracker</h1>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setLocation("/history")}
                  data-testid="button-go-history"
                >
                  <History className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setPanelOpen(false)}
                  data-testid="button-close-sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="mt-3">
              <StatusBar
                connected={connected}
                mqttConnected={mqttConnected}
                boatCount={boats.length}
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2">
              <BoatList
                boats={boats}
                selectedBoatId={selectedBoatId}
                onSelectBoat={handleSelectBoat}
                boatColorMap={boatColorMap}
              />
            </div>
          </ScrollArea>

          {selectedBoat && (
            <div className="border-t border-border p-3">
              <BoatInfoPanel
                boat={selectedBoat}
                trackPositions={trackPositions}
                color={boatColorMap.get(selectedBoat.id) || "#3b82f6"}
                onClose={() => handleSelectBoat(null)}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex-1 relative">
        {!panelOpen && (
          <div className="absolute top-3 left-3 z-[1000]">
            <Button
              size="icon"
              variant="secondary"
              onClick={() => setPanelOpen(true)}
              data-testid="button-open-sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </Button>
          </div>
        )}

        {!panelOpen && (
          <div className="absolute bottom-4 left-4 z-[1000]">
            <div className="bg-card/90 backdrop-blur-sm rounded-md border border-card-border p-3">
              <StatusBar
                connected={connected}
                mqttConnected={mqttConnected}
                boatCount={boats.length}
              />
            </div>
          </div>
        )}

        <BoatMap
          boats={boats}
          selectedBoatId={selectedBoatId}
          trackPositions={trackPositions}
          onSelectBoat={handleSelectBoat}
          boatColorMap={boatColorMap}
        />
      </div>
    </div>
  );
}
