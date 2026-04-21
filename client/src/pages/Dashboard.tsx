import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Loader2, CheckCircle2, Clock, BarChart3, Mail, Calendar } from "lucide-react";
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
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



        {/* Requested Inspections */}
        {(() => {
          // Filter out inspections that are already scheduled (in sheet U-AA) or completed (in column H)
          const pendingRequests = (summary?.upcomingInspections || []).filter((insp: any) => {
            const t = (insp.inspectionType || '').trim().toUpperCase();
            // Check against scheduled types from sheet
            const scheduledSet = new Set<string>(
              (insp.scheduledTypes || []).map((s: string) => s.trim().toUpperCase())
            );
            if (scheduledSet.has(t)) return false;
            // Check against completed inspections text
            const completedText = insp.completedInspections || '';
            if (completedText) {
              const segments = completedText.split('|');
              for (const seg of segments) {
                const dashIdx = seg.indexOf('\u2014');
                if (dashIdx !== -1) {
                  const typePart = seg.substring(dashIdx + 1).trim().toUpperCase();
                  if (typePart === t) return false;
                }
              }
            }
            return true;
          });

          if (pendingRequests.length === 0) return null;

          return (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-yellow-500" />
                  Requested Inspections
                </CardTitle>
                <CardDescription>Inspection requests pending confirmation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingRequests.map((insp: any) => (
                    <Link key={insp.id} href={insp.opportunityId ? `/projects/${insp.opportunityId}` : `/projects`}>
                      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-900 truncate">{insp.inspectionType || 'Inspection'}</p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">{insp.projectName}</p>
                          {insp.createdAt && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              Submitted {new Date(insp.createdAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <span className="ml-3 flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
                          Requested
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })()}

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
