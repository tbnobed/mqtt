import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";

export function useOverlayNavReceiver(onNavigate: (data: { path: string }) => void) {
  const callbackRef = useRef(onNavigate);
  callbackRef.current = onNavigate;

  useEffect(() => {
    const socket = getSocket();
    const handler = (data: { path: string }) => {
      callbackRef.current(data);
    };
    socket.on("overlay:navigate", handler);
    socket.emit("overlay:request-nav");

    return () => {
      socket.off("overlay:navigate", handler);
    };
  }, []);
}
