import { useEffect, useLayoutEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";

const getPageTitle = (path: string): string => {
  if (path === "/login") return "Login | NetworkCloud";
  if (path === "/link") return "Link Device | NetworkCloud";
  if (path === "/devices") return "Dashboard | NetworkCloud";
  if (path.startsWith("/devices/")) return "Device Details | NetworkCloud";
  if (path === "/agent-tokens") return "Agent Tokens | NetworkCloud";
  if (path === "/") return "NetworkCloud";
  return "Page Not Found | NetworkCloud";
};

import LoginPage from "@/pages/Login";
import DeviceLinkPage from "@/pages/DeviceLink";
import DeviceList from "@/pages/DeviceList";
import DeviceDetail from "@/pages/DeviceDetail";
import AgentTokens from "@/pages/AgentTokens";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  // Set page title immediately on route change (before paint)
  useLayoutEffect(() => {
    document.title = getPageTitle(location);
  }, [location]);

  // Handle redirect from root after login
  useEffect(() => {
    if (!isLoading && isAuthenticated && location === "/") {
      setLocation("/devices");
    }
  }, [isLoading, isAuthenticated, location, setLocation]);

  // Show loading while checking auth state on root
  if (isLoading && location === "/") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login">
        {isAuthenticated ? <Redirect to="/devices" /> : <LoginPage />}
      </Route>

      <Route path="/link">
        <DeviceLinkPage />
      </Route>
      
      <Route path="/devices">
        <ProtectedRoute component={DeviceList} />
      </Route>
      
      <Route path="/devices/:id">
        <ProtectedRoute component={DeviceDetail} />
      </Route>

      <Route path="/agent-tokens">
        <ProtectedRoute component={AgentTokens} />
      </Route>

      <Route path="/">
        {isAuthenticated ? (
          <Redirect to="/devices" />
        ) : (
          <Redirect to="/login" />
        )}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
