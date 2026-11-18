import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/format";
import { Link } from "wouter";
import { Loader2, Search, Users, ChevronRight } from "lucide-react";

export default function Customers() {
  const [search, setSearch] = useState("");
  const { data: customers, isLoading } = trpc.quotes.customers.useQuery(
    search.trim() ? { search: search.trim() } : undefined,
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold">Customers</h1>
        <p className="text-muted-foreground">
          Everyone who has requested a quote.
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone…"
          className="w-full rounded-lg border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !customers || customers.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Users className="mx-auto mb-3 h-8 w-8 opacity-40" />
            No customers yet.
          </div>
        ) : (
          <div className="divide-y">
            {customers.map((c) => (
              <Link
                key={c.id}
                href={`/admin/customers/${c.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary font-semibold">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.email || c.phone || "No contact info"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 shrink-0 text-sm">
                  <div className="hidden sm:block text-right">
                    <div className="font-medium">{c.quoteCount} quotes</div>
                    <div className="text-xs text-muted-foreground">
                      {c.acceptedCount} accepted
                    </div>
                  </div>
                  <div className="hidden md:block text-right text-xs text-muted-foreground">
                    {c.lastQuoteAt ? formatDate(c.lastQuoteAt) : "—"}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
