import { Link, Redirect } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// Using custom tabs instead of Radix Tabs for better control
import { ArrowLeft, Loader2, Building2, CheckCircle2, Clock, AlertCircle, ClipboardList, FileCheck, Search, Printer, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import html2pdf from "html2pdf.js";

// Planning Checklist task status to percentage mapping (Column AC)
const PLANNING_PROGRESS_MAP: Record<string, number> = {
  "review documents for completeness": 12.5,
  "send update email to client": 25,
  "code compliance review": 37.5,
  "stamp documents": 50,
  "notification to permit tech": 62.5,
  "send documents to client or permit tech": 75,
  "invoice project": 87.5,
  "completed": 100,
};

// Permitting Checklist task status to percentage mapping (Column AD)
const PERMITTING_PROGRESS_MAP: Record<string, number> = {
  "collect permitting document": 10,
  "email notifications to permit tech": 20,
  "jurisdiction documents": 30,
  "submit to jurisdiction": 40,
  "email notifications to client": 50,
  "weekly follow-up notification": 60,
  "client contact for jurisdiction fee": 70,
  "notification to plans examiner": 80,
  "notification to inspector": 90,
  "completed": 100,
};

// Inspections Checklist task status to percentage mapping (Column AY)
const INSPECTIONS_PROGRESS_MAP: Record<string, number> = {
  "inspector": 20,
  "complete inspection": 40,
  "client notification for inspection": 60,
  "notification to permit tech": 80,
  "all completed": 100,
  "move to closeout": 100,
};

type ChecklistType = 'planning' | 'permitting' | 'inspections';

// Get progress percentage from checklist value
function getProgressPercentage(
  checklistValue: string | null | undefined, 
  type: ChecklistType
): number {
  if (!checklistValue) return 0;
  
  const normalizedValue = checklistValue.toLowerCase().trim();
  const progressMap = type === 'planning' 
    ? PLANNING_PROGRESS_MAP 
    : type === 'permitting' 
      ? PERMITTING_PROGRESS_MAP 
      : INSPECTIONS_PROGRESS_MAP;
  
  // Check for exact or partial matches
  for (const [task, percentage] of Object.entries(progressMap)) {
    if (normalizedValue.includes(task) || task.includes(normalizedValue)) {
      return percentage;
    }
  }
  
  // Additional partial matches for Planning
  if (type === 'planning') {
    if (normalizedValue.includes("review") && normalizedValue.includes("document")) return 12.5;
    if (normalizedValue.includes("email") && normalizedValue.includes("client")) return 25;
    if (normalizedValue.includes("code") && normalizedValue.includes("compli")) return 37.5;
    if (normalizedValue.includes("stamp")) return 50;
    if (normalizedValue.includes("notification") && normalizedValue.includes("permit")) return 62.5;
    if (normalizedValue.includes("send") && normalizedValue.includes("document")) return 75;
    if (normalizedValue.includes("invoice")) return 87.5;
  }
  
  // Additional partial matches for Permitting
  if (type === 'permitting') {
    if (normalizedValue.includes("collect") && normalizedValue.includes("perm")) return 10;
    if (normalizedValue.includes("email") && normalizedValue.includes("permit tech")) return 20;
    if (normalizedValue.includes("jurisdiction") && normalizedValue.includes("doc")) return 30;
    if (normalizedValue.includes("submit") && normalizedValue.includes("jurisdiction")) return 40;
    if (normalizedValue.includes("email") && normalizedValue.includes("client")) return 50;
    if (normalizedValue.includes("weekly") || normalizedValue.includes("follow-up")) return 60;
    if (normalizedValue.includes("fee") || normalizedValue.includes("payment")) return 70;
    if (normalizedValue.includes("plans examiner")) return 80;
    if (normalizedValue.includes("inspector") && !normalizedValue.includes("plans")) return 90;
  }
  
  // Additional partial matches for Inspections
  if (type === 'inspections') {
    if (normalizedValue.includes("inspector") && !normalizedValue.includes("notification")) return 20;
    if (normalizedValue.includes("complete") && normalizedValue.includes("inspection")) return 40;
    if (normalizedValue.includes("client") && normalizedValue.includes("notification")) return 60;
    if (normalizedValue.includes("permit tech") && normalizedValue.includes("notification")) return 80;
    if (normalizedValue.includes("closeout") || normalizedValue.includes("all completed")) return 100;
  }
  
  // Generic completed check
  if (normalizedValue.includes("complete") && !normalizedValue.includes("inspection")) return 100;
  
  return 0;
}

// Get progress color based on percentage
function getProgressColor(percentage: number): string {
  if (percentage === 100) return "bg-green-600";
  if (percentage >= 75) return "bg-blue-600";
  if (percentage >= 50) return "bg-yellow-500";
  if (percentage >= 25) return "bg-orange-500";
  if (percentage > 0) return "bg-orange-400";
  return "bg-slate-300";
}

// Get status badge based on percentage
function getStatusBadge(percentage: number): { label: string; className: string; icon: typeof CheckCircle2 } {
  if (percentage === 100) return { label: "Completed", className: "bg-green-100 text-green-700", icon: CheckCircle2 };
  if (percentage >= 50) return { label: "In Progress", className: "bg-blue-100 text-blue-700", icon: Clock };
  if (percentage > 0) return { label: "Started", className: "bg-yellow-100 text-yellow-700", icon: Clock };
  return { label: "Not Started", className: "bg-slate-100 text-slate-600", icon: AlertCircle };
}

// Checklist legend component
function ChecklistLegend({ 
  title, 
  description, 
  progressMap 
}: { 
  title: string; 
  description: string; 
  progressMap: Record<string, number>;
}) {
  const sortedEntries = Object.entries(progressMap).sort(([, a], [, b]) => a - b);
  
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {sortedEntries.map(([task, percentage]) => (
            <div key={task} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${getProgressColor(percentage)}`} />
              <span className="text-xs text-slate-700 capitalize truncate">{task}</span>
              <span className="text-xs text-slate-500 flex-shrink-0">({percentage}%)</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminProjectsReport() {
  const { user, loading: authLoading } = useAuth();
  const { data: projects, isLoading } = trpc.projects.list.useQuery();
  const [activeTab, setActiveTab] = useState<ChecklistType>('planning');

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

  // Calculate progress for each project based on active tab
  const getChecklistValue = (project: NonNullable<typeof projects>[number], type: ChecklistType) => {
    switch (type) {
      case 'planning': return project.planningChecklist;
      case 'permitting': return project.permittingChecklist;
      case 'inspections': return project.inspectionChecklist;
    }
  };

  const projectsWithProgress = (projects || []).map(project => ({
    ...project,
    planningProgress: getProgressPercentage(project.planningChecklist, 'planning'),
    permittingProgress: getProgressPercentage(project.permittingChecklist, 'permitting'),
    inspectionsProgress: getProgressPercentage(project.inspectionChecklist, 'inspections'),
    currentProgress: getProgressPercentage(getChecklistValue(project, activeTab), activeTab),
    currentChecklist: getChecklistValue(project, activeTab),
  })).sort((a, b) => b.currentProgress - a.currentProgress);

  // Calculate summary stats for current tab
  const totalProjects = projectsWithProgress.length;
  const completedProjects = projectsWithProgress.filter(p => p.currentProgress === 100).length;
  const inProgressProjects = projectsWithProgress.filter(p => p.currentProgress > 0 && p.currentProgress < 100).length;
  const notStartedProjects = projectsWithProgress.filter(p => p.currentProgress === 0).length;
  const averageProgress = totalProjects > 0 
    ? Math.round(projectsWithProgress.reduce((sum, p) => sum + p.currentProgress, 0) / totalProjects)
    : 0;

  // Group by stage
  const projectsByStage = projectsWithProgress.reduce((acc, project) => {
    const stage = project.stage || 'Unknown';
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(project);
    return acc;
  }, {} as Record<string, typeof projectsWithProgress>);

  const getTabLabel = (type: ChecklistType) => {
    switch (type) {
      case 'planning': return 'Planning';
      case 'permitting': return 'Permitting';
      case 'inspections': return 'Inspections';
    }
  };

  const getProgressMap = (type: ChecklistType) => {
    switch (type) {
      case 'planning': return PLANNING_PROGRESS_MAP;
      case 'permitting': return PERMITTING_PROGRESS_MAP;
      case 'inspections': return INSPECTIONS_PROGRESS_MAP;
    }
  };

  const getTabIcon = (type: ChecklistType) => {
    switch (type) {
      case 'planning': return ClipboardList;
      case 'permitting': return FileCheck;
      case 'inspections': return Search;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 20px;">
        <h1 style="font-size: 24px; margin-bottom: 8px;">Project Progress Report - ${getTabLabel(activeTab)} Checklist</h1>
        <p style="color: #666; margin-bottom: 24px;">Generated on ${new Date().toLocaleString()}</p>
        
        <div style="margin-bottom: 24px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="font-size: 18px; margin-bottom: 12px;">Summary</h2>
          <div style="display: flex; gap: 40px; flex-wrap: wrap;">
            <div><div style="font-size: 32px; font-weight: bold;">${totalProjects}</div><div style="font-size: 14px; color: #666;">Total Projects</div></div>
            <div><div style="font-size: 32px; font-weight: bold; color: #16a34a;">${completedProjects}</div><div style="font-size: 14px; color: #666;">Completed</div></div>
            <div><div style="font-size: 32px; font-weight: bold; color: #2563eb;">${inProgressProjects}</div><div style="font-size: 14px; color: #666;">In Progress</div></div>
            <div><div style="font-size: 32px; font-weight: bold; color: #64748b;">${notStartedProjects}</div><div style="font-size: 14px; color: #666;">Not Started</div></div>
            <div><div style="font-size: 32px; font-weight: bold;">${averageProgress}%</div><div style="font-size: 14px; color: #666;">Avg Progress</div></div>
          </div>
        </div>
        
        <div style="margin-bottom: 24px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="font-size: 18px; margin-bottom: 12px;">All Projects</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #e2e8f0;"><th style="text-align: left; padding: 8px;">Project</th><th style="text-align: left; padding: 8px;">Stage</th><th style="text-align: left; padding: 8px;">Current Task</th><th style="text-align: left; padding: 8px;">Progress</th></tr>
            ${projectsWithProgress.map(p => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px;">${p.opportunityName || 'Unnamed'}</td>
                <td style="padding: 8px;">${p.stage || 'N/A'}</td>
                <td style="padding: 8px;">${p.currentChecklist || 'Not Started'}</td>
                <td style="padding: 8px;">${p.currentProgress}%</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>
    `;
    
    const opt = {
      margin: 10,
      filename: `project-progress-${getTabLabel(activeTab).toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };
    
    html2pdf().set(opt).from(element).save();
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
                <h1 className="text-2xl font-bold text-slate-900">Project Progress Report</h1>
                <p className="text-sm text-slate-600">Track progress across all project checklists</p>
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
              <Link href="/admin">
                <Button variant="outline" className="print:hidden">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Analytics
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Checklist Tabs */}
        <div className="mb-6">
          <div className="flex border-b border-slate-200 mb-6">
            {(['planning', 'permitting', 'inspections'] as ChecklistType[]).map((type) => {
              const Icon = getTabIcon(type);
              const isActive = activeTab === type;
              return (
                <button
                  key={type}
                  onClick={() => setActiveTab(type)}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {getTabLabel(type)}
                </button>
              );
            })}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
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
          <ChecklistLegend 
            title={`${getTabLabel(activeTab)} Checklist Steps`}
            description={`Progress is calculated based on the ${getTabLabel(activeTab)} Checklist status from the spreadsheet`}
            progressMap={getProgressMap(activeTab)}
          />
        </div>

        {/* Projects List */}
        <Card>
          <CardHeader>
            <CardTitle>All Projects - {getTabLabel(activeTab)} Progress</CardTitle>
            <CardDescription>Sorted by {getTabLabel(activeTab).toLowerCase()} progress (highest first)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {projectsWithProgress.map((project) => {
                const status = getStatusBadge(project.currentProgress);
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
                    
                    {/* All Three Progress Bars */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-4">
                        {/* Planning Progress */}
                        <div>
                          <div className="flex justify-between items-center text-xs mb-1">
                            <span className="text-slate-600 flex items-center gap-1">
                              <ClipboardList className="h-3 w-3" />
                              Planning
                            </span>
                            <span className="font-semibold">{project.planningProgress}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${getProgressColor(project.planningProgress)}`}
                              style={{ width: `${project.planningProgress}%` }}
                            />
                          </div>
                        </div>
                        
                        {/* Permitting Progress */}
                        <div>
                          <div className="flex justify-between items-center text-xs mb-1">
                            <span className="text-slate-600 flex items-center gap-1">
                              <FileCheck className="h-3 w-3" />
                              Permitting
                            </span>
                            <span className="font-semibold">{project.permittingProgress}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${getProgressColor(project.permittingProgress)}`}
                              style={{ width: `${project.permittingProgress}%` }}
                            />
                          </div>
                        </div>
                        
                        {/* Inspections Progress */}
                        <div>
                          <div className="flex justify-between items-center text-xs mb-1">
                            <span className="text-slate-600 flex items-center gap-1">
                              <Search className="h-3 w-3" />
                              Inspections
                            </span>
                            <span className="font-semibold">{project.inspectionsProgress}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${getProgressColor(project.inspectionsProgress)}`}
                              style={{ width: `${project.inspectionsProgress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Current Task for Active Tab */}
                      <div className="text-xs text-slate-500 mt-2">
                        Current {getTabLabel(activeTab)} Task: <strong className="capitalize text-slate-700">{project.currentChecklist || 'Not started'}</strong>
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
            <CardTitle>{getTabLabel(activeTab)} Progress by Stage</CardTitle>
            <CardDescription>Average {getTabLabel(activeTab).toLowerCase()} progress for each pipeline stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(projectsByStage)
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([stage, stageProjects]) => {
                  const avgProgress = Math.round(
                    stageProjects.reduce((sum, p) => sum + p.currentProgress, 0) / stageProjects.length
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
