// v0bd1ee34 - Latest version with all admin fixes
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Building2, Loader2, LogOut, MapPin, RefreshCw, Search, BarChart3, CheckCircle2, Mail } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";


export default function Projects() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  const { data: projects, isLoading: projectsLoading, refetch } = trpc.projects.list.useQuery();
  const { data: pastInspections, isLoading: pastInspectionsLoading } = trpc.pastInspections.list.useQuery();
  
  const syncMutation = trpc.projects.sync.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.count} projects from Google Sheets`);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to sync projects");
    },
  });

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  const handleSync = () => {
    syncMutation.mutate();
  };

  // Filter active projects
  const filteredProjects = projects?.filter((project) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      project.opportunityName?.toLowerCase().includes(query) ||
      project.address?.toLowerCase().includes(query) ||
      project.contactName?.toLowerCase().includes(query)
    );
    
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

  const isLoading = activeTab === 'active' ? projectsLoading : pastInspectionsLoading;

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
          {/* Tabs */}
          <div className="flex gap-2">
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
          </div>
          
          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder={activeTab === 'completed' ? "Search inspections..." : "Search projects..."}
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
                    Sync from Google Sheets
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                      <CardHeader>
                        <CardTitle className="flex items-start gap-2">
                          <Building2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{project.opportunityName}</span>
                        </CardTitle>
                        <CardDescription className="flex items-start gap-2 mt-2">
                          <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">
                            {project.address || "No address provided"}
                          </span>
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
                          
                          {/* In Progress Inspections */}
                          {(project.inspection1Type || project.inspection2Type || project.inspection3Type || project.inspection4Type || project.inspection5Type) && (
                            <div className="pt-2 border-t">
                              <p className="text-xs font-semibold text-slate-600 mb-2">In Progress Inspections:</p>
                              <div className="space-y-1">
                                {project.inspection1Type && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-600">{project.inspection1Type}</span>
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">In Progress</span>
                                  </div>
                                )}
                                {project.inspection2Type && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-600">{project.inspection2Type}</span>
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">In Progress</span>
                                  </div>
                                )}
                                {project.inspection3Type && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-600">{project.inspection3Type}</span>
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">In Progress</span>
                                  </div>
                                )}
                                {project.inspection4Type && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-600">{project.inspection4Type}</span>
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">In Progress</span>
                                  </div>
                                )}
                                {project.inspection5Type && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-600">{project.inspection5Type}</span>
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">In Progress</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* Past Inspections Table */}
        {activeTab === 'completed' && (
          <>
            {!filteredPastInspections || filteredPastInspections.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-600 mb-4">
                    {searchQuery ? "No inspections found matching your search" : "No completed inspections found"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Past Inspections</CardTitle>
                  <CardDescription>Completed inspections from your projects</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">Project Name</th>
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">Inspection Type</th>
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">Status</th>
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">Date Approved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPastInspections.map((inspection, index) => (
                          <tr key={index} className="border-b hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 text-slate-900 font-medium">{inspection.projectName}</td>
                            <td className="py-3 px-4 text-slate-600">{inspection.inspectionType}</td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                inspection.approvedStatus?.toLowerCase() === 'approved' 
                                  ? 'bg-green-100 text-green-800' 
                                  : inspection.approvedStatus?.toLowerCase() === 'denied'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {inspection.approvedStatus || 'Pending'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600">{inspection.dateApproved || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
