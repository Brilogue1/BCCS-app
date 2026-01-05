import { Link, Redirect } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Users, CheckCircle2, Loader2, BarChart3 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();

  const { data: analytics, isLoading } = trpc.adminDashboard.analytics.useQuery({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

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

  const inspectorEntries = Object.entries(analytics?.inspectorWorkload || {})
    .filter(([name]) => name !== 'Unassigned')
    .sort(([, a], [, b]) => b - a);

  const permitTechEntries = Object.entries(analytics?.permitTechWorkload || {})
    .filter(([name]) => name !== 'Unassigned')
    .sort(([, a], [, b]) => b - a);

  const plansExaminerEntries = Object.entries(analytics?.plansExaminerWorkload || {})
    .filter(([name]) => name !== 'Unassigned')
    .sort(([, a], [, b]) => b - a);

  const stageEntries = Object.entries(analytics?.projectsByStage || {}).sort(
    ([, a], [, b]) => b - a
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/bccs-logo.png" alt="BCCS" className="h-10 w-10" />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Admin Analytics Dashboard</h1>
                <p className="text-sm text-slate-600">Advanced metrics and team workload</p>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Link href="/admin/projects">
            <Card className="cursor-pointer hover:shadow-md transition-shadow hover:border-blue-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Total Projects
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">{analytics?.totalProjects || 0}</div>
                <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                  Click to view progress report
                  <ArrowRight className="h-3 w-3" />
                </p>
              </CardContent>
            </Card>
          </Link>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Completed Projects
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{analytics?.completedProjects || 0}</div>
              <p className="text-xs text-slate-500 mt-2">Projects in Closeout stage</p>
            </CardContent>
          </Card>

          <Link href="/admin/workload">
            <Card className="cursor-pointer hover:shadow-md transition-shadow hover:border-purple-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Staff Workload
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">Tasks</div>
                <p className="text-xs text-purple-600 mt-2 flex items-center gap-1">
                  View detailed task tracking
                  <ArrowRight className="h-3 w-3" />
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Workload Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Inspector Workload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Inspector Workload
              </CardTitle>
              <CardDescription>Projects assigned per inspector</CardDescription>
            </CardHeader>
            <CardContent>
              {inspectorEntries.length > 0 ? (
                <div className="space-y-4">
                  {inspectorEntries.map(([name, count]) => (
                    <div key={name}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-slate-700 truncate max-w-[150px]">{name}</span>
                        <span className="text-sm font-semibold text-slate-900">{count}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{
                            width: `${(count / (analytics?.totalProjects || 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">No inspectors assigned</p>
              )}
            </CardContent>
          </Card>

          {/* Permit Tech Workload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Permit Tech Workload
              </CardTitle>
              <CardDescription>Projects assigned per permit tech</CardDescription>
            </CardHeader>
            <CardContent>
              {permitTechEntries.length > 0 ? (
                <div className="space-y-4">
                  {permitTechEntries.map(([name, count]) => (
                    <div key={name}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-slate-700 truncate max-w-[150px]">{name}</span>
                        <span className="text-sm font-semibold text-slate-900">{count}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{
                            width: `${(count / (analytics?.totalProjects || 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">No permit techs assigned</p>
              )}
            </CardContent>
          </Card>

          {/* Plans Examiner Workload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Plans Examiner Workload
              </CardTitle>
              <CardDescription>Projects assigned per examiner</CardDescription>
            </CardHeader>
            <CardContent>
              {plansExaminerEntries.length > 0 ? (
                <div className="space-y-4">
                  {plansExaminerEntries.map(([name, count]) => (
                    <div key={name}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-slate-700 truncate max-w-[150px]">{name}</span>
                        <span className="text-sm font-semibold text-slate-900">{count}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-purple-600 h-2 rounded-full"
                          style={{
                            width: `${(count / (analytics?.totalProjects || 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">No examiners assigned</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Projects by Stage */}
        <Card>
          <CardHeader>
            <CardTitle>Projects by Stage</CardTitle>
            <CardDescription>Distribution across pipeline stages</CardDescription>
          </CardHeader>
          <CardContent>
            {stageEntries.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {stageEntries.map(([stage, count]) => (
                  <div key={stage} className="p-4 bg-slate-50 rounded-lg">
                    <div className="text-2xl font-bold text-slate-900">{count}</div>
                    <div className="text-sm text-slate-600">{stage}</div>
                    <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full"
                        style={{
                          width: `${(count / (analytics?.totalProjects || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">No projects yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
