import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTeamAuth } from "@/hooks/useTeamAuth";
import { trpc } from "@/lib/trpc";
import { Check, Copy, Loader2, Mail, ShieldAlert, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Role = "admin" | "member";

export default function Team() {
  const { user: me, isAdmin } = useTeamAuth();
  const utils = trpc.useUtils();
  const listQuery = trpc.team.list.useQuery(undefined, { enabled: isAdmin });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = trpc.team.invite.useMutation({
    onSuccess: (res) => {
      setInviteUrl(res.inviteUrl);
      utils.team.list.invalidate();
      toast.success("Invite created — copy the link below to share it.");
    },
    onError: (e) => toast.error(e.message),
  });

  const resend = trpc.team.resendInvite.useMutation({
    onSuccess: (res) => {
      navigator.clipboard?.writeText(res.inviteUrl);
      toast.success("New invite link copied to clipboard.");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateRole = trpc.team.updateRole.useMutation({
    onSuccess: () => {
      utils.team.list.invalidate();
      toast.success("Role updated.");
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = trpc.team.remove.useMutation({
    onSuccess: () => {
      utils.team.list.invalidate();
      toast.success("Member removed.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Admins only</p>
              <p className="text-sm text-muted-foreground">
                You need an admin role to manage team members. Ask an existing admin for access.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const resetInviteForm = () => {
    setEmail("");
    setName("");
    setRole("member");
    setInviteUrl(null);
    setCopied(false);
  };

  const copyLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard?.writeText(inviteUrl);
    setCopied(true);
    toast.success("Invite link copied.");
    setTimeout(() => setCopied(false), 1500);
  };

  const members = listQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Invite teammates and control who can access the dashboard.
          </p>
        </div>
        <Button onClick={() => { resetInviteForm(); setInviteOpen(true); }}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite member
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
          <CardDescription>
            Admins manage settings, pricing, and the team. Members can take calls, build quotes, and view customers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const isMe = me?.id === m.id;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.name || "—"}
                        {isMe && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.email}</TableCell>
                      <TableCell>
                        <Select
                          value={m.role}
                          onValueChange={(v) => updateRole.mutate({ id: m.id, role: v as Role })}
                          disabled={isMe}
                        >
                          <SelectTrigger className="h-8 w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {m.status === "active" ? (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-300">Invited</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {m.status === "invited" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resend.mutate({ id: m.id, origin: window.location.origin })}
                              disabled={resend.isPending}
                              title="Copy a fresh invite link"
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          )}
                          {!isMe && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Remove ${m.name || m.email}?`)) {
                                  remove.mutate({ id: m.id });
                                }
                              }}
                              disabled={remove.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {members.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No team members yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) resetInviteForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a team member</DialogTitle>
            <DialogDescription>
              We'll generate a secure invite link to share. They set their own password when they accept.
            </DialogDescription>
          </DialogHeader>

          {!inviteUrl ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-name">Name (optional)</Label>
                <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member — quotes & customers</SelectItem>
                    <SelectItem value="admin">Admin — full access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Share this link with <span className="font-medium text-foreground">{email}</span>. It expires in 7 days.
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={inviteUrl} className="font-mono text-xs" />
                <Button size="icon" variant="outline" className="bg-background shrink-0" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            {!inviteUrl ? (
              <Button
                onClick={() => invite.mutate({ email, name: name || undefined, role, origin: window.location.origin })}
                disabled={invite.isPending || !email}
              >
                {invite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create invite
              </Button>
            ) : (
              <Button variant="outline" className="bg-background" onClick={() => { setInviteOpen(false); resetInviteForm(); }}>
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
