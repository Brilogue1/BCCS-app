import { Link, Redirect } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Users, CheckCircle2, Loader2, BarChart3, XCircle, AlertTriangle, FileText, Send, Clock, Printer, Download } from "lucide-react";
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

  const inspectionResults = analytics?.inspectionResultsTally || { approved: 0, denied: 0, partial: 0, total: 0 };
  const proposalsTally = analytics?.proposalsTally || { totalInProposalStage: 0, proposalsSent: 0, proposalsSigned: 0, stuck: 0 };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Create a printable version and trigger download
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const content = document.querySelector('.max-w-7xl');
      printWindow.document.write(`
        <html>
          <head>
            <title>Admin Analytics Dashboard - ${new Date().toLocaleDateString()}</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; }
              h1 { font-size: 24px; margin-bottom: 8px; }
              h2 { font-size: 18px; margin-top: 24px; margin-bottom: 12px; }
              .stat { display: inline-block; margin-right: 40px; margin-bottom: 16px; }
              .stat-value { font-size: 32px; font-weight: bold; }
              .stat-label { font-size: 14px; color: #666; }
              .section { margin-bottom: 24px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; }
              th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e2e8f0; }
              .green { color: #16a34a; }
              .red { color: #dc2626; }
              .yellow { color: #ca8a04; }
              .blue { color: #2563eb; }
              .orange { color: #ea580c; }
            </style>
          </head>
          <body>
            <h1>Admin Analytics Dashboard</h1>
            <p>Generated on ${new Date().toLocaleString()}</p>
            
            <div class="section">
              <h2>Summary</h2>
              <div class="stat"><div class="stat-value">${analytics?.totalProjects || 0}</div><div class="stat-label">Total Projects</div></div>
              <div class="stat"><div class="stat-value green">${analytics?.completedProjects || 0}</div><div class="stat-label">Completed</div></div>
            </div>
            
            <div class="section">
              <h2>Inspection Results</h2>
              <div class="stat"><div class="stat-value green">${inspectionResults.approved}</div><div class="stat-label">Approved</div></div>
              <div class="stat"><div class="stat-value red">${inspectionResults.denied}</div><div class="stat-label">Denied</div></div>
              <div class="stat"><div class="stat-value yellow">${inspectionResults.partial}</div><div class="stat-label">Partial</div></div>
              <div class="stat"><div class="stat-value">${inspectionResults.total}</div><div class="stat-label">Total</div></div>
            </div>
            
            <div class="section">
              <h2>Proposal Status</h2>
              <div class="stat"><div class="stat-value blue">${proposalsTally.totalInProposalStage}</div><div class="stat-label">In Proposal Stage</div></div>
              <div class="stat"><div class="stat-value">${proposalsTally.proposalsSent}</div><div class="stat-label">Sent</div></div>
              <div class="stat"><div class="stat-value green">${proposalsTally.proposalsSigned}</div><div class="stat-label">Signed</div></div>
              <div class="stat"><div class="stat-value orange">${proposalsTally.stuck}</div><div class="stat-label">Stuck</div></div>
            </div>
            
            <div class="section">
              <h2>Projects by Stage</h2>
              <table>
                <tr><th>Stage</th><th>Count</th></tr>
                ${stageEntries.map(([stage, count]) => `<tr><td>${stage}</td><td>${count}</td></tr>`).join('')}
              </table>
            </div>
            
            <div class="section">
              <h2>Staff Workload</h2>
              <h3>Inspectors</h3>
              <table>
                <tr><th>Name</th><th>Projects</th></tr>
                ${inspectorEntries.map(([name, count]) => `<tr><td>${name}</td><td>${count}</td></tr>`).join('')}
              </table>
              <h3>Permit Techs</h3>
              <table>
                <tr><th>Name</th><th>Projects</th></tr>
                ${permitTechEntries.map(([name, count]) => `<tr><td>${name}</td><td>${count}</td></tr>`).join('')}
              </table>
              <h3>Plans Examiners</h3>
              <table>
                <tr><th>Name</th><th>Projects</th></tr>
                ${plansExaminerEntries.map(([name, count]) => `<tr><td>${name}</td><td>${count}</td></tr>`).join('')}
              </table>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

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
              <Button variant="outline" onClick={handlePrint} className="print:hidden">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button variant="outline" onClick={handleDownload} className="print:hidden">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Link href="/dashboard">
                <Button variant="outline" className="print:hidden">
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

        {/* Inspection Results Tally */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Inspection Results</CardTitle>
            <CardDescription>Pass/Fail totals from 1st, 2nd, and 3rd inspections</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-700">Approved</span>
                </div>
                <div className="text-3xl font-bold text-green-600">{inspectionResults.approved}</div>
                {inspectionResults.total > 0 && (
                  <div className="text-xs text-green-600 mt-1">
                    {Math.round((inspectionResults.approved / inspectionResults.total) * 100)}% of total
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span className="text-sm font-medium text-red-700">Denied</span>
                </div>
                <div className="text-3xl font-bold text-red-600">{inspectionResults.denied}</div>
                {inspectionResults.total > 0 && (
                  <div className="text-xs text-red-600 mt-1">
                    {Math.round((inspectionResults.denied / inspectionResults.total) * 100)}% of total
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-700">Partial</span>
                </div>
                <div className="text-3xl font-bold text-yellow-600">{inspectionResults.partial}</div>
                {inspectionResults.total > 0 && (
                  <div className="text-xs text-yellow-600 mt-1">
                    {Math.round((inspectionResults.partial / inspectionResults.total) * 100)}% of total
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-5 w-5 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">Total Inspections</span>
                </div>
                <div className="text-3xl font-bold text-slate-900">{inspectionResults.total}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Across all projects
                </div>
              </div>
            </div>
            
            {/* Progress bar showing distribution */}
            {inspectionResults.total > 0 && (
              <div className="mt-6">
                <div className="text-sm font-medium text-slate-600 mb-2">Distribution</div>
                <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden flex">
                  <div 
                    className="bg-green-500 h-full transition-all"
                    style={{ width: `${(inspectionResults.approved / inspectionResults.total) * 100}%` }}
                  />
                  <div 
                    className="bg-red-500 h-full transition-all"
                    style={{ width: `${(inspectionResults.denied / inspectionResults.total) * 100}%` }}
                  />
                  <div 
                    className="bg-yellow-500 h-full transition-all"
                    style={{ width: `${(inspectionResults.partial / inspectionResults.total) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-500 rounded-sm"></span> Approved
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-500 rounded-sm"></span> Denied
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-yellow-500 rounded-sm"></span> Partial
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Proposal Tracking */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Proposal Status
            </CardTitle>
            <CardDescription>Track proposals in the pipeline and identify stuck projects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700">In Proposal Stage</span>
                </div>
                <div className="text-3xl font-bold text-blue-600">{proposalsTally.totalInProposalStage}</div>
                <div className="text-xs text-blue-600 mt-1">
                  Projects awaiting proposal action
                </div>
              </div>
              
              <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                <div className="flex items-center gap-2 mb-2">
                  <Send className="h-5 w-5 text-indigo-600" />
                  <span className="text-sm font-medium text-indigo-700">Proposals Sent</span>
                </div>
                <div className="text-3xl font-bold text-indigo-600">{proposalsTally.proposalsSent}</div>
                <div className="text-xs text-indigo-600 mt-1">
                  Across all projects
                </div>
              </div>
              
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-700">Proposals Signed</span>
                </div>
                <div className="text-3xl font-bold text-green-600">{proposalsTally.proposalsSigned}</div>
                <div className="text-xs text-green-600 mt-1">
                  Approved and ready to proceed
                </div>
              </div>
              
              <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-5 w-5 text-orange-600" />
                  <span className="text-sm font-medium text-orange-700">Stuck in Proposal</span>
                </div>
                <div className="text-3xl font-bold text-orange-600">{proposalsTally.stuck}</div>
                <div className="text-xs text-orange-600 mt-1">
                  Sent but not signed, or not sent
                </div>
              </div>
            </div>
            
            {/* Conversion funnel visualization */}
            {proposalsTally.proposalsSent > 0 && (
              <div className="mt-6">
                <div className="text-sm font-medium text-slate-600 mb-2">Proposal Conversion</div>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-xs text-slate-500 mb-1">Sent → Signed</div>
                    <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className="bg-green-500 h-full transition-all"
                        style={{ width: `${(proposalsTally.proposalsSigned / proposalsTally.proposalsSent) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    {Math.round((proposalsTally.proposalsSigned / proposalsTally.proposalsSent) * 100)}%
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
