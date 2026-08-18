import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Building2, Calendar, Loader2, LogOut, MapPin, Plus, RefreshCw, Search, BarChart3, CheckCircle2, Mail, FileText, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import inspectionTypes from "../../../shared/inspectionTypes.json";
import { normalizeInspectionType, projectMatchesSearch } from "../../../shared/utils";

export default function Projects() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'reports'>('active');
  
  // New project inspection dialog state
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectAddress, setNewProjectAddress] = useState("");
  const [newInspectionType, setNewInspectionType] = useState("");
  const [newInspectionTypeSearch, setNewInspectionTypeSearch] = useState("");
  const [newInspectionNotes, setNewInspectionNotes] = useState("");

  const { data: projects, isLoading: projectsLoading, refetch } = trpc.projects.list.useQuery();
  const { data: pastInspections, isLoading: pastInspectionsLoading } = trpc.pastInspections.list.useQuery();
  const { data: myReports, isLoading: reportsLoading } = trpc.pastInspections.getMyReports.useQuery();
  const { data: allDbInspections } = trpc.inspections.listAllForUser.useQuery();
  // Fetch completed inspection types from Past Inspections sheet, grouped by opportunityId
  const { data: completedTypeMap } = trpc.pastInspections.getCompletedOpportunityTypeMap.useQuery(
    undefined,
    { refetchInterval: 30 * 60 * 1000 } // 30 minutes
  );

  // Build a map of projectId -> pending requested inspection types
  // (exclude those already in scheduled sheet columns OR in the Past Inspections sheet)
  const requestedByProjectId = (() => {
    const map = new Map<number, string[]>();
    if (!allDbInspections || !projects) return map;
    const projectMap = new Map((projects as any[]).map((p: any) => [p.id, p]));
    for (const insp of allDbInspections as any[]) {
      const proj = projectMap.get(insp.projectId);
      if (!proj) continue;
      const t = (insp.inspectionType || '').trim().toUpperCase();
      // Check scheduled types from sheet (U-AA)
      const scheduledSet = new Set<string>([
        proj.inspection1Type, proj.inspection2Type, proj.inspection3Type,
        proj.inspection4Type, proj.inspection5Type,
      ].filter((s: any) => s && s.trim() !== '' && s.trim() !== '_').map((s: string) => s.trim().toUpperCase()));
      if (scheduledSet.has(t)) continue;
      // Check Past Inspections sheet (authoritative completed source)
      const oppId = (proj.opportunityId || '').trim();
      if (oppId && completedTypeMap) {
        const completedTypes = (completedTypeMap as Record<string, string[]>)[oppId] || [];
        const tNorm = normalizeInspectionType(insp.inspectionType);
        if (completedTypes.includes(tNorm)) continue;
      }
      if (!map.has(insp.projectId)) map.set(insp.projectId, []);
      map.get(insp.projectId)!.push(insp.inspectionType || '');
    }
    return map;
  })();
  
  // Auto-sync every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      syncMutation.mutate(undefined, {
        onSuccess: (data) => {
          // Silent sync - no toast notification
          refetch();
        },
        onError: () => {
          // Silent error - no toast notification
        },
      });
    }, 60000); // 60 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  const syncMutation = trpc.projects.sync.useMutation({
    onSuccess: (data) => {
      toast.success('Sync complete');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to sync projects");
    },
  });

  const newProjectInspectionMutation = trpc.newProjectInspection.create.useMutation({
    onSuccess: () => {
      toast.success("Inspection request submitted successfully!");
      setNewProjectDialogOpen(false);
      setNewProjectName("");
      setNewProjectAddress("");
      setNewInspectionType("");
      setNewInspectionNotes("");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit inspection request");
    },
  });

  const handleNewProjectInspection = () => {
    if (!newProjectName || !newProjectAddress || !newInspectionType) {
      toast.error("Please fill in all required fields");
      return;
    }
    newProjectInspectionMutation.mutate({
      projectName: newProjectName,
      projectAddress: newProjectAddress,
      inspectionType: newInspectionType,
      notes: newInspectionNotes,
    });
  };

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  const handleSync = () => {
    syncMutation.mutate();
  };

  // Filter active projects
  const filteredProjects = projects?.filter((project) => {
    const matchesSearch = projectMatchesSearch(project, searchQuery);
    
    // Filter by completion status
    const isCompleted = project.completionStatus?.toLowerCase() === 'completed';
    const matchesTab = activeTab === 'completed' ? isCompleted : !isCompleted;
    
    return matchesSearch && matchesTab;
  });

  // Filter past inspections
  const filteredPastInspections = pastInspections?.filter((inspection) => {
    const query = searchQuery.toLowerCase();
    return (
      inspection.projectName?.toLowerCase().includes(query) ||
      inspection.inspectionType?.toLowerCase().includes(query) ||
      inspection.approvedStatus?.toLowerCase().includes(query)
    );
  });

  const isLoading = activeTab === 'active' ? projectsLoading : activeTab === 'completed' ? pastInspectionsLoading : reportsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src="/bccs-logo.png" alt="BCCS Logo" className="h-16 w-16" />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">BCCS Client Portal</h1>
                <p className="text-sm text-slate-600">Welcome, {user?.name || user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {user?.role === "admin" && (
                <Link href="/admin">
                  <Button variant="outline" size="sm" className="gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Admin Analytics
                  </Button>
                </Link>
              )}
              <Link href="/dashboard">
                <Button variant="outline" size="sm">
                  Dashboard
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                Sync Projects
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
        {/* Support Link */}
        <div className="bg-slate-50 border-t py-2">
          <div className="container mx-auto px-4 text-center">
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
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Tabs and Search */}
        <div className="mb-6 space-y-4">
          {/* Tabs and New Project Button */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={activeTab === 'active' ? 'default' : 'outline'}
                onClick={() => setActiveTab('active')}
              >
                Active Projects
              </Button>
              <Button
                variant={activeTab === 'completed' ? 'default' : 'outline'}
                onClick={() => setActiveTab('completed')}
              >
                Completed Projects
              </Button>
              <Button
                variant={activeTab === 'reports' ? 'default' : 'outline'}
                onClick={() => setActiveTab('reports')}
                className={activeTab === 'reports' ? '' : 'border-blue-300 text-blue-700 hover:bg-blue-50'}
              >
                <FileText className="h-4 w-4 mr-2" />
                Inspection Reports
                {myReports && myReports.length > 0 && (
                  <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {myReports.length}
                  </span>
                )}
              </Button>
            </div>
            

          </div>
          
          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder={activeTab === 'reports' ? "Search by project name..." : activeTab === 'completed' ? "Search inspections..." : "Search by project name or company..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Active Projects Grid */}
        {activeTab === 'active' && (
          <>
            {!filteredProjects || filteredProjects.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Building2 className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-600 mb-4">
                    {searchQuery ? "No projects found matching your search" : "No active projects found"}
                  </p>
                  <Button onClick={handleSync} disabled={syncMutation.isPending}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                    Sync with BCCS System
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map((project) => (
                  <Link key={project.id} href={project.opportunityId ? `/projects/${project.opportunityId}` : `/projects/id/${project.id}`}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                      <CardHeader>
                        <CardTitle className="flex items-start gap-2">
                          <Building2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{project.opportunityName}</span>
                        </CardTitle>
                        <CardDescription className="space-y-1 mt-2">
                          <span className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{project.address || "No address provided"}</span>
                          </span>
                          {project.lotNumber && (
                            <span className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                              Lot #{project.lotNumber}
                            </span>
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3 text-sm">
                          {project.stage && (
                            <div className="flex justify-between">
                              <span className="text-slate-600">Stage:</span>
                              <span className="font-medium">{project.stage}</span>
                            </div>
                          )}
                          {project.contactName && (
                            <div className="flex justify-between">
                              <span className="text-slate-600">Contact:</span>
                              <span className="font-medium">{project.contactName}</span>
                            </div>
                          )}
                          
                          {/* Scheduled Inspections from sheet (U-AA) */}
                          {(() => {
                            const isValid = (val: string | null | undefined) => val && val.trim() !== '' && val.trim() !== '_';
                            const types = [
                              project.inspection1Type,
                              project.inspection2Type,
                              project.inspection3Type,
                              project.inspection4Type,
                              project.inspection5Type,
                            ].filter(isValid);
                            return types.length > 0 ? (
                              <div className="pt-2 border-t">
                                <p className="text-xs font-semibold text-slate-600 mb-2">Scheduled Inspections:</p>
                                <div className="space-y-1">
                                  {types.map((type, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs">
                                      <span className="text-slate-600">{type}</span>
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Scheduled</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null;
                          })()}

                          {/* Requested Inspections from DB (pending confirmation) */}
                          {(() => {
                            const requested = requestedByProjectId.get(project.id) || [];
                            return requested.length > 0 ? (
                              <div className="pt-2 border-t">
                                <p className="text-xs font-semibold text-slate-600 mb-2">Requested Inspections:</p>
                                <div className="space-y-1">
                                  {requested.map((type, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs">
                                      <span className="text-slate-600">{type}</span>
                                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-medium border border-yellow-300">Requested</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* Inspection Reports Tab */}
        {activeTab === 'reports' && (
          <>
            {!myReports || myReports.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-600 mb-2 font-medium">No inspection reports available yet</p>
                  <p className="text-slate-500 text-sm">Reports are automatically generated for completed inspections and will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {/* Group reports by project, filtered by search query */}
                {(() => {
                  const query = searchQuery.toLowerCase();
                  const grouped: Record<string, typeof myReports> = {};
                  myReports.forEach(r => {
                    const key = r.projectName || 'Unknown Project';
                    // Filter by project name search
                    if (query && !key.toLowerCase().includes(query)) return;
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key]!.push(r);
                  });
                  const entries = Object.entries(grouped);
                  if (entries.length === 0) {
                    return (
                      <Card key="no-results">
                        <CardContent className="py-12 text-center">
                          <FileText className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                          <p className="text-slate-600">No reports found matching "{searchQuery}"</p>
                        </CardContent>
                      </Card>
                    );
                  }
                  return entries.map(([projectName, reports]) => (
                    <Card key={projectName} className="overflow-hidden">
                      <CardHeader className="pb-3 bg-slate-50 border-b">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-blue-600 flex-shrink-0" />
                          {projectName}
                        </CardTitle>
                        {reports[0]?.company && (
                          <CardDescription className="text-xs">{reports[0].company}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="divide-y divide-slate-100">
                          {reports.map((report) => (
                            <div key={report.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-slate-900 truncate">{report.inspectionType || 'Inspection'}</div>
                                <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 mt-0.5">
                                  {report.dateApproved && <span>{report.dateApproved}</span>}
                                  {report.approvedStatus && (
                                    <span className={`font-medium ${
                                      report.approvedStatus.toLowerCase().includes('approved') ? 'text-green-600' :
                                      report.approvedStatus.toLowerCase().includes('denied') ? 'text-red-600' :
                                      'text-amber-600'
                                    }`}>{report.approvedStatus}</span>
                                  )}
                                  {report.inspectorName && <span>Inspector: {report.inspectorName}</span>}
                                </div>
                              </div>
                              <a
                                href={report.reportUrl!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-4 flex-shrink-0 flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                View Report
                              </a>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ));
                })()}
              </div>
            )}
          </>
        )}

        {/* Completed Projects */}
        {activeTab === 'completed' && (
          <>
            {!filteredProjects || filteredProjects.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-600 mb-4">
                    {searchQuery ? "No completed projects found matching your search" : "No completed projects found"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map((project) => (
                  <Link key={project.id} href={project.opportunityId ? `/projects/${project.opportunityId}` : `/projects/id/${project.id}`}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-start gap-2">
                          <Building2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{project.opportunityName}</span>
                        </CardTitle>
                        {(project.address || project.lotNumber) && (
                          <CardDescription className="space-y-1 mt-2">
                            {project.address && (
                              <span className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                <span>{project.address}</span>
                              </span>
                            )}
                            {project.lotNumber && (
                              <span className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                Lot #{project.lotNumber}
                              </span>
                            )}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600">Stage:</span>
                          <span className="font-medium bg-green-100 text-green-800 px-2 py-1 rounded">
                            {project.completionStatus || 'Completed'}
                          </span>
                        </div>
                        {project.contactName && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600">Contact:</span>
                            <span className="font-medium text-slate-900">{project.contactName}</span>
                          </div>
                        )}
                        {project.completedInspections && (
                          <div className="pt-2 border-t">
                            <p className="text-xs text-slate-500 mb-1">Completed Inspections:</p>
                            <p className="text-sm text-slate-700">{project.completedInspections}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
