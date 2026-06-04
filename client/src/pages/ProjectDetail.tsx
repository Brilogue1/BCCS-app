import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, Calendar, CheckCircle2, Download, FileText, Link2, Loader2, Mail, Phone, Plus, Trash2, Upload, User, X } from "lucide-react";
import { useState, useRef } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import inspectionTypes from "../../../shared/inspectionTypes.json";
import { normalizeInspectionType } from "../../../shared/utils";

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

  // Inspection form state
  const [inspectionType, setInspectionType] = useState('');
  const [inspectionTypeSearch, setInspectionTypeSearch] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState("");

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
  ].filter(i => isValidInspection(i.type) && !sheetCompletedTypeSet.has((i.type || '').trim().toUpperCase()));

  // Build a set of inspection types already confirmed in the Google Sheets (U-AA columns)
  // so we can hide DB "Requested" entries that have already been picked up by the sheet.
  const sheetScheduledTypeSet = new Set(
    scheduledTypes.map(i => (i.type || '').trim().toUpperCase())
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

  // Only show DB inspections whose type is NOT already in the sheet (scheduled or completed)
  // Hide a Requested badge if the type is:
  //   1. Already in the sheet's scheduled columns (U-AA)
  //   2. Already in the column H completed text (legacy fallback)
  //   3. Already in the Past Inspections sheet tab (authoritative source, polled every 30 min)
  const pendingDbInspections = (inspections || []).filter(
    (insp: any) => {
      const tRaw = (insp.inspectionType || '').trim().toUpperCase();
      const tNorm = normalizeInspectionType(insp.inspectionType);
      // Check raw against scheduled set (sheet U-AA) and legacy column H set
      // Check normalized against the Past Inspections sheet completed set
      return !sheetScheduledTypeSet.has(tRaw) && !completedTypeSet.has(tRaw) && !sheetCompletedTypeSet.has(tNorm);
    }
  );

  const hasScheduledInspections = scheduledTypes.length > 0 || pendingDbInspections.length > 0;

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

          </div>
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
              <p className="text-sm font-medium text-slate-500">Last Updated</p>
              <p className="text-lg">
                {project.lastUpdated
                  ? new Date(project.lastUpdated).toLocaleDateString()
                  : "N/A"}
              </p>
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

        {/* Scheduled Inspections - Combined section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Scheduled Inspections</CardTitle>
              <CardDescription>Inspections scheduled for this project</CardDescription>
            </div>
            <Dialog open={inspectionDialogOpen} onOpenChange={setInspectionDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
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
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-blue-900">
                    <strong>Note:</strong> Only 5 inspections can be scheduled per 24-hour period for this project.
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
                  </div>
                  <div>
                    <Label htmlFor="notes">Specific Date Request &amp; Notes <span className="text-slate-400 font-normal">(Optional)</span></Label>
                    <Textarea
                      id="notes"
                      value={inspectionNotes}
                      onChange={(e) => setInspectionNotes(e.target.value)}
                      placeholder="e.g. Please schedule for 4/18/2026 if possible. Any additional notes for the inspector..."
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!inspectionType || createInspectionMutation.isPending || inspectionCooldown}
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
                    </div>
                  </div>
                ))}

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
