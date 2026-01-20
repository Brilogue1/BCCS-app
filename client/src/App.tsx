import { Toaster } from "@/components/ui/sonner";
// Updated: Force publish latest version with admin access fixes
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AdminProjectsReport from "./pages/AdminProjectsReport";
import StaffWorkload from "./pages/StaffWorkload";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import { useAuth } from "./_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component, ...rest }: { component: React.ComponentType; path: string }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/projects/:id">
        {(params) => <ProtectedRoute component={ProjectDetail} path={`/projects/${params.id}`} />}
      </Route>
      <Route path="/projects">
        <ProtectedRoute component={Projects} path="/projects" />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} path="/dashboard" />
      </Route>
      <Route path="/admin">
        <ProtectedRoute component={AdminDashboard} path="/admin" />
      </Route>
      <Route path="/admin/projects">
        <ProtectedRoute component={AdminProjectsReport} path="/admin/projects" />
      </Route>
      <Route path="/admin/workload">
        <ProtectedRoute component={StaffWorkload} path="/admin/workload" />
      </Route>
      <Route path="/">
        {isAuthenticated ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // EMERGENCY v4 - FORCE PUBLISH NOW - Client review in 10min - All 19 projects must show
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

// FORCE DEPLOY v5 - Custom domain must show all 19 projects NOW
export default App;
