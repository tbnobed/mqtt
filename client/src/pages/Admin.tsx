import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, UserPlus, Trash2, Shield, User as UserIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface UserData {
  id: number;
  username: string;
  role: "admin" | "user";
  createdAt: string;
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const { user: currentUser } = useAuth();
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [error, setError] = useState("");

  const { data: users = [], isLoading } = useQuery<UserData[]>({
    queryKey: ["/api/auth/users"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; role: string }) => {
      const res = await apiRequest("POST", "/api/auth/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      setError("");
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to create user";
      const cleaned = msg.replace(/^\d+:\s*/, "");
      try {
        setError(JSON.parse(cleaned).error || cleaned);
      } catch {
        setError(cleaned);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/auth/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      await apiRequest("PATCH", `/api/auth/users/${id}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
    },
  });

  return (
    <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto" data-testid="admin-page">
      <div className="flex items-center gap-3 mb-6">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setLocation("/")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold">User Management</h1>
      </div>

      <Card className="p-4 mb-6">
        <h2 className="text-sm font-semibold mb-3">Add New User</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate({ username: newUsername, password: newPassword, role: newRole });
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1 flex-1 min-w-[140px]">
            <Label htmlFor="new-username" className="text-xs">Username</Label>
            <Input
              id="new-username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Username"
              data-testid="input-new-username"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[140px]">
            <Label htmlFor="new-password" className="text-xs">Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Password"
              data-testid="input-new-password"
            />
          </div>
          <div className="space-y-1 w-[100px]">
            <Label className="text-xs">Role</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as "admin" | "user")}>
              <SelectTrigger data-testid="select-new-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            disabled={createMutation.isPending || !newUsername || !newPassword}
            data-testid="button-create-user"
          >
            <UserPlus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </form>
        {error && <p className="text-sm text-destructive mt-2" data-testid="text-create-error">{error}</p>}
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Users ({users.length})</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => {
              const isSelf = u.id === currentUser?.id;
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
                  data-testid={`user-row-${u.id}`}
                >
                  {u.role === "admin" ? (
                    <Shield className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <UserIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm font-medium flex-1 truncate" data-testid={`text-user-${u.id}`}>
                    {u.username}
                    {isSelf && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                  </span>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                    {u.role}
                  </Badge>
                  {!isSelf && (
                    <>
                      <Select
                        value={u.role}
                        onValueChange={(role) => roleMutation.mutate({ id: u.id, role })}
                      >
                        <SelectTrigger className="w-[90px] h-7 text-xs" data-testid={`select-role-${u.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => deleteMutation.mutate(u.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-user-${u.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
