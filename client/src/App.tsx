import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
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
      <Route path="/">
        {isAuthenticated ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}
      </Route>
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
