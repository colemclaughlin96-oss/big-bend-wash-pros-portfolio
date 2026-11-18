import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import QuoteForm from "./pages/QuoteForm";
import QuoteView from "./pages/QuoteView";
import Dashboard from "./pages/admin/Dashboard";
import Quotes from "./pages/admin/Quotes";
import Customers from "./pages/admin/Customers";
import CustomerDetail from "./pages/admin/CustomerDetail";
import NewQuote from "./pages/admin/NewQuote";
import Pricing from "./pages/admin/Pricing";
import Branding from "./pages/admin/Branding";
import Settings from "./pages/admin/Settings";
import Reports from "./pages/admin/Reports";

import TeamLogin from "@/pages/admin/TeamLogin";
import AcceptInvite from "@/pages/admin/AcceptInvite";
import Team from "@/pages/admin/Team";
import { useTeamAuth } from "@/hooks/useTeamAuth";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./components/DashboardLayoutSkeleton";

function AdminRoute({
  component: Component,
  adminOnly,
}: {
  component: React.ComponentType;
  adminOnly?: boolean;
}) {
  return (
    <DashboardLayout>
      {adminOnly ? <AdminOnly component={Component} /> : <Component />}
    </DashboardLayout>
  );
}

// Gate a page to admins only; members are redirected back to the dashboard.
function AdminOnly({ component: Component }: { component: React.ComponentType }) {
  const { loading, isAdmin } = useTeamAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!loading && !isAdmin) {
      setLocation("/admin");
    }
  }, [loading, isAdmin, setLocation]);
  if (loading || !isAdmin) return <DashboardLayoutSkeleton />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* Public customer-facing routes */}
      <Route path="/" component={Home} />
      <Route path="/quote" component={QuoteForm} />
      <Route path="/quote/:token" component={QuoteView} />

      {/* Team auth (standalone, not behind the dashboard guard) */}
      <Route path="/admin/login" component={TeamLogin} />
      <Route path="/admin/accept-invite" component={AcceptInvite} />

      {/* Admin app routes */}
      <Route path="/admin">{() => <AdminRoute component={Dashboard} />}</Route>
      <Route path="/admin/quotes">{() => <AdminRoute component={Quotes} />}</Route>
      <Route path="/admin/customers">{() => <AdminRoute component={Customers} />}</Route>
      <Route path="/admin/customers/:id">{() => <AdminRoute component={CustomerDetail} />}</Route>
      <Route path="/admin/new-quote">{() => <AdminRoute component={NewQuote} />}</Route>
      <Route path="/admin/reports">{() => <AdminRoute component={Reports} />}</Route>
      <Route path="/admin/team">{() => <AdminRoute component={Team} adminOnly />}</Route>
      <Route path="/admin/pricing">{() => <AdminRoute component={Pricing} adminOnly />}</Route>
      {/* Legacy paths now resolve to the unified Pricing screen */}
      <Route path="/admin/services">{() => <AdminRoute component={Pricing} adminOnly />}</Route>
      <Route path="/admin/tiers">{() => <AdminRoute component={Pricing} adminOnly />}</Route>
      <Route path="/admin/branding">{() => <AdminRoute component={Branding} adminOnly />}</Route>
      <Route path="/admin/connections">{() => <AdminRoute component={Settings} adminOnly />}</Route>
      <Route path="/admin/settings">{() => <AdminRoute component={Settings} adminOnly />}</Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
