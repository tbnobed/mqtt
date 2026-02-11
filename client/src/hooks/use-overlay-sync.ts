import { useEffect, useRef, useCallback } from "react";
import type { OverlayState } from "@/lib/types";

const CHANNEL_NAME = "boat-tracker-overlay";

export function useOverlayController() {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel(CHANNEL_NAME);
    return () => {
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  const sendState = useCallback((state: OverlayState) => {
    channelRef.current?.postMessage(state);
  }, []);

  return { sendState };
}

export function useOverlayReceiver(onState: (state: OverlayState) => void) {
  const callbackRef = useRef(onState);
  callbackRef.current = onState;

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<OverlayState>) => {
      callbackRef.current(event.data);
    };
    return () => channel.close();
  }, []);
}
