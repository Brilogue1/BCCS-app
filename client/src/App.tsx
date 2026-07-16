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
import EmployeeReport from "./pages/EmployeeReport";
import PlansUpload from "./pages/PlansUpload";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import { useAuth } from "./_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

// TEMPORARY MAINTENANCE FLAG — set to false to re-enable for all users
const MAINTENANCE_MODE = false;

function MaintenanceScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg p-12 max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Update in Progress</h1>
          <p className="text-gray-500 text-base">Please check back shortly.</p>
        </div>
        <div className="text-sm text-gray-400">BCCS Client Portal</div>
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component, ...rest }: { component: React.ComponentType; path: string }) {
  const { isAuthenticated, loading, user } = useAuth();

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

  // Show maintenance screen for non-admins when maintenance mode is on
  if (MAINTENANCE_MODE && user?.role !== 'admin') {
    return <MaintenanceScreen />;
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
      <Route path="/admin/employee-report">
        <ProtectedRoute component={EmployeeReport} path="/admin/employee-report" />
      </Route>
      <Route path="/plans-upload">
        <ProtectedRoute component={PlansUpload} path="/plans-upload" />
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
