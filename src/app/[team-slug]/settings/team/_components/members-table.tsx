"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";

interface Member {
  id: string;
  authId: string | null;
  email: string;
  name: string | null;
  role: "ADMIN" | "MEMBER" | "SUPER_ADMIN";
  status: "ACTIVE" | "PENDING";
  joinedAt: Date;
}

interface MembersTableProps {
  members: Member[];
  currentUserAuthId: string | null;
  currentUserRole: "ADMIN" | "MEMBER" | "SUPER_ADMIN";
  onChanged?: () => void;
  teamSlug: string;
}

export function MembersTable({
  members,
  currentUserAuthId,
  currentUserRole,
  onChanged,
  teamSlug,
}: MembersTableProps) {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmMember, setConfirmMember] = useState<Member | null>(null);
  const [roleMember, setRoleMember] = useState<Member | null>(null);
  const [selectedRole, setSelectedRole] = useState<
    "ADMIN" | "MEMBER" | "SUPER_ADMIN"
  >("MEMBER");
  const [savingRole, setSavingRole] = useState(false);
  const [openMenuForId, setOpenMenuForId] = useState<string | null>(null);

  const canChangeRole = (member: Member) => {
    if (currentUserRole === "MEMBER") return false;
    const superAdminCount = members.filter(
      (m) => m.role === "SUPER_ADMIN",
    ).length;
    if (member.role === "SUPER_ADMIN" && superAdminCount <= 1) return false;
    if (currentUserRole === "ADMIN") return member.role === "MEMBER";
    return true; // SUPER_ADMIN can change any
  };

  const handleRemove = async (member: Member) => {
    setRemovingId(member.id);
    try {
      const params = new URLSearchParams();
      params.set("id", member.id);
      params.set("authId", member.authId ?? "null");
      params.set("email", member.email);

      const res = await fetch(`/api/user/delete-user?${params.toString()}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = (await res
          .json()
          .catch(() => ({}) as Record<string, unknown>)) as {
          error?: string;
        };
        throw new Error(err.error || "Failed to remove member");
      }
      toast.success("Member removed");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>
                      {member.name
                        ? member.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                        : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {member.name || "Pending Invite"}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {member.email}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    member.role === "ADMIN" || member.role === "SUPER_ADMIN"
                      ? "default"
                      : "secondary"
                  }
                >
                  {member.role === "SUPER_ADMIN" ? "SUPER ADMIN" : member.role}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={member.status === "ACTIVE" ? "default" : "secondary"}
                >
                  {member.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(member.joinedAt, "MMM d, yyyy")}
              </TableCell>
              <TableCell>
                <DropdownMenu
                  open={openMenuForId === member.id}
                  onOpenChange={(open) =>
                    setOpenMenuForId(open ? member.id : null)
                  }
                >
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={!canChangeRole(member)}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (!canChangeRole(member)) return;
                        setRoleMember(member);
                        setSelectedRole(member.role);
                        setOpenMenuForId(null);
                      }}
                    >
                      Change Role
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600"
                      disabled={
                        currentUserRole === "MEMBER" ||
                        (member.authId !== null &&
                          currentUserAuthId === member.authId) ||
                        (member.role !== "MEMBER" &&
                          currentUserRole !== "SUPER_ADMIN")
                      }
                      onSelect={(e) => {
                        e.preventDefault();
                        setConfirmMember(member);
                        setOpenMenuForId(null);
                      }}
                    >
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Remove confirmation */}
      <AlertDialog
        open={!!confirmMember}
        onOpenChange={(open) => {
          if (!open) setConfirmMember(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {confirmMember?.name || confirmMember?.email}{" "}
              from the team. If this user has an active account, they will be
              removed from the organization. Any pending invitations will be
              revoked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmMember) handleRemove(confirmMember);
              }}
              disabled={confirmMember ? removingId === confirmMember.id : false}
              className="bg-red-600 hover:bg-red-600/90"
            >
              {confirmMember && removingId === confirmMember.id
                ? "Removing..."
                : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Role dialog */}
      <Dialog
        open={!!roleMember}
        onOpenChange={(open) => {
          if (!open) setRoleMember(null);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update {roleMember?.name || roleMember?.email}&apos;s role in the
              team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Select
              value={selectedRole}
              onValueChange={(val) =>
                setSelectedRole(val as "ADMIN" | "MEMBER" | "SUPER_ADMIN")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem
                  value="ADMIN"
                  disabled={
                    currentUserRole === "ADMIN" && roleMember?.role !== "MEMBER"
                  }
                >
                  Admin
                </SelectItem>
                <SelectItem
                  value="SUPER_ADMIN"
                  disabled={
                    currentUserRole !== "SUPER_ADMIN" ||
                    // Prevent selecting SUPER_ADMIN if this would be the last super admin demotion scenario
                    (roleMember?.role === "SUPER_ADMIN" &&
                      members.filter((m) => m.role === "SUPER_ADMIN").length <=
                        1)
                  }
                >
                  Super Admin
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRoleMember(null)}
              disabled={savingRole}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!roleMember) return;
                setSavingRole(true);
                try {
                  const res = await fetch("/api/team/update-member-role", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      teamSlug,
                      memberUserId: roleMember.id,
                      newRole: selectedRole,
                    }),
                  });
                  if (!res.ok) {
                    const err = (await res
                      .json()
                      .catch(() => ({}) as Record<string, unknown>)) as {
                      error?: string;
                    };
                    throw new Error(err.error || "Failed to update role");
                  }
                  toast.success("Role updated");
                  onChanged?.();
                  setRoleMember(null);
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Failed to update role",
                  );
                } finally {
                  setSavingRole(false);
                }
              }}
              disabled={
                savingRole ||
                !roleMember ||
                selectedRole === roleMember.role ||
                // Prevent demoting the last super admin
                (roleMember.role === "SUPER_ADMIN" &&
                  selectedRole !== "SUPER_ADMIN" &&
                  members.filter((m) => m.role === "SUPER_ADMIN").length <= 1)
              }
            >
              {savingRole ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
