import { Link, Redirect } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Users, CheckCircle2, Clock, TrendingUp, Loader2, Calendar, BarChart3 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const { data: analytics, isLoading, refetch } = trpc.adminDashboard.analytics.useQuery({
    startDate,
    endDate,
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

  const handleDateChange = () => {
    refetch();
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
        {/* Date Range Filter */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Date Range Filter
            </CardTitle>
            <CardDescription>Filter inspection metrics by date range</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button onClick={handleDateChange}>Apply Filter</Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
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
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{analytics?.completedProjects || 0}</div>
              <p className="text-xs text-slate-500 mt-2">{analytics?.completionPercentage || 0}% completion rate</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Inspections (Range)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{analytics?.totalInspectionsInRange || 0}</div>
              <p className="text-xs text-slate-500 mt-2">In selected date range</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Completion Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{analytics?.completionPercentage || 0}%</div>
              <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all"
                  style={{ width: `${analytics?.completionPercentage || 0}%` }}
                />
              </div>
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

        {/* Projects by Stage & Weekly Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Projects by Stage */}
          <Card>
            <CardHeader>
              <CardTitle>Projects by Stage</CardTitle>
              <CardDescription>Distribution across pipeline stages</CardDescription>
            </CardHeader>
            <CardContent>
              {stageEntries.length > 0 ? (
                <div className="space-y-4">
                  {stageEntries.map(([stage, count]) => (
                    <div key={stage}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-slate-700">{stage}</span>
                        <span className="text-sm font-semibold text-slate-900">{count}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
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

          {/* Weekly Inspection Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Weekly Inspection Trend</CardTitle>
              <CardDescription>Inspections scheduled over the last 4 weeks</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics?.weeklyTrend && analytics.weeklyTrend.length > 0 ? (
                <div className="space-y-4">
                  {analytics.weeklyTrend.map((week) => (
                    <div key={week.week}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-slate-700">{week.week}</span>
                        <span className="text-sm font-semibold text-slate-900">{week.count} inspections</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-orange-500 h-2 rounded-full"
                          style={{
                            width: `${Math.max((week.count / Math.max(...analytics.weeklyTrend.map(w => w.count), 1)) * 100, 5)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8">No inspection data</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Inspection Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inspections by Status */}
          <Card>
            <CardHeader>
              <CardTitle>Inspections by Status</CardTitle>
              <CardDescription>Status breakdown for selected date range</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(analytics?.inspectionsByStatus || {}).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(analytics?.inspectionsByStatus || {}).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        {status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <Clock className="h-4 w-4 text-yellow-600" />
                        )}
                        <span className="font-medium capitalize">{status}</span>
                      </div>
                      <span className="text-lg font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8">No inspections in selected range</p>
              )}
            </CardContent>
          </Card>

          {/* Top Inspection Types */}
          <Card>
            <CardHeader>
              <CardTitle>Top Inspection Types</CardTitle>
              <CardDescription>Most requested inspection types</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(analytics?.inspectionsByType || {}).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(analytics?.inspectionsByType || {})
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span className="font-medium text-sm truncate max-w-[200px]">{type}</span>
                        <span className="text-lg font-bold">{count}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8">No inspections in selected range</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
