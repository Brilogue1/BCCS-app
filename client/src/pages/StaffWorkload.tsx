import { ArrowLeft, Users, CheckCircle, Clock, Briefcase, ChevronDown, ChevronUp, Printer, Download, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import html2pdf from "html2pdf.js";

// Task mappings for each checklist type
const PLANNING_TASKS = [
  { step: 1, name: "Review documents for completeness", percentage: 12.5 },
  { step: 2, name: "Send update email to client", percentage: 25 },
  { step: 3, name: "Code compliance review", percentage: 37.5 },
  { step: 4, name: "Stamp documents", percentage: 50 },
  { step: 5, name: "Notification to permit tech", percentage: 62.5 },
  { step: 6, name: "Send documents to client or permit tech", percentage: 75 },
  { step: 7, name: "Invoice project", percentage: 87.5 },
  { step: 8, name: "Completed", percentage: 100 },
];

const PERMITTING_TASKS = [
  { step: 1, name: "Collect permitting document", percentage: 10 },
  { step: 2, name: "Email notifications to permit tech, plans examiner, inspector", percentage: 20 },
  { step: 3, name: "Jurisdiction documents", percentage: 30 },
  { step: 4, name: "Submit to jurisdiction", percentage: 40 },
  { step: 5, name: "Email notifications to client", percentage: 50 },
  { step: 6, name: "Weekly follow-up notification on permit status", percentage: 60 },
  { step: 7, name: "Client contact for jurisdiction fee payment if approved", percentage: 70 },
  { step: 8, name: "Notification to plans examiner", percentage: 80 },
  { step: 9, name: "Notification to inspector", percentage: 90 },
  { step: 10, name: "Completed", percentage: 100 },
];

const INSPECTION_TASKS = [
  { step: 1, name: "Inspector", percentage: 20 },
  { step: 2, name: "Complete inspection (add results)", percentage: 40 },
  { step: 3, name: "Client notification for inspection result", percentage: 60 },
  { step: 4, name: "Notification to permit tech", percentage: 80 },
  { step: 5, name: "All completed – move to closeout", percentage: 100 },
];

// Helper function to get completed tasks count from checklist value
function getCompletedTasks(checklistValue: string | null | undefined, tasks: typeof PLANNING_TASKS): number {
  if (!checklistValue) return 0;
  
  const normalizedValue = checklistValue.toLowerCase().trim();
  
  // Find the matching task (case-insensitive, partial match)
  for (let i = tasks.length - 1; i >= 0; i--) {
    const taskName = tasks[i].name.toLowerCase();
    if (normalizedValue.includes(taskName) || taskName.includes(normalizedValue)) {
      return tasks[i].step;
    }
  }
  
  // Try to match by keywords
  if (normalizedValue.includes("completed") || normalizedValue.includes("complete")) {
    return tasks.length;
  }
  if (normalizedValue.includes("review document")) return 1;
  if (normalizedValue.includes("send update") || normalizedValue.includes("email to client")) return 2;
  if (normalizedValue.includes("code compliance")) return 3;
  if (normalizedValue.includes("stamp")) return 4;
  if (normalizedValue.includes("notification to permit tech")) return 5;
  if (normalizedValue.includes("send document")) return 6;
  if (normalizedValue.includes("invoice")) return 7;
  
  // For permitting
  if (normalizedValue.includes("collect perm")) return 1;
  if (normalizedValue.includes("jurisdiction doc")) return 3;
  if (normalizedValue.includes("submit to jurisdiction")) return 4;
  if (normalizedValue.includes("weekly follow")) return 6;
  if (normalizedValue.includes("fee payment")) return 7;
  
  // For inspections
  if (normalizedValue.includes("inspector") && !normalizedValue.includes("notification")) return 1;
  if (normalizedValue.includes("add results") || normalizedValue.includes("complete inspection")) return 2;
  if (normalizedValue.includes("client notification")) return 3;
  if (normalizedValue.includes("closeout")) return 5;
  
  return 0;
}

interface StaffMember {
  name: string;
  role: string;
  projects: {
    id: number;
    name: string;
    stage: string | null;
    checklistType: 'planning' | 'permitting' | 'inspection';
    checklistValue: string | null;
    completedTasks: number;
    totalTasks: number;
    remainingTasks: number;
  }[];
  totalCompletedTasks: number;
  totalRemainingTasks: number;
  totalProjects: number;
}

export default function StaffWorkload() {
  const { data: projects, isLoading } = trpc.projects.list.useQuery();
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container py-8">
          <Skeleton className="h-8 w-64 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      </div>
    );
  }

  // Build staff workload data
  const staffMap = new Map<string, StaffMember>();

  projects?.forEach(project => {
    // Process Permit Tech assignments (linked to Planning checklist)
    if (project.assignedPermitTech) {
      const names = project.assignedPermitTech.split(',').map(n => n.trim()).filter(n => n);
      names.forEach(name => {
        if (!staffMap.has(name)) {
          staffMap.set(name, {
            name,
            role: 'Permit Tech',
            projects: [],
            totalCompletedTasks: 0,
            totalRemainingTasks: 0,
            totalProjects: 0,
          });
        }
        const staff = staffMap.get(name)!;
        const completedTasks = getCompletedTasks(project.planningChecklist, PLANNING_TASKS);
        const totalTasks = PLANNING_TASKS.length;
        staff.projects.push({
          id: project.id,
          name: project.opportunityName,
          stage: project.stage,
          checklistType: 'planning',
          checklistValue: project.planningChecklist,
          completedTasks,
          totalTasks,
          remainingTasks: totalTasks - completedTasks,
        });
        staff.totalCompletedTasks += completedTasks;
        staff.totalRemainingTasks += totalTasks - completedTasks;
        staff.totalProjects++;
      });
    }

    // Process Plans Examiner assignments (linked to Permitting checklist)
    if (project.assignedPlansExaminer) {
      const names = project.assignedPlansExaminer.split(',').map(n => n.trim()).filter(n => n);
      names.forEach(name => {
        if (!staffMap.has(name)) {
          staffMap.set(name, {
            name,
            role: 'Plans Examiner',
            projects: [],
            totalCompletedTasks: 0,
            totalRemainingTasks: 0,
            totalProjects: 0,
          });
        }
        const staff = staffMap.get(name)!;
        const completedTasks = getCompletedTasks(project.permittingChecklist, PERMITTING_TASKS);
        const totalTasks = PERMITTING_TASKS.length;
        staff.projects.push({
          id: project.id,
          name: project.opportunityName,
          stage: project.stage,
          checklistType: 'permitting',
          checklistValue: project.permittingChecklist,
          completedTasks,
          totalTasks,
          remainingTasks: totalTasks - completedTasks,
        });
        staff.totalCompletedTasks += completedTasks;
        staff.totalRemainingTasks += totalTasks - completedTasks;
        staff.totalProjects++;
      });
    }

    // Process Inspector assignments (linked to Inspection checklist)
    if (project.assignedInspector) {
      const names = project.assignedInspector.split(',').map(n => n.trim()).filter(n => n);
      names.forEach(name => {
        if (!staffMap.has(name)) {
          staffMap.set(name, {
            name,
            role: 'Inspector',
            projects: [],
            totalCompletedTasks: 0,
            totalRemainingTasks: 0,
            totalProjects: 0,
          });
        }
        const staff = staffMap.get(name)!;
        const completedTasks = getCompletedTasks(project.inspectionChecklist, INSPECTION_TASKS);
        const totalTasks = INSPECTION_TASKS.length;
        staff.projects.push({
          id: project.id,
          name: project.opportunityName,
          stage: project.stage,
          checklistType: 'inspection',
          checklistValue: project.inspectionChecklist,
          completedTasks,
          totalTasks,
          remainingTasks: totalTasks - completedTasks,
        });
        staff.totalCompletedTasks += completedTasks;
        staff.totalRemainingTasks += totalTasks - completedTasks;
        staff.totalProjects++;
      });
    }
  });

  const staffList = Array.from(staffMap.values()).sort((a, b) => 
    b.totalRemainingTasks - a.totalRemainingTasks
  );

  // Calculate summary stats
  const totalStaff = staffList.length;
  const totalTasksCompleted = staffList.reduce((sum, s) => sum + s.totalCompletedTasks, 0);
  const totalTasksRemaining = staffList.reduce((sum, s) => sum + s.totalRemainingTasks, 0);
  const avgTasksPerStaff = totalStaff > 0 ? Math.round((totalTasksCompleted + totalTasksRemaining) / totalStaff) : 0;

  const selectedStaffData = selectedStaff ? staffMap.get(selectedStaff) : null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 20px;">
        <h1 style="font-size: 24px; margin-bottom: 8px;">Staff Workload Report</h1>
        <p style="color: #666; margin-bottom: 24px;">Generated on ${new Date().toLocaleString()}</p>
        
        <div style="margin-bottom: 24px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="font-size: 18px; margin-bottom: 12px;">Summary</h2>
          <div style="display: flex; gap: 40px; flex-wrap: wrap;">
            <div><div style="font-size: 32px; font-weight: bold;">${totalStaff}</div><div style="font-size: 14px; color: #666;">Total Staff</div></div>
            <div><div style="font-size: 32px; font-weight: bold; color: #16a34a;">${totalTasksCompleted}</div><div style="font-size: 14px; color: #666;">Tasks Completed</div></div>
            <div><div style="font-size: 32px; font-weight: bold; color: #ea580c;">${totalTasksRemaining}</div><div style="font-size: 14px; color: #666;">Tasks Remaining</div></div>
            <div><div style="font-size: 32px; font-weight: bold; color: #2563eb;">${avgTasksPerStaff}</div><div style="font-size: 14px; color: #666;">Avg Tasks/Staff</div></div>
          </div>
        </div>
        
        <div style="margin-bottom: 24px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="font-size: 18px; margin-bottom: 12px;">Staff Workload Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #e2e8f0;"><th style="text-align: left; padding: 8px;">Name</th><th style="text-align: left; padding: 8px;">Role</th><th style="text-align: left; padding: 8px;">Projects</th><th style="text-align: left; padding: 8px;">Completed</th><th style="text-align: left; padding: 8px;">Remaining</th></tr>
            ${staffList.map(s => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px;">${s.name}</td>
                <td style="padding: 8px;">${s.role}</td>
                <td style="padding: 8px;">${s.totalProjects}</td>
                <td style="padding: 8px; color: #16a34a;">${s.totalCompletedTasks}</td>
                <td style="padding: 8px; color: #ea580c;">${s.totalRemainingTasks}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>
    `;
    
    const opt = {
      margin: 10,
      filename: `staff-workload-${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };
    
    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <Link href="/admin">
            <button className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors print:hidden">
              <ArrowLeft className="h-5 w-5" />
              Back to Admin Analytics
            </button>
          </Link>
          <div className="flex gap-2 print:hidden">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button 
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Users className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Staff Workload</h1>
            <p className="text-gray-500">Task tracking by staff member</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Staff</p>
                  <p className="text-2xl font-bold">{totalStaff}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Tasks Completed</p>
                  <p className="text-2xl font-bold text-green-600">{totalTasksCompleted}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Clock className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Tasks Remaining</p>
                  <p className="text-2xl font-bold text-orange-600">{totalTasksRemaining}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Briefcase className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Avg Tasks/Staff</p>
                  <p className="text-2xl font-bold">{avgTasksPerStaff}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Staff List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Staff Members
                </CardTitle>
              </CardHeader>
              <CardContent>
                {staffList.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No staff assignments found</p>
                    <p className="text-sm mt-2">Sync projects to populate staff data</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {staffList.map(staff => (
                      <button
                        key={staff.name}
                        onClick={() => setSelectedStaff(staff.name === selectedStaff ? null : staff.name)}
                        className={`w-full text-left p-4 rounded-lg border transition-all ${
                          selectedStaff === staff.name
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900">{staff.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {staff.role}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-green-600">
                            <CheckCircle className="h-4 w-4 inline mr-1" />
                            {staff.totalCompletedTasks}
                          </span>
                          <span className="text-orange-600">
                            <Clock className="h-4 w-4 inline mr-1" />
                            {staff.totalRemainingTasks}
                          </span>
                          <span className="text-gray-500">
                            {staff.totalProjects} projects
                          </span>
                        </div>
                        <Progress 
                          value={(staff.totalCompletedTasks / (staff.totalCompletedTasks + staff.totalRemainingTasks)) * 100} 
                          className="mt-2 h-2"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Staff Details */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedStaffData ? (
                    <div className="flex items-center justify-between">
                      <span>{selectedStaffData.name}'s Projects</span>
                      <Badge>{selectedStaffData.role}</Badge>
                    </div>
                  ) : (
                    'Select a Staff Member'
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedStaffData ? (
                  <div className="text-center py-12 text-gray-500">
                    <Users className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <p>Click on a staff member to view their project details</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Staff Summary */}
                    <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg mb-6">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{selectedStaffData.totalCompletedTasks}</p>
                        <p className="text-sm text-gray-500">Completed</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-orange-600">{selectedStaffData.totalRemainingTasks}</p>
                        <p className="text-sm text-gray-500">Remaining</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">{selectedStaffData.totalProjects}</p>
                        <p className="text-sm text-gray-500">Projects</p>
                      </div>
                    </div>

                    {/* Project List */}
                    <div className="space-y-3">
                      {selectedStaffData.projects.map(project => (
                        <div key={`${project.id}-${project.checklistType}`} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <Link href={`/projects/${project.id}`}>
                              <span className="font-medium text-blue-600 hover:underline cursor-pointer">
                                {project.name}
                              </span>
                            </Link>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {project.checklistType === 'planning' ? 'Planning' : 
                                 project.checklistType === 'permitting' ? 'Permitting' : 'Inspection'}
                              </Badge>
                              {project.stage && (
                                <Badge variant="secondary" className="text-xs">
                                  {project.stage}
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm mb-2">
                            <span className="text-gray-500">
                              Current: <span className="text-gray-700">{project.checklistValue || 'Not started'}</span>
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <Progress 
                              value={(project.completedTasks / project.totalTasks) * 100} 
                              className="flex-1 h-2"
                            />
                            <span className="text-sm font-medium text-gray-600 whitespace-nowrap">
                              {project.completedTasks}/{project.totalTasks} tasks
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span className="text-green-600">
                              <CheckCircle className="h-3 w-3 inline mr-1" />
                              {project.completedTasks} done
                            </span>
                            <span className="text-orange-600">
                              <Clock className="h-3 w-3 inline mr-1" />
                              {project.remainingTasks} remaining
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
