import { useEffect, useRef, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import type { OverlayState } from "@/lib/types";

export function useOverlayController() {
  const sendState = useCallback((state: OverlayState) => {
    const socket = getSocket();
    socket.emit("overlay:state", state);
  }, []);

  return { sendState };
}

export function useOverlayReceiver(onState: (state: OverlayState) => void) {
  const callbackRef = useRef(onState);
  callbackRef.current = onState;

  useEffect(() => {
    const socket = getSocket();
    const handler = (state: OverlayState) => {
      callbackRef.current(state);
    };
    socket.on("overlay:state", handler);

    socket.emit("overlay:request");

    return () => {
      socket.off("overlay:state", handler);
    };
  }, []);
}
