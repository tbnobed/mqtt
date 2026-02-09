import { Wifi, WifiOff, Radio } from "lucide-react";

interface StatusBarProps {
  connected: boolean;
  mqttConnected: boolean;
  boatCount: number;
}

export default function StatusBar({ connected, mqttConnected, boatCount }: StatusBarProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap" data-testid="status-bar">
      <div className="flex items-center gap-1.5">
        {connected ? (
          <Wifi className="w-3.5 h-3.5 text-status-online" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-status-busy" />
        )}
        <span className="text-xs text-muted-foreground">
          {connected ? "Live" : "Disconnected"}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Radio className={`w-3.5 h-3.5 ${mqttConnected ? "text-status-online" : "text-status-offline"}`} />
        <span className="text-xs text-muted-foreground">
          MQTT {mqttConnected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {boatCount} boat{boatCount !== 1 ? "s" : ""} tracked
      </span>
    </div>
  );
}
