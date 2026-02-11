import { useEffect, useState, useRef } from "react";
import { getSocket } from "@/lib/socket";

export default function Overlay() {
  const [currentPath, setCurrentPath] = useState("/");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const socket = getSocket();

    const handler = (data: { path: string }) => {
      setCurrentPath(data.path);
    };

    socket.on("overlay:navigate", handler);
    socket.emit("overlay:request-nav");

    return () => {
      socket.off("overlay:navigate", handler);
    };
  }, []);

  const separator = currentPath.includes("?") ? "&" : "?";
  const iframeSrc = `${currentPath}${separator}overlay=1`;

  return (
    <div
      className="w-screen h-screen overflow-hidden"
      style={{ background: "#000" }}
      data-testid="overlay-container"
    >
      <iframe
        key={iframeSrc}
        ref={iframeRef}
        src={iframeSrc}
        className="w-full h-full border-0"
        data-testid="overlay-iframe"
        style={{ pointerEvents: "none" }}
      />
    </div>
  );
}
