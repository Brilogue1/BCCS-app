import { Link, Redirect } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2, Building2, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// Planning Checklist task status to percentage mapping
const TASK_PROGRESS_MAP: Record<string, number> = {
  "review documents for completeness": 12.5,
  "send update email to client": 25,
  "code compliance review": 37.5,
  "stamp documents": 50,
  "notification to permit tech": 62.5,
  "send documents to client or permit tech": 75,
  "invoice project": 87.5,
  "completed": 100,
};

// Get progress percentage from planning checklist value
function getProgressPercentage(planningChecklist: string | null | undefined): number {
  if (!planningChecklist) return 0;
  
  const normalizedValue = planningChecklist.toLowerCase().trim();
  
  // Check for exact or partial matches
  for (const [task, percentage] of Object.entries(TASK_PROGRESS_MAP)) {
    if (normalizedValue.includes(task) || task.includes(normalizedValue)) {
      return percentage;
    }
  }
  
  // Check for partial matches (e.g., "CODE COMPLIA" should match "code compliance review")
  if (normalizedValue.includes("review") && normalizedValue.includes("document")) return 12.5;
  if (normalizedValue.includes("email") && normalizedValue.includes("client")) return 25;
  if (normalizedValue.includes("code") && normalizedValue.includes("compli")) return 37.5;
  if (normalizedValue.includes("stamp")) return 50;
  if (normalizedValue.includes("notification") && normalizedValue.includes("permit")) return 62.5;
  if (normalizedValue.includes("send") && normalizedValue.includes("document")) return 75;
  if (normalizedValue.includes("invoice")) return 87.5;
  if (normalizedValue.includes("complete")) return 100;
  
  return 0;
}

// Get progress color based on percentage
function getProgressColor(percentage: number): string {
  if (percentage === 100) return "bg-green-600";
  if (percentage >= 75) return "bg-blue-600";
  if (percentage >= 50) return "bg-yellow-500";
  if (percentage >= 25) return "bg-orange-500";
  return "bg-slate-400";
}

// Get status badge based on percentage
function getStatusBadge(percentage: number): { label: string; className: string; icon: typeof CheckCircle2 } {
  if (percentage === 100) return { label: "Completed", className: "bg-green-100 text-green-700", icon: CheckCircle2 };
  if (percentage >= 50) return { label: "In Progress", className: "bg-blue-100 text-blue-700", icon: Clock };
  if (percentage > 0) return { label: "Started", className: "bg-yellow-100 text-yellow-700", icon: Clock };
  return { label: "Not Started", className: "bg-slate-100 text-slate-600", icon: AlertCircle };
}

export default function AdminProjectsReport() {
  const { user, loading: authLoading } = useAuth();
  const { data: projects, isLoading } = trpc.projects.list.useQuery();

  // Redirect non-admin users
  if (!authLoading && user?.role !== 'admin') {
    return <Redirect to="/dashboard" />;
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Calculate progress for each project
  const projectsWithProgress = (projects || []).map(project => ({
    ...project,
    progress: getProgressPercentage(project.planningChecklist),
  })).sort((a, b) => b.progress - a.progress); // Sort by progress descending

  // Calculate summary stats
  const totalProjects = projectsWithProgress.length;
  const completedProjects = projectsWithProgress.filter(p => p.progress === 100).length;
  const inProgressProjects = projectsWithProgress.filter(p => p.progress > 0 && p.progress < 100).length;
  const notStartedProjects = projectsWithProgress.filter(p => p.progress === 0).length;
  const averageProgress = totalProjects > 0 
    ? Math.round(projectsWithProgress.reduce((sum, p) => sum + p.progress, 0) / totalProjects)
    : 0;

  // Group by stage
  const projectsByStage = projectsWithProgress.reduce((acc, project) => {
    const stage = project.stage || 'Unknown';
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(project);
    return acc;
  }, {} as Record<string, typeof projectsWithProgress>);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo(1).png" alt="BCCS" className="h-10 w-10" />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Project Progress Report</h1>
                <p className="text-sm text-slate-600">All projects with completion status</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Total Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{totalProjects}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completedProjects}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">In Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{inProgressProjects}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Not Started</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-500">{notStartedProjects}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Avg Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{averageProgress}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Progress Legend */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Planning Checklist Progress Steps</CardTitle>
            <CardDescription>Progress is calculated based on the Planning Checklist status from the spreadsheet</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(TASK_PROGRESS_MAP).map(([task, percentage]) => (
                <div key={task} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getProgressColor(percentage)}`} />
                  <span className="text-sm text-slate-700 capitalize">{task}</span>
                  <span className="text-xs text-slate-500">({percentage}%)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Projects List */}
        <Card>
          <CardHeader>
            <CardTitle>All Projects</CardTitle>
            <CardDescription>Sorted by progress (highest first)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {projectsWithProgress.map((project) => {
                const status = getStatusBadge(project.progress);
                const StatusIcon = status.icon;
                
                return (
                  <div 
                    key={project.id} 
                    className="border rounded-lg p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3">
                        <Building2 className="h-5 w-5 text-slate-400 mt-1" />
                        <div>
                          <Link href={`/projects/${project.id}`}>
                            <h3 className="font-semibold text-slate-900 hover:text-blue-600 cursor-pointer">
                              {project.opportunityName}
                            </h3>
                          </Link>
                          <p className="text-sm text-slate-500">
                            {project.address || 'No address provided'}
                          </p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                            <span>Stage: <strong>{project.stage || 'Unknown'}</strong></span>
                            <span>Contact: {project.contactName || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${status.className}`}>
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600">
                          Current Task: <strong className="capitalize">{project.planningChecklist || 'Not started'}</strong>
                        </span>
                        <span className="font-semibold text-slate-900">{project.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all ${getProgressColor(project.progress)}`}
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {projectsWithProgress.length === 0 && (
                <p className="text-slate-500 text-center py-8">No projects found</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Projects by Stage Summary */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Progress by Stage</CardTitle>
            <CardDescription>Average progress for each pipeline stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(projectsByStage)
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([stage, stageProjects]) => {
                  const avgProgress = Math.round(
                    stageProjects.reduce((sum, p) => sum + p.progress, 0) / stageProjects.length
                  );
                  
                  return (
                    <div key={stage}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-slate-700">
                          {stage} ({stageProjects.length} projects)
                        </span>
                        <span className="text-sm font-semibold text-slate-900">{avgProgress}% avg</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getProgressColor(avgProgress)}`}
                          style={{ width: `${avgProgress}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
