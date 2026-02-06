import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, BarChart3, Download, Users, FileText, 
  ChevronDown, ChevronUp, Calendar, Building2, MapPin,
  ClipboardCheck, Shield, Search, Mail
} from "lucide-react";
import { Loader2 } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

type EmployeeProject = {
  projectId: number;
  opportunityName: string;
  contactName: string | null;
  company: string | null;
  address: string | null;
  lotNumber: string | null;
  completionDate: string | null;
  type: string;
  assignedPermitTech: string | null;
  assignedPlansExaminer: string | null;
  assignedInspector: string | null;
  inspection1Type: string | null;
  inspection2Type: string | null;
  inspection3Type: string | null;
  inspection4Type: string | null;
  inspection5Type: string | null;
  inspection1Result: string | null;
  inspection2Result: string | null;
  inspection3Result: string | null;
  permitNumber: string | null;
  planningChecklist: string | null;
  permittingChecklist: string | null;
  inspectionChecklist: string | null;
  stage: string | null;
};

export default function EmployeeReport() {
  const { user } = useAuth();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<EmployeeProject | null>(null);

  const { data, isLoading } = trpc.employeeReport.monthly.useQuery({
    month: selectedMonth,
    year: selectedYear,
    employee: selectedEmployee || undefined,
  });

  const years = useMemo(() => {
    const currentYear = now.getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - i);
  }, []);

  const exportToCSV = () => {
    if (!data) return;
    
    const rows: string[][] = [
      ["Employee", "Client", "Project Name", "Address", "Lot #", "Type", "Permit #", "Completion Date"]
    ];

    data.employees.forEach(emp => {
      emp.projects.forEach(p => {
        rows.push([
          emp.employee,
          p.contactName || p.company || "",
          p.opportunityName,
          p.address || "",
          p.lotNumber || "",
          p.type,
          p.permitNumber || "",
          p.completionDate || "",
        ]);
      });
    });

    const csv = rows.map(r => r.map(c => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employee-report-${MONTHS[selectedMonth - 1]}-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getInspectionTypes = (p: EmployeeProject) => {
    const types = [p.inspection1Type, p.inspection2Type, p.inspection3Type, p.inspection4Type, p.inspection5Type]
      .filter(Boolean);
    return types;
  };

  const getInspectionResults = (p: EmployeeProject) => {
    const results = [
      { type: p.inspection1Type, result: p.inspection1Result },
      { type: p.inspection2Type, result: p.inspection2Result },
      { type: p.inspection3Type, result: p.inspection3Result },
    ].filter(r => r.type || r.result);
    return results;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Monthly Employee Report
              </h1>
              <p className="text-sm text-gray-500">Track completed projects by employee for invoice alignment</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportToCSV} disabled={!data?.employees.length}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-2 text-center">
          <a href="mailto:info@bccsfl.com" className="text-sm text-blue-600 hover:underline flex items-center justify-center gap-1">
            Issues with the app or need support? <Mail className="h-3 w-3" /> Please reach out here
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[150px]">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Month</label>
                <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Year</label>
                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Employee</label>
                <Select value={selectedEmployee || "all"} onValueChange={(v) => setSelectedEmployee(v === "all" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {data?.availableEmployees.map(emp => (
                      <SelectItem key={emp} value={emp}>{emp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <ClipboardCheck className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Completed Projects</p>
                  <p className="text-2xl font-bold">{data?.totalCompletedProjects ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Active Employees</p>
                  <p className="text-2xl font-bold">{data?.employees.length ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Report Period</p>
                  <p className="text-2xl font-bold">{MONTHS[selectedMonth - 1]} {selectedYear}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-500">Loading report...</span>
          </div>
        )}

        {/* Employee Sections */}
        {data && !isLoading && (
          <>
            {data.employees.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">No completed projects found for {MONTHS[selectedMonth - 1]} {selectedYear}</p>
                  <p className="text-gray-400 text-sm mt-1">Try selecting a different month or check that projects have a Completion Date set</p>
                </CardContent>
              </Card>
            ) : (
              data.employees.map(emp => (
                <Card key={emp.employee} className="overflow-hidden">
                  <CardHeader 
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedEmployee(expandedEmployee === emp.employee ? null : emp.employee)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-full">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{emp.employee}</CardTitle>
                          <p className="text-sm text-gray-500">{emp.totalProjects} completed project{emp.totalProjects !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="text-sm">
                          {emp.totalProjects} project{emp.totalProjects !== 1 ? 's' : ''}
                        </Badge>
                        {expandedEmployee === emp.employee ? (
                          <ChevronUp className="h-5 w-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  {expandedEmployee === emp.employee && (
                    <CardContent className="pt-0">
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                              <th className="text-left px-4 py-3 font-medium text-gray-600">Project Name</th>
                              <th className="text-left px-4 py-3 font-medium text-gray-600">Address</th>
                              <th className="text-left px-4 py-3 font-medium text-gray-600">Lot #</th>
                              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                              <th className="text-left px-4 py-3 font-medium text-gray-600">Permit #</th>
                              <th className="text-left px-4 py-3 font-medium text-gray-600">Completed</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {emp.projects.map((p, idx) => (
                              <tr 
                                key={idx} 
                                className="hover:bg-blue-50 cursor-pointer transition-colors"
                                onClick={() => setSelectedProject(p)}
                              >
                                <td className="px-4 py-3">{p.contactName || p.company || "—"}</td>
                                <td className="px-4 py-3 font-medium text-blue-600">{p.opportunityName}</td>
                                <td className="px-4 py-3 text-gray-600">{p.address || "—"}</td>
                                <td className="px-4 py-3">{p.lotNumber || "—"}</td>
                                <td className="px-4 py-3">
                                  <Badge 
                                    variant={p.type === 'Both' ? 'default' : 'outline'}
                                    className={
                                      p.type === 'Both' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                      p.type === 'Permit' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                      p.type === 'Inspection' ? 'bg-green-100 text-green-700 border-green-200' :
                                      p.type === 'Plans' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                      ''
                                    }
                                  >
                                    {p.type}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">{p.permitNumber || "—"}</td>
                                <td className="px-4 py-3 text-gray-500">{formatDate(p.completionDate)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </>
        )}
      </main>

      {/* Project Detail Dialog */}
      <Dialog open={!!selectedProject} onOpenChange={() => setSelectedProject(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedProject && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{selectedProject.opportunityName}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6 mt-4">
                {/* Project Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Client</p>
                    <p className="font-medium">{selectedProject.contactName || selectedProject.company || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Company</p>
                    <p className="font-medium">{selectedProject.company || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Address</p>
                    <p className="font-medium flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedProject.address || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Lot #</p>
                    <p className="font-medium">{selectedProject.lotNumber || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Permit #</p>
                    <p className="font-medium">{selectedProject.permitNumber || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Completion Date</p>
                    <p className="font-medium">{formatDate(selectedProject.completionDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Stage</p>
                    <p className="font-medium">{selectedProject.stage || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Work Type</p>
                    <Badge 
                      className={
                        selectedProject.type === 'Both' ? 'bg-purple-100 text-purple-700' :
                        selectedProject.type === 'Permit' ? 'bg-orange-100 text-orange-700' :
                        selectedProject.type === 'Inspection' ? 'bg-green-100 text-green-700' :
                        'bg-blue-100 text-blue-700'
                      }
                    >
                      {selectedProject.type}
                    </Badge>
                  </div>
                </div>

                {/* Staff Assignments */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Staff Assignments
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {selectedProject.assignedPermitTech && (
                      <div className="flex items-center justify-between bg-orange-50 rounded-lg px-4 py-2">
                        <span className="text-sm font-medium">Permit Tech</span>
                        <span className="text-sm">{selectedProject.assignedPermitTech}</span>
                      </div>
                    )}
                    {selectedProject.assignedPlansExaminer && (
                      <div className="flex items-center justify-between bg-blue-50 rounded-lg px-4 py-2">
                        <span className="text-sm font-medium">Plans Examiner</span>
                        <span className="text-sm">{selectedProject.assignedPlansExaminer}</span>
                      </div>
                    )}
                    {selectedProject.assignedInspector && (
                      <div className="flex items-center justify-between bg-green-50 rounded-lg px-4 py-2">
                        <span className="text-sm font-medium">Inspector</span>
                        <span className="text-sm">{selectedProject.assignedInspector}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Completed Inspections */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4" />
                    Inspections
                  </h3>
                  {getInspectionTypes(selectedProject).length > 0 ? (
                    <div className="space-y-2">
                      {getInspectionResults(selectedProject).map((r, i) => (
                        <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
                          <span className="text-sm">{r.type || `Inspection ${i + 1}`}</span>
                          <Badge 
                            variant="outline"
                            className={
                              r.result?.toLowerCase().includes('approved') ? 'bg-green-100 text-green-700 border-green-200' :
                              r.result?.toLowerCase().includes('denied') ? 'bg-red-100 text-red-700 border-red-200' :
                              r.result?.toLowerCase().includes('partial') ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                              'bg-gray-100 text-gray-600'
                            }
                          >
                            {r.result || "Pending"}
                          </Badge>
                        </div>
                      ))}
                      {/* Show remaining inspection types without results */}
                      {[selectedProject.inspection4Type, selectedProject.inspection5Type]
                        .filter(Boolean)
                        .map((type, i) => (
                          <div key={`extra-${i}`} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
                            <span className="text-sm">{type}</span>
                            <Badge variant="outline" className="bg-gray-100 text-gray-600">Scheduled</Badge>
                          </div>
                        ))
                      }
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No inspections recorded</p>
                  )}
                </div>

                {/* Permits / Checklists */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Permits & Checklists
                  </h3>
                  <div className="space-y-2">
                    {selectedProject.permitNumber && (
                      <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
                        <span className="text-sm font-medium">Permit Number</span>
                        <span className="text-sm">{selectedProject.permitNumber}</span>
                      </div>
                    )}
                    {selectedProject.planningChecklist && (
                      <div className="bg-gray-50 rounded-lg px-4 py-2">
                        <span className="text-sm font-medium">Planning Checklist</span>
                        <p className="text-sm text-gray-600 mt-1">{selectedProject.planningChecklist}</p>
                      </div>
                    )}
                    {selectedProject.permittingChecklist && (
                      <div className="bg-gray-50 rounded-lg px-4 py-2">
                        <span className="text-sm font-medium">Permitting Checklist</span>
                        <p className="text-sm text-gray-600 mt-1">{selectedProject.permittingChecklist}</p>
                      </div>
                    )}
                    {selectedProject.inspectionChecklist && (
                      <div className="bg-gray-50 rounded-lg px-4 py-2">
                        <span className="text-sm font-medium">Inspection Checklist</span>
                        <p className="text-sm text-gray-600 mt-1">{selectedProject.inspectionChecklist}</p>
                      </div>
                    )}
                    {!selectedProject.permitNumber && !selectedProject.planningChecklist && !selectedProject.permittingChecklist && !selectedProject.inspectionChecklist && (
                      <p className="text-sm text-gray-400">No permit or checklist data recorded</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
