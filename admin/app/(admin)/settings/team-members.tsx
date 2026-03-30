"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getApoyoApiBase } from "@/lib/api-base";
import { UserPlus, Shield, User, Trash2 } from "lucide-react";

interface Member {
  id: string;
  org_id: string;
  user_id: string;
  email: string | null;
  role: "admin" | "member";
  status: "active" | "pending";
  created_at: string;
}

export function OrgTeamMembers({
  slug,
  role: userRole,
}: {
  slug: string;
  role: "admin" | "member";
}) {
  const { getToken } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const isAdmin = userRole === "admin";

  const fetchMembers = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(
        `${getApoyoApiBase()}/admin/orgs/${slug}/members`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) setMembers(await res.json());
    } finally {
      setLoading(false);
    }
  }, [getToken, slug]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${getApoyoApiBase()}/admin/orgs/${slug}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
        },
      );
      if (!res.ok) {
        const body = await res.json();
        toast.error(body.error ?? "Failed to invite member");
        return;
      }
      toast.success(`Invited ${inviteEmail.trim()}`);
      setInviteEmail("");
      setInviteRole("member");
      fetchMembers();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setInviting(false);
    }
  }

  async function updateRole(userId: string, role: "admin" | "member") {
    const token = await getToken();
    const res = await fetch(
      `${getApoyoApiBase()}/admin/orgs/${slug}/members/${userId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      },
    );
    if (!res.ok) {
      const body = await res.json();
      toast.error(body.error ?? "Failed to update role");
      return;
    }
    toast.success("Role updated");
    fetchMembers();
  }

  async function removeMember(userId: string) {
    const token = await getToken();
    const res = await fetch(
      `${getApoyoApiBase()}/admin/orgs/${slug}/members/${userId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      const body = await res.json();
      toast.error(body.error ?? "Failed to remove member");
      return;
    }
    toast.success("Member removed");
    setConfirmRemove(null);
    fetchMembers();
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Invite Team Member</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={inviteMember} className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="invite-email" className="text-muted-foreground text-xs">
                  Email
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  required
                />
              </div>
              <div className="w-32 space-y-1.5">
                <Label className="text-muted-foreground text-xs">Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as "admin" | "member")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={inviting} className="text-xs">
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                {inviting ? "Inviting\u2026" : "Invite"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Members ({members.filter((m) => m.status === "active").length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium">
                        {(member.email ?? member.user_id).charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm">
                        {member.email ?? member.user_id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {member.role === "admin" ? (
                        <Shield className="h-3.5 w-3.5 text-amber-400" />
                      ) : (
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {isAdmin ? (
                        <Select
                          value={member.role}
                          onValueChange={(v) =>
                            updateRole(member.user_id, v as "admin" | "member")
                          }
                        >
                          <SelectTrigger className="h-7 w-24 text-xs border-none shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs capitalize">{member.role}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {member.status === "pending" ? (
                      <Badge variant="secondary" className="text-xs">
                        pending
                      </Badge>
                    ) : (
                      <Badge variant="default" className="text-xs">
                        active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(member.created_at).toLocaleDateString()}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {confirmRemove === member.user_id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-xs text-muted-foreground">Remove?</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeMember(member.user_id)}
                            className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7"
                          >
                            Yes
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmRemove(null)}
                            className="text-xs text-muted-foreground hover:text-foreground h-7"
                          >
                            No
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmRemove(member.user_id)}
                          className="text-xs text-muted-foreground hover:text-muted-foreground/80 h-7"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!loading && members.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 5 : 4}
                    className="text-muted-foreground text-sm text-center py-8"
                  >
                    No team members yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
