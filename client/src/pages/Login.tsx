import { useState } from "react";
import { LogIn } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import sfcLogo from "../assets/sfc_logo.png";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login, loginPending } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login({ username, password });
    } catch (err: any) {
      const msg = err?.message || "Login failed";
      const cleaned = msg.replace(/^\d+:\s*/, "").replace(/^"(.*)"$/, "$1");
      try {
        const parsed = JSON.parse(cleaned);
        setError(parsed.error || cleaned);
      } catch {
        setError(cleaned);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="login-page">
      <Card className="w-full max-w-sm p-6 space-y-6">
        <div className="flex flex-col items-center gap-2">
          <img src={sfcLogo} alt="SFC Logo" className="h-16 object-contain" data-testid="img-login-logo" />
          <h1 className="text-xl font-bold">Boat GPS Tracker</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              data-testid="input-username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              data-testid="input-password"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" data-testid="text-login-error">{error}</p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={loginPending || !username || !password}
            data-testid="button-login"
          >
            {loginPending ? "Signing in..." : (
              <>
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </>
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}
