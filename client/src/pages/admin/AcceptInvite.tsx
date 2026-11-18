import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Loader2 } from "lucide-react";

export default function AcceptInvite() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = useMemo(() => new URLSearchParams(search).get("token") ?? "", [search]);
  const { data: brand } = trpc.settings.getPublic.useQuery();
  const utils = trpc.useUtils();
  const company = brand?.companyName ?? "Big Bend Wash Pros";
  const primary = brand?.primaryColor ?? "#3FA34D";

  const inviteQuery = trpc.team.getInvite.useQuery(
    { token },
    { enabled: token.length > 0, retry: false }
  );

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const accept = trpc.team.acceptInvite.useMutation({
    onSuccess: async () => {
      await utils.team.me.invalidate();
      setLocation("/admin");
    },
    onError: (e) => setError(e.message || "Could not accept invite"),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    accept.mutate({ token, name, password });
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="relative flex items-center justify-center min-h-screen overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-emerald-100/60 px-4">
      <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full blur-3xl opacity-40" style={{ background: primary }} />
      <div className="relative w-full max-w-sm rounded-2xl border bg-white/90 backdrop-blur shadow-xl p-8 flex flex-col">
        {children}
      </div>
    </div>
  );

  if (!token) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Invalid invite link</h1>
        <p className="mt-2 text-sm text-muted-foreground">This link is missing its token. Ask your admin to resend the invite.</p>
      </Shell>
    );
  }

  if (inviteQuery.isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  const invite = inviteQuery.data;
  if (!invite || invite.expired) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">{invite?.expired ? "Invite expired" : "Invite not found"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {invite?.expired
            ? "This invite has expired. Ask an admin to resend it."
            : "This invite link is no longer valid. It may have already been used."}
        </p>
        <Button variant="outline" className="mt-4 bg-background" onClick={() => setLocation("/admin/login")}>
          Go to sign in
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col items-center text-center mb-6">
        {brand?.logoUrl ? (
          <img src={brand.logoUrl} alt={company} className="h-14 w-14 rounded-xl object-contain mb-3" />
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight">Join {company}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Setting up your account for <span className="font-medium text-foreground">{invite.email}</span>
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Create password</Label>
          <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" disabled={accept.isPending} className="w-full text-white" style={{ background: primary }}>
          {accept.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Activate account
        </Button>
      </form>
    </Shell>
  );
}
