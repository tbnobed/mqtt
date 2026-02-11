import { useMemo, useCallback, useState } from "react";
import BoatMap from "@/components/BoatMap";
import { useBoats } from "@/hooks/use-boats";
import { useOverlayReceiver } from "@/hooks/use-overlay-sync";
import { getBoatColor } from "@/lib/types";
import type { OverlayState } from "@/lib/types";

export default function Overlay() {
  const { boats, selectedBoatId, selectedTrack, selectBoat } = useBoats();
  const [controlledCenter, setControlledCenter] = useState<[number, number]>([33.63, -117.89]);
  const [controlledZoom, setControlledZoom] = useState(12);

  useOverlayReceiver(useCallback((state: OverlayState) => {
    setControlledCenter(state.center);
    setControlledZoom(state.zoom);
    if (state.selectedBoatId !== selectedBoatId) {
      selectBoat(state.selectedBoatId);
    }
  }, [selectBoat, selectedBoatId]));

  const boatColorMap = useMemo(() => {
    const map = new Map<string, string>();
    boats.forEach((b, i) => map.set(b.id, getBoatColor(i)));
    return map;
  }, [boats.map((b) => b.id).join(",")]);

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
      <BoatMap
        boats={boats}
        selectedBoatId={selectedBoatId}
        trackPositions={trackPositions}
        onSelectBoat={noop}
        boatColorMap={boatColorMap}
        viewOnly
        controlledCenter={controlledCenter}
        controlledZoom={controlledZoom}
      />
    </div>
  );
}
