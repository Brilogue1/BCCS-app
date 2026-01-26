import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Loader2, CheckCircle2, Clock, BarChart3, Mail } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: summary, isLoading } = trpc.dashboard.summary.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const stageEntries = Object.entries(summary?.projectsByStage || {}).sort(
    ([, a], [, b]) => (b as number) - (a as number)
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
                <h1 className="text-2xl font-bold text-slate-900">BCCS Client Portal</h1>
                <p className="text-sm text-slate-600">Welcome, {user?.name || "User"}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {user?.role === "admin" && (
                <Link href="/admin">
                  <Button variant="outline" className="gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Admin Analytics
                  </Button>
                </Link>
              )}
              <Link href="/projects">
                <Button variant="outline">View Projects</Button>
              </Link>
              <Button variant="ghost">Logout</Button>
            </div>
          </div>
        </div>
        {/* Support Link */}
        <div className="bg-slate-50 border-t py-2">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-sm text-slate-600">
              Issues with the app or need support?{" "}
              <a 
                href="mailto:info@bccsfl.com" 
                className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
              >
                <Mail className="h-3 w-3" />
                Please reach out here
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Total Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{summary?.totalProjects || 0}</div>
              <p className="text-xs text-slate-500 mt-2">
                {user?.role === "admin" ? "All projects" : "Your projects"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Upcoming Inspections</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {summary?.upcomingInspections?.length || 0}
              </div>
              <p className="text-xs text-slate-500 mt-2">Scheduled inspections</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Recent Uploads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {summary?.recentFiles?.length || 0}
              </div>
              <p className="text-xs text-slate-500 mt-2">Files in last 30 days</p>
            </CardContent>
          </Card>
        </div>

        {/* Projects by Stage */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Projects by Stage</CardTitle>
              <CardDescription>Distribution of projects across pipeline stages</CardDescription>
            </CardHeader>
            <CardContent>
              {stageEntries.length > 0 ? (
                <div className="space-y-4">
                  {stageEntries.map(([stage, count]) => (
                    <div key={stage}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-slate-700">{stage}</span>
                        <span className="text-sm font-semibold text-slate-900">{count as number}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{
                            width: `${((count as number) / (summary?.totalProjects || 1)) * 100}%`,
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

          {/* Recent Uploads */}
          <Card>
            <CardHeader>
              <CardTitle>Recent File Uploads</CardTitle>
              <CardDescription>Latest documents and photos</CardDescription>
            </CardHeader>
            <CardContent>
              {summary?.recentFiles && summary.recentFiles.length > 0 ? (
                <div className="space-y-3">
                  {summary.recentFiles.slice(0, 5).map((file: any) => (
                    <div key={file.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                      <FileText className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{file.fileName}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(file.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8">No files uploaded yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Inspections */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Inspections</CardTitle>
            <CardDescription>Inspections scheduled for your projects</CardDescription>
          </CardHeader>
          <CardContent>
            {summary?.upcomingInspections && summary.upcomingInspections.length > 0 ? (
              <div className="space-y-3">
                {summary.upcomingInspections.slice(0, 10).map((inspection: any) => (
                  <div
                    key={inspection.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      {inspection.status === "completed" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <Clock className="h-5 w-5 text-yellow-600" />
                      )}
                      <div>
                        <p className="font-medium text-slate-900">{inspection.inspectionType}</p>
                        <p className="text-sm text-slate-500">
                          Project: {inspection.projectName}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                      {inspection.status || "Scheduled"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">No upcoming inspections</p>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="mt-8 flex gap-4">
          <Link href="/projects">
            <Button className="gap-2">
              View All Projects
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
