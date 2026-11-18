import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function TeamLogin() {
  const [, setLocation] = useLocation();
  const { data: brand } = trpc.settings.getPublic.useQuery();
  const utils = trpc.useUtils();
  const company = brand?.companyName ?? "Big Bend Wash Pros";
  const primary = brand?.primaryColor ?? "#3FA34D";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = trpc.team.login.useMutation({
    onSuccess: async () => {
      await utils.team.me.invalidate();
      setLocation("/admin");
    },
    onError: (e) => setError(e.message || "Login failed"),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate({ email, password });
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-emerald-100/60 px-4">
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full blur-3xl opacity-40"
        style={{ background: primary }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full blur-3xl opacity-30"
        style={{ background: brand?.accentColor ?? "#5E8DB7" }}
      />
      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-sm rounded-2xl border bg-white/90 backdrop-blur shadow-xl p-8 flex flex-col"
      >
        <div className="flex flex-col items-center text-center mb-6">
          {brand?.logoUrl ? (
            <img src={brand.logoUrl} alt={company} className="h-16 w-16 rounded-xl object-contain mb-4" />
          ) : (
            <div
              className="h-16 w-16 rounded-xl mb-4 flex items-center justify-center text-2xl font-semibold text-white"
              style={{ background: primary }}
            >
              {company.charAt(0)}
            </div>
          )}
          <h1 className="text-xl font-semibold tracking-tight">{company}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Team Dashboard sign in</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            size="lg"
            disabled={login.isPending}
            className="w-full text-white shadow-lg hover:shadow-xl transition-all"
            style={{ background: primary }}
          >
            {login.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign in
          </Button>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Access is invite-only. Ask an admin to invite you if you don't have an account.
        </p>
      </form>
    </div>
  );
}
