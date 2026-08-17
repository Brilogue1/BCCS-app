import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, Calendar, CheckCircle2, Download, FileText, Link2, Loader2, Mail, Phone, Plus, RefreshCw, Trash2, Upload, User, X } from "lucide-react";
import { useState, useRef } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import inspectionTypes from "../../../shared/inspectionTypes.json";
import permitTypesData from "../../../shared/permitTypes.json";
import { normalizeInspectionType, buildFullInspectionName, lookupInspectionsForCRM, getPendingInspectionRequests } from "../../../shared/utils";

const permitTypesMap = permitTypesData as Record<string, Record<string, Array<{ section: string; name: string }>>>;

// Frontend API URL for file uploads - ensure trailing slash for URL construction
const FORGE_BASE = import.meta.env.VITE_FRONTEND_FORGE_API_URL || 'https://forge.butterfly-effect.dev';
const FORGE_API_URL = FORGE_BASE.endsWith('/') ? FORGE_BASE : `${FORGE_BASE}/`;
const FORGE_API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  // id can be either an opportunityId (string) or a numeric DB id (fallback)
  // Prefer opportunityId-based lookup for stable URLs across syncs
  const isNumericId = /^\d+$/.test(id || '');
  const opportunityId = isNumericId ? '' : (id || '');
  const numericId = isNumericId ? parseInt(id || '0') : 0;

  const { data: projectByOppId, isLoading: loadingByOppId } = trpc.projects.getByOpportunityId.useQuery(
    { opportunityId },
    { enabled: !!opportunityId }
  );
  const { data: projectById, isLoading: loadingById } = trpc.projects.getById.useQuery(
    { id: numericId },
    { enabled: isNumericId && numericId > 0 }
  );

  const project = projectByOppId || projectById;
  const isLoading = opportunityId ? loadingByOppId : loadingById;
  const projectId = project?.id || numericId;

  // Poll scheduled columns (U-AA) every 5 min so Requested badges clear once scheduled
  const { data: inspections } = trpc.inspections.list.useQuery({ projectId }, { enabled: projectId > 0 });
  const { data: contacts } = trpc.contacts.list.useQuery({ projectId }, { enabled: projectId > 0 });
  const { data: pastInspections } = trpc.pastInspections.list.useQuery();
  const { data: files, refetch: refetchFiles } = trpc.files.list.useQuery({ projectId }, { enabled: projectId > 0 });
  const { data: inspectorPhone } = trpc.projects.getInspectorPhone.useQuery(
    { inspectorName: project?.assignedInspector || '' },
    { enabled: !!project?.assignedInspector }
  );

  // Poll project data (scheduled columns U-AA) every 5 min
  // We re-use the project query's refetch by invalidating on an interval
  // (the query is already defined above; we set refetchInterval via options)
  const { data: _projectScheduledPoll } = trpc.projects.getByOpportunityId.useQuery(
    { opportunityId },
    {
      enabled: !!opportunityId,
      refetchInterval: 5 * 60 * 1000, // 5 minutes
    }
  );

  // Poll Past Inspections sheet every 30 min to clear Requested badges once completed
  const { data: completedTypesFromSheet } = trpc.pastInspections.getCompletedTypesByOpportunityId.useQuery(
    { opportunityId },
    {
      enabled: !!opportunityId,
      refetchInterval: 30 * 60 * 1000, // 30 minutes
    }
  );
  // completedTypesFromSheet already contains normalized types from the backend
  const sheetCompletedTypeSet = new Set<string>(completedTypesFromSheet || []);

  // Fetch full completed inspection rows from Past Inspections sheet for display
  const { data: completedInspectionsFromSheet } = trpc.pastInspections.getCompletedByOpportunityId.useQuery(
    { opportunityId },
    {
      enabled: !!opportunityId,
      refetchInterval: 30 * 60 * 1000, // 30 minutes
    }
  );

  const [inspectionCooldown, setInspectionCooldown] = useState(false);
  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [updateNotesDialogOpen, setUpdateNotesDialogOpen] = useState(false);
  const [editingInspection, setEditingInspection] = useState<{ id: number; type: string; notes: string } | null>(null);
  const [editNotesValue, setEditNotesValue] = useState('');

  // Reschedule state
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleInspType, setRescheduleInspType] = useState('');
  const [rescheduleNewNotes, setRescheduleNewNotes] = useState('');
  const [rescheduleCooldown, setRescheduleCooldown] = useState(false);

  const rescheduleMutation = trpc.reschedule.submit.useMutation({
    onSuccess: () => {
      toast.success('Reschedule request submitted successfully');
      setRescheduleDialogOpen(false);
      setRescheduleInspType('');
      setRescheduleNewNotes('');
      setRescheduleCooldown(false);
    },
    onError: (error) => {
      setRescheduleCooldown(true);
      setTimeout(() => setRescheduleCooldown(false), 5000);
      toast.error(error.message || 'Failed to submit reschedule request. Please wait a moment and try again.');
    },
  });

  const handleRescheduleSubmit = () => {
    if (!rescheduleInspType.trim() || !rescheduleNewNotes.trim()) return;
    if (rescheduleCooldown) return;
    rescheduleMutation.mutate({
      opportunityName: project?.opportunityName || '',
      pipeline: project?.stage || '',
      company: project?.company || '',
      opportunityId: project?.opportunityId || '',
      contactId: project?.contactId || '',
      inspectionType: rescheduleInspType.trim(),
      newNotesDate: rescheduleNewNotes.trim(),
    });
  };

  // Delete inspection state (admin only)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingInspection, setDeletingInspection] = useState<{ id: number; type: string } | null>(null);

  const deleteInspectionMutation = trpc.inspections.delete.useMutation({
    onSuccess: () => {
      toast.success('Inspection deleted successfully');
      setDeleteConfirmOpen(false);
      setDeletingInspection(null);
      utils.inspections.list.invalidate({ projectId });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete inspection');
    },
  });

  const resendInspectionMutation = trpc.inspections.resend.useMutation({
    onSuccess: () => {
      toast.success('Inspection re-sent to Google Sheets successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to re-send inspection');
    },
  });

  // Required Inspections state
  const { data: requiredInspectionsList, refetch: refetchRequired } = trpc.requiredInspections.list.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );
  const [permitPickerOpen, setPermitPickerOpen] = useState(false);
  const [selectedPermitType, setSelectedPermitType] = useState('');
  const [selectedSubType, setSelectedSubType] = useState('');
  const [addRequiredOpen, setAddRequiredOpen] = useState(false);
  const [newRequiredName, setNewRequiredName] = useState('');
  const [newRequiredSection, setNewRequiredSection] = useState('CUSTOM');
  // Track which required inspection is being scheduled (pre-fills the schedule dialog)
  const [quickScheduleType, setQuickScheduleType] = useState<string | null>(null);

  const generateRequiredMutation = trpc.requiredInspections.generate.useMutation({
    onSuccess: () => {
      toast.success('Required inspections generated');
      setPermitPickerOpen(false);
      setSelectedPermitType('');
      setSelectedSubType('');
      refetchRequired();
    },
    onError: (err) => toast.error(err.message || 'Failed to generate required inspections'),
  });

  const addRequiredMutation = trpc.requiredInspections.add.useMutation({
    onSuccess: () => {
      toast.success('Inspection added to required list');
      setAddRequiredOpen(false);
      setNewRequiredName('');
      setNewRequiredSection('CUSTOM');
      refetchRequired();
    },
    onError: (err) => toast.error(err.message || 'Failed to add inspection'),
  });

  const deleteRequiredMutation = trpc.requiredInspections.delete.useMutation({
    onSuccess: () => {
      toast.success('Inspection removed from required list');
      refetchRequired();
    },
    onError: (err) => toast.error(err.message || 'Failed to remove inspection'),
  });

  // Group required inspections by permitType+subType for display
  const requiredGroups = (requiredInspectionsList || []).reduce<Record<string, { permitType: string; subType: string; items: typeof requiredInspectionsList }>>((acc, item) => {
    const key = `${item.permitType}||${item.subType}`;
    if (!acc[key]) acc[key] = { permitType: item.permitType, subType: item.subType, items: [] };
    acc[key].items!.push(item);
    return acc;
  }, {});

  // Delete project state (admin only)
  const [deleteProjectConfirmOpen, setDeleteProjectConfirmOpen] = useState(false);
  const deleteProjectMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success('Project deleted successfully');
      setDeleteProjectConfirmOpen(false);
      window.location.href = '/projects';
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete project');
    },
  });

  // Inspection form state
  const [inspectionType, setInspectionType] = useState('');
  const [inspectionTypeSearch, setInspectionTypeSearch] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState("");
  // When true, the inspection type was pre-filled from a required inspection row
  // and should be shown as a locked read-only field instead of the dropdown
  const [inspectionTypeFromRequired, setInspectionTypeFromRequired] = useState(false);

  // Contact form state
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");

  // Plans submit state
  const [plansDropboxLink, setPlansDropboxLink] = useState('');
  const [plansNotes, setPlansNotes] = useState('');
  const [plansSubmitting, setPlansSubmitting] = useState(false);
  const [plansCooldown, setPlansCooldown] = useState(false);
  const [plansSubmitSuccess, setPlansSubmitSuccess] = useState(false);

  const plansSubmitMutation = trpc.plansUpload.submitLink.useMutation({
    onSuccess: () => {
      setPlansSubmitting(false);
      setPlansSubmitSuccess(true);
      setPlansDropboxLink('');
      setPlansNotes('');
    },
    onError: (error) => {
      setPlansSubmitting(false);
      setPlansCooldown(true);
      setTimeout(() => setPlansCooldown(false), 5000);
      toast.error(error.message || 'Failed to submit. Please wait a moment before trying again.');
    },
  });

  const handlePlansSubmit = () => {
    if (!plansDropboxLink.trim()) {
      toast.error('Please enter a Dropbox or Google Drive link');
      return;
    }
    if (plansCooldown) return;
    setPlansSubmitting(true);
    plansSubmitMutation.mutate({
      address: project?.address || '',
      dropboxLink: plansDropboxLink.trim(),
      notes: plansNotes.trim(),
      oppId: project?.opportunityId || '',
    });
  };

  // File upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<{ count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const createInspectionMutation = trpc.inspections.create.useMutation({
    onSuccess: () => {
      toast.success("Inspection scheduled successfully");
      setInspectionDialogOpen(false);
      setInspectionType("");
      setInspectionNotes("");
      setInspectionCooldown(false);
      setInspectionTypeFromRequired(false);
      utils.inspections.list.invalidate({ projectId });
      if (opportunityId) {
        utils.projects.getByOpportunityId.invalidate({ opportunityId });
      } else {
        utils.projects.getById.invalidate({ id: numericId });
      }
    },
    onError: (error) => {
      // Apply 5-second cooldown after error to prevent double-submit
      setInspectionCooldown(true);
      setTimeout(() => setInspectionCooldown(false), 5000);
      toast.error(error.message || "Failed to schedule inspection. Please wait a moment before trying again.");
    },
  });

  const updateNotesMutation = trpc.inspections.updateNotes.useMutation({
    onSuccess: () => {
      toast.success('Date request updated successfully');
      setUpdateNotesDialogOpen(false);
      setEditingInspection(null);
      utils.inspections.list.invalidate({ projectId });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update date request');
    },
  });

  const createContactMutation = trpc.contacts.create.useMutation({
    onSuccess: () => {
      toast.success("Contact email added successfully");
      setContactDialogOpen(false);
      setContactEmail("");
      setContactName("");
      utils.contacts.list.invalidate({ projectId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add contact email");
    },
  });

  const deleteContactMutation = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success("Contact email removed");
      utils.contacts.list.invalidate({ projectId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove contact email");
    },
  });

  const uploadFileMutation = trpc.files.upload.useMutation({
    onSuccess: () => {
      toast.success("File uploaded successfully");
      setUploadDialogOpen(false);
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      refetchFiles();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to upload file");
    },
  });

  const deleteFileMutation = trpc.files.delete.useMutation({
    onSuccess: () => {
      toast.success("File deleted");
      refetchFiles();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete file");
    },
  });

  const handleScheduleInspection = (e: React.FormEvent) => {
    e.preventDefault();
    if (inspectionCooldown) return;
    createInspectionMutation.mutate({
      projectId,
      inspectionType,
      notes: inspectionNotes,
    });
  };

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    createContactMutation.mutate({
      projectId,
      email: contactEmail,
      name: contactName,
    });
  };

  const handleDeleteContact = (contactId: number) => {
    deleteContactMutation.mutate({ projectId, contactId });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Check file sizes (max 25MB each)
    const oversizedFiles = files.filter(f => f.size > 25 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      toast.error(`${oversizedFiles.length} file(s) exceed 25MB limit`);
      return;
    }
    setSelectedFiles(files);
  };

  const handleFileUpload = async () => {
    if (selectedFiles.length === 0 || !project) return;

    const total = selectedFiles.length;
    setUploading(true);
    setUploadProgress({ current: 0, total });
    setUploadSuccess(null);
    try {
      // Upload each file sequentially
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress({ current: i + 1, total });
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileKey = `bccs-uploads/${projectId}/${timestamp}-${randomSuffix}-${sanitizedFileName}`;

        // Upload to S3 via server-side endpoint (avoids CORS issues)
        const formData = new FormData();
        formData.append('file', file);

        const uploadUrl = `/api/upload?path=${encodeURIComponent(fileKey)}`;

        const response = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
          throw new Error(errorData.error || `Upload failed: ${response.status}`);
        }

        const result = await response.json();
        const fileUrl = result.url;

        // Save file record to database (which also logs to Google Sheets)
        uploadFileMutation.mutate({
          projectId,
          fileName: file.name,
          fileUrl,
          fileKey,
          fileSize: file.size,
          mimeType: file.type,
        });
      }

      setUploadSuccess({ count: total });
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      utils.files.list.invalidate({ projectId });
    } catch (error) {
      console.error('Upload error:', error);
      toast.error("Failed to upload file. Please try again.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteFile = (fileId: number) => {
    if (confirm("Are you sure you want to delete this file?")) {
      deleteFileMutation.mutate({ projectId, fileId });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin mb-4" />
        <p className="text-slate-600">Loading project details...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold mb-4">Project Not Found</h1>
        <Link href="/projects">
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Projects
          </Button>
        </Link>
      </div>
    );
  }

  // Raw completed inspections text from column H
  const completedInspectionsText = (project.completedInspections || '').trim();

  // Filter scheduled inspection types - only show if not blank, not "_", and not already completed in Past Inspections sheet
  const isValidInspection = (val: string | null | undefined) => val && val.trim() !== '' && val.trim() !== '_';
  const scheduledTypes = [
    { type: project.inspection1Type, result: project.inspection1Result },
    { type: project.inspection2Type, result: project.inspection2Result },
    { type: project.inspection3Type, result: project.inspection3Result },
    { type: project.inspection4Type, result: null },
    { type: project.inspection5Type, result: null },
  ].filter(i => isValidInspection(i.type) && !sheetCompletedTypeSet.has(normalizeInspectionType(i.type)));

  // Build a set of inspection types already confirmed in the Google Sheets (U-AA columns)
  // so we can hide DB "Requested" entries that have already been picked up by the sheet.
  // Use normalized types so minor wording differences still match.
  const sheetScheduledTypeSet = new Set(
    scheduledTypes.map(i => normalizeInspectionType(i.type))
  );

  // Also build a set of inspection types that appear in the Completed Inspections text (column H).
  // Build a set of completed inspection types from the completed inspections text.
  // Handles two formats:
  //   1. Pipe-separated with em-dash date prefix: "2026-04-21 — BLDG LINTEL | 2026-04-14 — BLDG SLAB"
  //   2. Comma-separated with result suffix:       "PLUMB ROUGH - 1ST - Approved, PLUMB SEWER LATERAL - Approved"
  // For format 2, we strip the trailing " - <result>" suffix to get the bare type.
  const completedTypeSet = new Set<string>();
  if (completedInspectionsText) {
    // Try pipe-separated format first (contains em-dash '—')
    if (completedInspectionsText.includes('—')) {
      const segments = completedInspectionsText.split('|');
      for (const seg of segments) {
        const dashIdx = seg.indexOf('—');
        if (dashIdx !== -1) {
          const typePart = seg.substring(dashIdx + 1).trim().toUpperCase();
          if (typePart && typePart !== '_') completedTypeSet.add(typePart);
        }
      }
    } else {
      // Comma-separated format: "TYPE - Result, TYPE2 - Result2"
      // Known result suffixes to strip
      const resultSuffixes = [' - APPROVED', ' - FAILED', ' - PARTIAL', ' - CANCELLED', ' - PENDING', ' - PASS', ' - FAIL'];
      const segments = completedInspectionsText.split(',');
      for (const seg of segments) {
        let typePart = seg.trim().toUpperCase();
        for (const suffix of resultSuffixes) {
          if (typePart.endsWith(suffix)) {
            typePart = typePart.slice(0, typePart.length - suffix.length).trim();
            break;
          }
        }
        if (typePart && typePart !== '_') completedTypeSet.add(typePart);
      }
    }
  }

  // Only show DB requests that are still awaiting GHL pickup and whose type is
  // not already in the sheet (scheduled or completed). Historical DB records
  // with status "scheduled" must not consume a new request slot after the GHL
  // field has cleared.
  // Hide a Requested badge if the type is:
  //   1. Already in the sheet's scheduled columns (U-AA)
  //   2. Already in the column H completed text (legacy fallback)
  //   3. Already in the Past Inspections sheet tab (authoritative source, polled every 30 min)
  const pendingDbInspections = getPendingInspectionRequests(inspections || [], sheetScheduledTypeSet).filter(
    (insp: any) => {
      const tNorm = normalizeInspectionType(insp.inspectionType);
      const tRaw = (insp.inspectionType || '').trim().toUpperCase();
      // Use normalized comparison for all completed-inspection sources.
      return !completedTypeSet.has(tRaw) && !sheetCompletedTypeSet.has(tNorm);
    }
  );

  const hasScheduledInspections = scheduledTypes.length > 0 || pendingDbInspections.length > 0;

  // Block scheduling while the project is still in the Proposal stage (invoice not yet paid)
  const isProposalStage = (project?.stage || '').toLowerCase().trim() === 'proposal';

  // State-based 5-slot cap: GHL scheduled slots (U-AA, not yet completed) + truly pending DB requests.
  // pendingDbInspections is already filtered to exclude types in GHL scheduled cols and completed types,
  // so scheduledTypes.length + pendingDbInspections.length gives the accurate in-progress count.
  const inProgressCount = scheduledTypes.length + pendingDbInspections.length;
  const atSlotCap = inProgressCount >= 5;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto py-6">
          <Link href="/projects">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{project.opportunityName}</h1>
              {project.address && (
                <p className="text-slate-600 mt-2">{project.address}</p>
              )}
            </div>
            {user?.role === 'admin' && (
              <div className="shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setDeleteProjectConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Project
                </Button>
              </div>
            )}
          </div>

          {/* Delete Project Confirmation Dialog */}
          <Dialog open={deleteProjectConfirmOpen} onOpenChange={setDeleteProjectConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Project</DialogTitle>
                <DialogDescription>
                  Are you sure you want to permanently delete <strong>{project.opportunityName}</strong>? This will also delete all associated inspections, contacts, and files. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDeleteProjectConfirmOpen(false)}
                  disabled={deleteProjectMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => deleteProjectMutation.mutate({ id: project.id })}
                  disabled={deleteProjectMutation.isPending}
                >
                  {deleteProjectMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</>
                  ) : 'Delete Project'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {/* Support Link */}
        <div className="bg-slate-50 border-t py-2">
          <div className="container mx-auto text-center">
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

      {/* NOC Requirement Banner — shown until the first inspection has been scheduled */}
      {(() => {
        const hasAnyInspection = scheduledTypes.length > 0 || pendingDbInspections.length > 0 || (completedInspectionsFromSheet && completedInspectionsFromSheet.length > 0);
        if (hasAnyInspection) return null;
        return (
          <div className="bg-amber-50 border-y border-amber-300">
            <div className="container mx-auto px-4 py-3 flex items-start gap-3">
              <span className="text-amber-600 text-lg shrink-0 mt-0.5">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-900">NOC Reminder</p>
                <p className="text-sm text-amber-800 mt-0.5">
                  Section 105.8 of the Florida Building Code requires the Notice of Commencement (NOC) to be uploaded with the jurisdiction prior to the first inspection. Please ensure your NOC has been recorded before scheduling your first inspection.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="container mx-auto py-8 space-y-6">
        {/* Project Information */}
        <Card>
          <CardHeader>
            <CardTitle>Project Information</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Project Name</p>
              <p className="text-lg">{project.opportunityName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Address</p>
              <p className="text-lg">{project.address || "No address provided"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Subdivision</p>
              <p className="text-lg">{project.subdivision || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Lot #</p>
              <p className="text-lg">{project.lotNumber || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Permit #</p>
              <p className="text-lg">{project.permitNumber || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Stage</p>
              <p className="text-lg">{project.stage || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Assigned Permit Tech</p>
              <p className="text-lg">{project.assignedPermitTech || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Assigned Plans Examiner</p>
              <p className="text-lg">{project.assignedPlansExaminer || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Assigned Inspector</p>
              <p className="text-lg">{project.assignedInspector || "N/A"}</p>
              {inspectorPhone && (
                <a
                  href={`tel:${inspectorPhone}`}
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mt-1"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {inspectorPhone}
                </a>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Jurisdiction</p>
              <p className="text-lg">{project.jurisdiction || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Contact Name</p>
              <p className="text-lg">{project.contactName || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Phone</p>
              <p className="text-lg">{project.phone || "N/A"}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-slate-500">Email</p>
              <p className="text-lg">{project.email || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        {/* Required Inspections Card */}
        {<Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="min-w-0">
              <CardTitle>Required Inspections</CardTitle>
              <CardDescription>Inspections required for this project based on permit type</CardDescription>
            </div>
            {user?.role === 'admin' && (
              <div className="flex items-center gap-2 shrink-0">
                {/* Add custom inspection */}
                <Dialog open={addRequiredOpen} onOpenChange={setAddRequiredOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" disabled={Object.keys(requiredGroups).length === 0}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Inspection
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[min(90vw,420px)] overflow-hidden">
                     <DialogHeader>
                      <DialogTitle>Add Custom Required Inspection</DialogTitle>
                      <DialogDescription>Add a custom inspection to the required list for this project</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div>
                        <Label>Permit Type Group</Label>
                        <Select value={`${Object.keys(requiredGroups)[0] || ''}`} disabled>
                          <SelectTrigger className="w-full overflow-hidden"><div className="truncate text-sm text-left max-w-[300px]">{(() => { const k = Object.keys(requiredGroups)[0]; if (!k) return 'Uses first permit type'; const g = requiredGroups[k] as any; return `${g.permitType} — ${g.subType}`; })()}</div></SelectTrigger>
                          <SelectContent>
                            {Object.entries(requiredGroups).map(([key, g]) => (
                              <SelectItem key={key} value={key}>{g.permitType} — {g.subType}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500 mt-1">Will be added to the first permit type group</p>
                      </div>
                      <div>
                        <Label>Section</Label>
                        <Select value={newRequiredSection} onValueChange={setNewRequiredSection}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['BUILDING', 'ELECTRICAL', 'MECHANICAL', 'PLUMBING', 'FIRE', 'MISC', 'CUSTOM'].map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Inspection Name</Label>
                        <Input
                          value={newRequiredName}
                          onChange={e => setNewRequiredName(e.target.value)}
                          placeholder="e.g. FRAMING ROUGH"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setAddRequiredOpen(false)}>Cancel</Button>
                      <Button
                        disabled={!newRequiredName.trim() || addRequiredMutation.isPending}
                        onClick={() => {
                          const firstKey = Object.keys(requiredGroups)[0] || '';
                          const [pt, st] = firstKey.split('||');
                          addRequiredMutation.mutate({
                            projectId,
                            permitType: pt || 'CUSTOM',
                            subType: st || 'CUSTOM',
                            section: newRequiredSection,
                            inspectionName: newRequiredName.trim().toUpperCase(),
                          });
                        }}
                      >
                        {addRequiredMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Permit type picker */}
                <Dialog open={permitPickerOpen} onOpenChange={(o) => { setPermitPickerOpen(o); if (!o) { setSelectedPermitType(''); setSelectedSubType(''); } }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Set Permit Type
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Set Required Inspections</DialogTitle>
                      <DialogDescription>
                        Select a permit type and work type to generate the required inspection list.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      {/* Step 1: Permit Type */}
                      <div>
                        <Label>Permit Type</Label>
                        <Select value={selectedPermitType} onValueChange={(v) => { setSelectedPermitType(v); setSelectedSubType(''); }}>
                          <SelectTrigger><SelectValue placeholder="Select permit type..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="RESIDENTIAL">Residential</SelectItem>
                            <SelectItem value="COMMERCIAL">Commercial</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Step 2: Work Type */}
                      {selectedPermitType && (() => {
                        const workTypeOptions: Record<string, string[]> = {
                          RESIDENTIAL: ['New Construction', 'Addition / Remodel', 'Electrical', 'Plumbing', 'Mechanical', 'Gas', 'Roof', 'Fence', 'Swimming Pool', 'Sign', 'Mobile Home', 'Carport / Shed'],
                          COMMERCIAL:  ['New Construction', 'Addition / Remodel', 'Electrical', 'Plumbing', 'Mechanical', 'Gas', 'Roof', 'Fence', 'Swimming Pool', 'Sign'],
                        };
                        return (
                          <div>
                            <Label>Work Type</Label>
                            <Select value={selectedSubType} onValueChange={setSelectedSubType}>
                              <SelectTrigger><SelectValue placeholder="Select work type..." /></SelectTrigger>
                              <SelectContent className="max-h-64 overflow-y-auto">
                                {(workTypeOptions[selectedPermitType] || []).map(wt => (
                                  <SelectItem key={wt} value={wt}>{wt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })()}

                      {/* Preview inspection list */}
                      {selectedPermitType && selectedSubType && (() => {
                        const lookup = lookupInspectionsForCRM(selectedPermitType, selectedSubType);
                        const inspList = lookup ? (permitTypesMap[lookup.permitType]?.[lookup.subType] || []) : [];
                        return inspList.length > 0 ? (
                          <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                            <p className="text-xs font-semibold text-slate-600 mb-2">Inspections to be generated ({inspList.length}):</p>
                            {inspList.map((insp, i) => (
                              <div key={i} className="text-xs text-slate-700 py-0.5">
                                <span className="text-slate-400 mr-1">{insp.section}</span>{buildFullInspectionName(insp.section, insp.name)}
                              </div>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setPermitPickerOpen(false)}>Cancel</Button>
                      <Button
                        disabled={!selectedPermitType || !selectedSubType || generateRequiredMutation.isPending}
                        onClick={() => {
                          const lookup = lookupInspectionsForCRM(selectedPermitType, selectedSubType);
                          if (!lookup) { toast.error('No inspection list found for this combination'); return; }
                          const inspList = permitTypesMap[lookup.permitType]?.[lookup.subType] || [];
                          generateRequiredMutation.mutate({ projectId, permitType: lookup.permitType, subType: lookup.subType, inspections: inspList });
                        }}
                      >
                        {generateRequiredMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate Required Inspections'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {Object.keys(requiredGroups).length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                {user?.role === 'admin'
                  ? 'No required inspections set. Click "Set Permit Type" to generate the list.'
                  : 'No required inspections have been set for this project yet.'}
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(requiredGroups).map(([key, group]) => {
                  // Group items by section
                  const bySection = (group.items || []).reduce<Record<string, typeof requiredInspectionsList>>((acc, item) => {
                    const s = item.section || 'OTHER';
                    if (!acc[s]) acc[s] = [];
                    acc[s]!.push(item);
                    return acc;
                  }, {});

                  return (
                    <div key={key}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold uppercase tracking-wide bg-blue-100 text-blue-800 px-2 py-0.5 rounded">{group.permitType}</span>
                        <span className="text-xs font-medium text-slate-600">{group.subType}</span>
                      </div>
                      {Object.entries(bySection).map(([section, items]) => (
                        <div key={section} className="mb-4">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 border-b pb-1">{section}</p>
                          <div className="space-y-1">
                            {(items || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((item) => {
                              // Determine status by cross-referencing scheduled/completed inspections
                              const normName = normalizeInspectionType(item.inspectionName);
                              const isCompleted = sheetCompletedTypeSet.has(normName);
                              const isScheduled = !isCompleted && (
                                sheetScheduledTypeSet.has(normName) ||
                                (inspections || []).some((i: any) => normalizeInspectionType(i.inspectionType) === normName)
                              );

                              // Hide items that are scheduled or completed — they already appear
                              // in the Scheduled / Completed Inspections sections below
                              if (isScheduled || isCompleted) return null;

                              return (
                                <div key={item.id} className={`flex items-center justify-between py-1.5 px-2 rounded group ${
                                  isCompleted ? 'hover:bg-slate-50' :
                                  isScheduled ? 'bg-yellow-50 border border-yellow-200' :
                                  'hover:bg-slate-50'
                                }`}>
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <div>
                                      <span className={`text-sm truncate ${
                                        isCompleted ? 'line-through text-slate-400' : 'text-slate-700'
                                       }`}>{buildFullInspectionName(item.section || '', item.inspectionName)}</span>
                                      {isScheduled && !isCompleted && (() => {
                                        const dbMatch = (inspections || []).find((i: any) =>
                                          normalizeInspectionType(i.inspectionType) === normName
                                        );
                                        return dbMatch?.createdAt ? (
                                          <p className="text-xs text-yellow-700 mt-0.5">Requested {new Date(dbMatch.createdAt).toLocaleDateString()}</p>
                                        ) : null;
                                      })()}
                                    </div>
                                    {isCompleted && <span className="text-xs text-green-600 font-medium shrink-0">Completed</span>}
                                    {isScheduled && !isCompleted && <span className="text-xs text-yellow-700 font-medium shrink-0">Scheduled</span>}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {!isCompleted && !isScheduled && (
                                      <Button
                                        size="sm"
                                        className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                        disabled={isProposalStage || atSlotCap}
                                        title={isProposalStage ? 'Scheduling will become available when the proposal is accepted' : atSlotCap ? '5 inspections in progress — once one completes, you can schedule more' : undefined}
                                        onClick={() => {
                                          if (isProposalStage || atSlotCap) return;
                                          setInspectionType(buildFullInspectionName(item.section || '', item.inspectionName));
                                          setInspectionTypeSearch('');
                                          setInspectionTypeFromRequired(true);
                                          setInspectionDialogOpen(true);
                                        }}
                                      >
                                        <Calendar className="h-3 w-3 mr-1" />
                                        Schedule
                                      </Button>
                                    )}
                                    {user?.role === 'admin' && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                                        onClick={() => deleteRequiredMutation.mutate({ id: item.id })}
                                        disabled={deleteRequiredMutation.isPending}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>}

        {/* Scheduled Inspections - Combined section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Scheduled Inspections</CardTitle>
              <CardDescription>Inspections scheduled for this project</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Reschedule Inspection Dialog */}
              <Dialog open={rescheduleDialogOpen} onOpenChange={(open) => { setRescheduleDialogOpen(open); if (!open) { setRescheduleInspType(''); setRescheduleNewNotes(''); } }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reschedule
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Reschedule Inspection</DialogTitle>
                    <DialogDescription>
                      Request a reschedule for an inspection on {project.opportunityName}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-amber-900">
                      <strong>Note:</strong> This will log your reschedule request to our team. We will contact you to confirm the new date.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label>Project Name</Label>
                      <Input value={project.opportunityName || ''} disabled className="bg-slate-50" />
                    </div>
                    <div>
                      <Label htmlFor="reschedule-type">Inspection Type <span className="text-red-500">*</span></Label>
                      <Input
                        id="reschedule-type"
                        value={rescheduleInspType}
                        onChange={(e) => setRescheduleInspType(e.target.value)}
                        placeholder="e.g. BLDG FRAMING ROUGH"
                        className="mt-1"
                      />
                      <p className="text-xs text-slate-500 mt-1">Enter the inspection type you need rescheduled.</p>
                    </div>
                    <div>
                      <Label htmlFor="reschedule-notes">New Requested Date &amp; Notes <span className="text-red-500">*</span></Label>
                      <Textarea
                        id="reschedule-notes"
                        value={rescheduleNewNotes}
                        onChange={(e) => setRescheduleNewNotes(e.target.value)}
                        placeholder="e.g. Please reschedule to 7/15/2026. Inspector was unavailable on original date."
                        rows={4}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setRescheduleDialogOpen(false); setRescheduleInspType(''); setRescheduleNewNotes(''); }}
                        disabled={rescheduleMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleRescheduleSubmit}
                        disabled={!rescheduleInspType.trim() || !rescheduleNewNotes.trim() || rescheduleMutation.isPending || rescheduleCooldown}
                      >
                        {rescheduleMutation.isPending ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>
                        ) : rescheduleCooldown ? 'Please wait…' : 'Submit Reschedule Request'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {isProposalStage && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                  <span>Scheduling available once proposal is accepted</span>
                </div>
              )}
              {!isProposalStage && atSlotCap && (
                <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5">
                  <span>5 inspections in progress — once one completes, you can schedule more</span>
                </div>
              )}
              <Dialog open={inspectionDialogOpen} onOpenChange={(open) => { setInspectionDialogOpen(open); if (!open) { setInspectionTypeFromRequired(false); setInspectionType(''); setInspectionTypeSearch(''); } }}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={isProposalStage || atSlotCap} title={isProposalStage ? 'Scheduling will become available when the proposal is accepted' : atSlotCap ? '5 inspections in progress — once one completes, you can schedule more' : undefined}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Inspection
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Schedule Inspection</DialogTitle>
                  <DialogDescription>
                    Book a new inspection for {project.opportunityName}
                  </DialogDescription>
                </DialogHeader>
                {(() => {
                  // Check 5-slot cap first (highest priority)
                  if (atSlotCap) {
                    return (
                      <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-2">
                        <p className="text-sm text-red-800 font-medium">
                          🚫 5 inspections in progress ({scheduledTypes.length} scheduled + {pendingDbInspections.length} requested). Once one completes, you can schedule more.
                        </p>
                      </div>
                    );
                  }
                  // Then check permit number warning
                  const pNum = (project.permitNumber || '').trim();
                  const missingPermit = !pNum || pNum.toUpperCase() === 'N/A' || pNum === '-';
                  if (!missingPermit) return null;
                  const scheduledCount = inspections?.length ?? 0;
                  const remaining = Math.max(0, 3 - scheduledCount);
                  if (scheduledCount >= 3) {
                    return (
                      <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-2">
                        <p className="text-sm text-red-800 font-medium">
                          🚫 No permit number on file. You have used all 3 inspection slots available without a permit. Please contact BCCS to get your permit number added before scheduling more inspections.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-2">
                      <p className="text-sm text-yellow-800 font-medium">
                        ⚠️ No permit number on file yet. You can schedule up to 3 inspections before a permit number is required — you have <strong>{remaining} slot{remaining !== 1 ? 's' : ''}</strong> remaining. Please contact BCCS to get your permit number added.
                      </p>
                    </div>
                  );
                })()}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-blue-900">
                    <strong>Note:</strong> Up to 5 inspections can be in progress at a time. Once one is completed, a new slot opens.
                  </p>
                </div>
                <form onSubmit={handleScheduleInspection} className="space-y-4">
                  <div>
                    <Label htmlFor="projectName">Project Name</Label>
                    <Input
                      id="projectName"
                      value={project.opportunityName || ""}
                      disabled
                      className="bg-slate-50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="projectAddress">Project Address</Label>
                    <Input
                      id="projectAddress"
                      value={project.address || "No address provided"}
                      disabled
                      className="bg-slate-50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="inspectionType">Inspection Type</Label>
                    {inspectionTypeFromRequired ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={inspectionType}
                          disabled
                          className="bg-blue-50 border-blue-200 text-blue-900 font-medium"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-xs text-slate-500 hover:text-slate-700"
                          onClick={() => { setInspectionTypeFromRequired(false); setInspectionType(''); }}
                        >
                          Change
                        </Button>
                      </div>
                    ) : (
                      <Select value={inspectionType} onValueChange={setInspectionType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select inspection type" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          <div className="px-2 pt-2 pb-3 sticky top-0 bg-background border-b z-10">
                            <input
                              type="text"
                              placeholder="Search inspection types..."
                              className="w-full px-2 py-1 text-sm border rounded"
                              value={inspectionTypeSearch}
                              onChange={(e) => setInspectionTypeSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="pt-2">
                            {inspectionTypes
                              .filter((type) =>
                                type.toLowerCase().includes(inspectionTypeSearch.toLowerCase())
                              )
                              .map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </div>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="notes">
                      Specific Date Request &amp; Notes{" "}
                      {inspectionType && inspectionType.toUpperCase().includes('OTHER') ? (
                        <span className="text-red-500">* Required for "Other" types</span>
                      ) : (
                        <span className="text-slate-400 font-normal">(Optional)</span>
                      )}
                    </Label>
                    <Textarea
                      id="notes"
                      value={inspectionNotes}
                      onChange={(e) => setInspectionNotes(e.target.value)}
                      placeholder={inspectionType && inspectionType.toUpperCase().includes('OTHER')
                        ? "Required: Please describe the inspection you need (e.g. 'Rough plumbing inspection for kitchen remodel')..."
                        : "e.g. Please schedule for 4/18/2026 if possible. Any additional notes for the inspector..."
                      }
                      className={inspectionType && inspectionType.toUpperCase().includes('OTHER') && !inspectionNotes.trim() ? "border-red-400 focus:ring-red-400" : ""}
                    />
                    {inspectionType && inspectionType.toUpperCase().includes('OTHER') && !inspectionNotes.trim() && (
                      <p className="text-xs text-red-500 mt-1">Please describe what inspection you need before submitting.</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!inspectionType || createInspectionMutation.isPending || inspectionCooldown || (inspectionType.toUpperCase().includes('OTHER') && !inspectionNotes.trim())}
                  >
                    {createInspectionMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Scheduling...
                      </>
                    ) : inspectionCooldown ? (
                      "Please wait..."
                    ) : (
                      "Schedule Inspection"
                    )}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {!hasScheduledInspections ? (
              <p className="text-slate-500 text-center py-8">No scheduled inspections</p>
            ) : (
              <div className="space-y-3">
                {/* Show inspection types from Google Sheets (filtered: no blank, no "_") */}
                {scheduledTypes.map((item, index) => (
                  <div key={`sheet-${index}`} className="flex items-center justify-between p-4 border rounded-lg bg-white">
                    <div>
                      <p className="font-medium">{item.type}</p>
                      {(() => {
                        const normType = normalizeInspectionType(item.type);
                        const dbMatch = (inspections || []).find((i: any) =>
                          normalizeInspectionType(i.inspectionType) === normType
                        );
                        if (dbMatch?.createdAt) {
                          return <p className="text-xs text-slate-500 mt-0.5">Requested {new Date(dbMatch.createdAt).toLocaleDateString()}</p>;
                        }
                        return null;
                      })()}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      item.result === 'Approved' ? 'bg-green-100 text-green-800' :
                      item.result === 'Denied' ? 'bg-red-100 text-red-800' :
                      item.result === 'Partial' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {item.result || 'Scheduled'}
                    </span>
                  </div>
                ))}
                {/* Show DB inspections that haven't been picked up by the sheet yet ("Requested") */}
                {pendingDbInspections.map((inspection: any) => (
                  <div key={inspection.id} className="flex items-start justify-between p-4 border border-yellow-200 rounded-lg bg-yellow-50 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800">{inspection.inspectionType}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Submitted {new Date(inspection.createdAt).toLocaleDateString()} · Pending confirmation
                      </p>
                      {inspection.notes && (
                        <p className="text-xs text-slate-600 mt-1 italic">📅 {inspection.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-2 border-yellow-400 text-yellow-800 hover:bg-yellow-100"
                        onClick={() => {
                          setEditingInspection({ id: inspection.id, type: inspection.inspectionType, notes: inspection.notes || '' });
                          setEditNotesValue(inspection.notes || '');
                          setUpdateNotesDialogOpen(true);
                        }}
                      >
                        Update Date
                      </Button>
                      <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
                        Requested
                      </span>
                      {user?.role === 'admin' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs font-bold border-orange-400 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                            title="Re-send to Google Sheets / GHL"
                            disabled={resendInspectionMutation.isPending}
                            onClick={() => resendInspectionMutation.mutate({ id: inspection.id })}
                          >
                            RS
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-700"
                            title="Delete inspection"
                            onClick={() => {
                              setDeletingInspection({ id: inspection.id, type: inspection.inspectionType });
                              setDeleteConfirmOpen(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {/* Delete Confirmation Dialog */}
                <Dialog open={deleteConfirmOpen} onOpenChange={(open) => { setDeleteConfirmOpen(open); if (!open) setDeletingInspection(null); }}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Inspection</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete <strong>{deletingInspection?.type}</strong>? This cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setDeleteConfirmOpen(false); setDeletingInspection(null); }}
                        disabled={deleteInspectionMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => { if (deletingInspection) deleteInspectionMutation.mutate({ id: deletingInspection.id }); }}
                        disabled={deleteInspectionMutation.isPending}
                      >
                        {deleteInspectionMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</> : 'Delete'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Update Date Dialog */}
                <Dialog open={updateNotesDialogOpen} onOpenChange={(open) => { setUpdateNotesDialogOpen(open); if (!open) setEditingInspection(null); }}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Update Date Request</DialogTitle>
                      <DialogDescription>
                        {editingInspection ? `Update the requested date for: ${editingInspection.type}` : 'Update inspection date request'}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="update-notes">Requested Date &amp; Notes</Label>
                        <Textarea
                          id="update-notes"
                          value={editNotesValue}
                          onChange={(e) => setEditNotesValue(e.target.value)}
                          placeholder="e.g. Please schedule for 5/28/2026 if possible..."
                          rows={3}
                          className="mt-1"
                        />
                        <p className="text-xs text-slate-500 mt-1">This will update the date/notes on your inspection request.</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => { setUpdateNotesDialogOpen(false); setEditingInspection(null); }}
                          disabled={updateNotesMutation.isPending}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="flex-1"
                          onClick={() => {
                            if (!editingInspection) return;
                            updateNotesMutation.mutate({ id: editingInspection.id, notes: editNotesValue });
                          }}
                          disabled={updateNotesMutation.isPending}
                        >
                          {updateNotesMutation.isPending ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                          ) : 'Save Update'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Inspections - from Past Inspections Google Sheet */}
        <Card>
          <CardHeader>
            <CardTitle>Completed Inspections</CardTitle>
            <CardDescription>Inspections that have been completed for this project</CardDescription>
          </CardHeader>
          <CardContent>
            {!completedInspectionsFromSheet || completedInspectionsFromSheet.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No completed inspections</p>
            ) : (
              <div className="divide-y">
                {completedInspectionsFromSheet.map((insp: any, idx: number) => {
                  const result = (insp.result || '').toLowerCase();
                  const isApproved = result.includes('approv') || result.includes('pass');
                  const isFailed = result.includes('fail') || result.includes('den');
                  return (
                    <div key={idx} className="flex items-center justify-between py-3 gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-900">{insp.inspectionType}</p>
                        {insp.dateApproved && (
                          <p className="text-xs text-slate-500 mt-0.5">{insp.dateApproved}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {insp.result && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                            isApproved
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : isFailed
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}>
                            {insp.result}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Additional Contact Emails */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Additional Contact Emails</CardTitle>
              <CardDescription>Manage email addresses for this project</CardDescription>
            </div>
            <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Email
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Contact Email</DialogTitle>
                  <DialogDescription>
                    Add an additional email address for {project.opportunityName}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddContact} className="space-y-4">
                  <div>
                    <Label htmlFor="contactName">Name (optional)</Label>
                    <Input
                      id="contactName"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Contact name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactEmail">Email</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="email@example.com"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!contactEmail || createContactMutation.isPending}
                  >
                    {createContactMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      "Add Contact"
                    )}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {!contacts || contacts.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No additional contacts</p>
            ) : (
              <div className="space-y-3">
                {contacts.map((contact: any) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{contact.name || "Unnamed Contact"}</p>
                      <p className="text-sm text-slate-600">{contact.email}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteContact(contact.id)}
                      className="p-2 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
                      disabled={deleteContactMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project Files */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Project Files</CardTitle>
              <CardDescription>Uploaded documents and photos</CardDescription>
            </div>
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload File</DialogTitle>
                  <DialogDescription>
                    Upload a document or photo for {project.opportunityName}
                  </DialogDescription>
                </DialogHeader>

                {/* Success state */}
                {uploadSuccess ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center gap-4">
                    <div className="p-3 bg-green-100 rounded-full">
                      <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">
                        {uploadSuccess.count === 1 ? '1 file uploaded successfully!' : `${uploadSuccess.count} files uploaded successfully!`}
                      </p>
                      <p className="text-sm text-slate-500 mt-1">Your files are now saved to this project.</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setUploadSuccess(null); }}>
                        Upload More
                      </Button>
                      <Button size="sm" onClick={() => { setUploadSuccess(null); setUploadDialogOpen(false); }}>
                        Done
                      </Button>
                    </div>
                  </div>
                ) : uploading ? (
                  /* Loading state */
                  <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
                    <div className="relative">
                      <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">
                        {uploadProgress
                          ? uploadProgress.total > 1
                            ? `Uploading file ${uploadProgress.current} of ${uploadProgress.total}…`
                            : 'Uploading your file…'
                          : 'Uploading…'}
                      </p>
                      {uploadProgress && uploadProgress.total > 1 && (
                        <div className="mt-3 w-48 mx-auto">
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full transition-all duration-300"
                              style={{ width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                          </p>
                        </div>
                      )}
                      <p className="text-xs text-slate-500 mt-2">Please don't close this window</p>
                    </div>
                  </div>
                ) : (
                  /* Default file picker state */
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="file">Select File</Label>
                      <Input
                        id="file"
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                        className="cursor-pointer"
                        multiple
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Max file size: 25MB. Supported: Images, PDF, Word, Excel
                      </p>
                    </div>
                    {selectedFiles.length > 0 && (
                      <div className="space-y-2">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="p-3 bg-slate-50 rounded-lg">
                            <p className="text-sm font-medium">{file.name}</p>
                            <p className="text-xs text-slate-500">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        ))}
                        <p className="text-xs text-slate-600 font-medium">
                          {selectedFiles.length} file(s) selected
                        </p>
                      </div>
                    )}
                    <Button
                      onClick={handleFileUpload}
                      className="w-full"
                      disabled={selectedFiles.length === 0}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload {selectedFiles.length > 0 ? `${selectedFiles.length} File(s)` : 'File'}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {!files || files.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No files uploaded</p>
            ) : (
              <div className="space-y-3">
                {files.map((file: any) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText className="h-8 w-8 text-blue-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{file.fileName}</p>
                        <p className="text-xs text-slate-500">
                          {file.fileSize ? `${(file.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown size'} • 
                          Uploaded {new Date(file.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a
                        href={file.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
                        disabled={deleteFileMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>


      {/* Submit Plans Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-blue-600" />
              Submit Plans
            </CardTitle>
            <CardDescription>Submit a Dropbox or Google Drive link with your architectural plans for this project</CardDescription>
          </CardHeader>
          <CardContent>
            {plansSubmitSuccess ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="font-semibold text-green-700">Plans submitted successfully!</p>
                <p className="text-sm text-slate-500">The BCCS team has been notified.</p>
                <Button variant="outline" onClick={() => setPlansSubmitSuccess(false)}>Submit Another</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Project Address</Label>
                  <Input value={project?.address || ''} disabled className="bg-slate-50" />
                </div>
                <div>
                  <Label>Dropbox / Google Drive Link <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="https://www.dropbox.com/sh/... or https://drive.google.com/..."
                    value={plansDropboxLink}
                    onChange={(e) => setPlansDropboxLink(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea
                    placeholder="Any notes for the team..."
                    value={plansNotes}
                    onChange={(e) => setPlansNotes(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button
                  onClick={handlePlansSubmit}
                  disabled={plansSubmitting || plansCooldown || !plansDropboxLink.trim()}
                  className="w-full"
                >
                  {plansSubmitting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
                  ) : (
                    'Submit Plans Link'
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
