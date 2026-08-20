import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { hasPendingProjectAssignment, hasPendingRoleChange } from "../../../shared/utils";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  Search,
  Shield,
  UserCheck,
  UserX,
  Building2,
} from "lucide-react";

type UserRole = "user" | "admin" | "subcontractor";

interface UserRow {
  id: number;
  name: string | null;
  email: string | null;
  role: UserRole;
  company: string | null;
  createdAt: Date | null;
  lastSignedIn: Date | null;
}

interface ProjectRow {
  id: number;
  opportunityName: string | null;
  address: string | null;
  stage: string | null;
  company: string | null;
}

function RoleBadge({ role }: { role: UserRole }) {
  if (role === "admin") {
    return (
      <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100">
        <Shield className="h-3 w-3 mr-1" />
        Admin
      </Badge>
    );
  }
  if (role === "subcontractor") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
        <UserCheck className="h-3 w-3 mr-1" />
        Subcontractor
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100">
      <Users className="h-3 w-3 mr-1" />
      User
    </Badge>
  );
}

function AssignedProjectsList({
  userId,
  onProjectRemoved,
}: {
  userId: number;
  onProjectRemoved: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: assignedProjects, isLoading } = trpc.subcontractors.getAssignedProjects.useQuery(
    { userId },
    { enabled: true }
  );

  const removeProjectMutation = trpc.subcontractors.removeProject.useMutation({
    onSuccess: () => {
      toast.success("Project access removed");
      utils.subcontractors.getAssignedProjects.invalidate({ userId });
      onProjectRemoved();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to remove project");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading assigned projects…
      </div>
    );
  }

  if (!assignedProjects || assignedProjects.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic py-2">
        No projects assigned — use the search below to add one.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {assignedProjects.map((project) => (
        <div
          key={project.id}
          className="flex items-center justify-between bg-white border border-slate-200 rounded-md px-3 py-2 text-sm"
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium text-slate-800 truncate">
              {project.opportunityName || "(Unnamed)"}
            </div>
            <div className="text-xs text-slate-500 flex gap-2 mt-0.5">
              {project.address && <span>{project.address}</span>}
              {project.stage && <span className="text-slate-400">· {project.stage}</span>}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:text-red-700 hover:bg-red-50 ml-2 shrink-0"
            onClick={() =>
              removeProjectMutation.mutate({ userId, projectId: project.id })
            }
            disabled={removeProjectMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function ProjectAssignDialog({
  open,
  onClose,
  userId,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  userId: number;
  userName: string;
}) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<{ id: number; opportunityName: string | null } | null>(null);
  const { data: allProjects } = trpc.projects.list.useQuery();

  const assignMutation = trpc.subcontractors.assignProject.useMutation({
    onSuccess: (data) => {
      if (data.alreadyExists) {
        toast.info("Project is already assigned to this user");
      } else {
        toast.success("Project assigned successfully");
      }
      utils.subcontractors.getAssignedProjects.invalidate({ userId });
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to assign project");
    },
  });

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedProject(null);
    }
  }, [open]);

  const filtered = (allProjects || [])
    .filter((p) => {
      const q = search.toLowerCase();
      return (
        p.opportunityName?.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q) ||
        p.company?.toLowerCase().includes(q)
      );
    })
    .slice(0, 20);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Project to {userName}</DialogTitle>
          <DialogDescription>
            Select a project, then click Save project assignment. The subcontractor will be able to view
            the saved project after logging in.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search by project name, address, or company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1 mt-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              {search ? "No projects match your search" : "Start typing to search projects"}
            </p>
          ) : (
            filtered.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors ${selectedProject?.id === project.id ? "bg-blue-50 border-blue-300" : "hover:bg-slate-50 border-transparent hover:border-slate-200"}`}
                onClick={() => setSelectedProject({ id: project.id, opportunityName: project.opportunityName })}
                disabled={assignMutation.isPending}
              >
                <div className="font-medium text-slate-800 text-sm">
                  {project.opportunityName || "(Unnamed)"}
                </div>
                <div className="text-xs text-slate-500 flex gap-2 mt-0.5">
                  {project.address && <span>{project.address}</span>}
                  {project.company && (
                    <span className="text-slate-400">· {project.company}</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500">
            {selectedProject ? `Selected: ${selectedProject.opportunityName || "Unnamed project"}` : "Select a project to assign."}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => selectedProject && assignMutation.mutate({ userId, projectId: selectedProject.id })}
            disabled={!hasPendingProjectAssignment(selectedProject?.id) || assignMutation.isPending}
          >
            {assignMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…</> : "Save project assignment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({
  user,
  onRoleChanged,
}: {
  user: UserRow;
  onRoleChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role);
  const [updatingRole, setUpdatingRole] = useState(false);

  useEffect(() => {
    setSelectedRole(user.role);
  }, [user.role]);

  const updateRoleMutation = trpc.subcontractors.updateRole.useMutation({
    onSuccess: () => {
      toast.success(`Role updated for ${user.name || user.email}`);
      setUpdatingRole(false);
      utils.subcontractors.listAllUsers.invalidate();
      onRoleChanged();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update role");
      setUpdatingRole(false);
    },
  });

  const isSubcontractor = user.role === "subcontractor";
  const roleChangePending = hasPendingRoleChange(user.role, selectedRole);

  const saveRole = () => {
    if (!roleChangePending) return;
    setUpdatingRole(true);
    updateRoleMutation.mutate({ userId: user.id, role: selectedRole });
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* User header row */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors">
        {/* Expand toggle — only for subcontractors */}
        <button
          className={`shrink-0 text-slate-400 hover:text-slate-600 transition-colors ${!isSubcontractor ? "invisible" : ""}`}
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Avatar placeholder */}
        <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-slate-600">
            {(user.name || user.email || "?")[0].toUpperCase()}
          </span>
        </div>

        {/* Name / email */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900 text-sm truncate">
            {user.name || "(No name)"}
          </div>
          <div className="text-xs text-slate-500 truncate">{user.email}</div>
        </div>

        {/* Company */}
        {user.company && (
          <div className="hidden md:flex items-center gap-1 text-xs text-slate-500 shrink-0">
            <Building2 className="h-3 w-3" />
            {user.company}
          </div>
        )}

        {/* Role badge */}
        <div className="shrink-0">
          <RoleBadge role={user.role} />
        </div>

        {/* Select a role, then explicitly save it so the change persists before navigating away. */}
        <div className="shrink-0 w-40 space-y-1.5">
          <Select value={selectedRole} onValueChange={(newRole: UserRole) => setSelectedRole(newRole)} disabled={updatingRole}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="subcontractor">Subcontractor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            className="h-7 w-full text-xs"
            onClick={saveRole}
            disabled={!roleChangePending || updatingRole}
          >
            {updatingRole ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving…</> : "Save role"}
          </Button>
        </div>
      </div>

      {/* Expanded project list — only for subcontractors */}
      {isSubcontractor && expanded && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Assigned Projects
            </h4>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={() => setShowAssignDialog(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Project
            </Button>
          </div>
          <AssignedProjectsList
            userId={user.id}
            onProjectRemoved={() => {
              /* list auto-refreshes via invalidate */
            }}
          />
        </div>
      )}

      {/* Assign dialog */}
      <ProjectAssignDialog
        open={showAssignDialog}
        onClose={() => setShowAssignDialog(false)}
        userId={user.id}
        userName={user.name || user.email || "this user"}
      />
    </div>
  );
}

export default function SubcontractorManager() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");

  const { data: allUsers, isLoading, refetch } = trpc.subcontractors.listAllUsers.useQuery();

  const filtered = (allUsers || []).filter((u) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.company?.toLowerCase().includes(q);
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const subcontractorCount = (allUsers || []).filter((u) => u.role === "subcontractor").length;

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User &amp; Subcontractor Management
            </CardTitle>
            <CardDescription>
              Manage portal user roles and assign specific projects to subcontractors.
              Subcontractors only see projects explicitly assigned to them.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
              <UserCheck className="h-3 w-3 mr-1" />
              {subcontractorCount} subcontractor{subcontractorCount !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search by name, email, or company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={roleFilter} onValueChange={(v: any) => setRoleFilter(v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="user">Users only</SelectItem>
              <SelectItem value="subcontractor">Subcontractors</SelectItem>
              <SelectItem value="admin">Admins only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* How-to hint */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
          <strong>How it works:</strong> Choose a role, then click <em>Save role</em> before leaving
          this screen. Once a user is saved as a <em>Subcontractor</em>, click the arrow next to their name to expand and assign specific projects.
          Subcontractors will only see their assigned projects when they log in.
        </div>

        {/* User list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading users…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            {search || roleFilter !== "all"
              ? "No users match your filters"
              : "No portal users found"}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((u) => (
              <UserRow key={u.id} user={u as UserRow} onRoleChanged={refetch} />
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
            <strong>User</strong> — sees all projects for their company
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <strong>Subcontractor</strong> — sees only explicitly assigned projects
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            <strong>Admin</strong> — full access to all portal features
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
