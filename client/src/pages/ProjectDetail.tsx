import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, Calendar, Download, FileText, Loader2, Mail, Phone, Plus, Trash2, Upload, User, X } from "lucide-react";
import { useState, useRef } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import inspectionTypes from "../../../shared/inspectionTypes.json";

// Frontend API URL for file uploads - ensure trailing slash for URL construction
const FORGE_BASE = import.meta.env.VITE_FRONTEND_FORGE_API_URL || 'https://forge.butterfly-effect.dev';
const FORGE_API_URL = FORGE_BASE.endsWith('/') ? FORGE_BASE : `${FORGE_BASE}/`;
const FORGE_API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const { user } = useAuth();

  const { data: project, isLoading } = trpc.projects.getById.useQuery({ id: projectId });
  const { data: inspections } = trpc.inspections.list.useQuery({ projectId });
  const { data: contacts } = trpc.contacts.list.useQuery({ projectId });
  const { data: pastInspections } = trpc.pastInspections.list.useQuery();
  const { data: files, refetch: refetchFiles } = trpc.files.list.useQuery({ projectId });

  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // Inspection form state
  const [inspectionType, setInspectionType] = useState("");
  const [inspectionNotes, setInspectionNotes] = useState("");

  // Contact form state
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const createInspectionMutation = trpc.inspections.create.useMutation({
    onSuccess: () => {
      toast.success("Inspection scheduled successfully");
      setInspectionDialogOpen(false);
      setInspectionType("");
      setInspectionNotes("");
      utils.inspections.list.invalidate({ projectId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to schedule inspection");
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
      setSelectedFile(null);
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
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !project) return;

    setUploading(true);
    try {
      // Generate unique file key
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const sanitizedFileName = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileKey = `bccs-uploads/${projectId}/${timestamp}-${randomSuffix}-${sanitizedFileName}`;

      // Upload to S3 via server-side endpoint (avoids CORS issues)
      const formData = new FormData();
      formData.append('file', selectedFile);

      const uploadUrl = `/api/upload?path=${encodeURIComponent(fileKey)}`;

      console.log('Uploading to server:', uploadUrl);
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        console.error('Upload failed:', response.status, errorData);
        throw new Error(errorData.error || `Upload failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('Upload result:', result);
      const fileUrl = result.url;

      // Save file record to database (which also logs to Google Sheets)
      uploadFileMutation.mutate({
        projectId,
        fileName: selectedFile.name,
        fileUrl,
        fileKey,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type,
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast.error("Failed to upload file. Please try again.");
    } finally {
      setUploading(false);
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

  // Get completed inspections for this project
  const projectCompletedInspections = pastInspections?.filter((i: any) => i.projectName === project.opportunityName) || [];

  // Check if there are any scheduled inspections (from inspection types 1-5 or from inspections table)
  const hasScheduledInspections = project.inspection1Type || project.inspection2Type || project.inspection3Type || project.inspection4Type || project.inspection5Type || (inspections && inspections.length > 0);

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
          <h1 className="text-3xl font-bold text-slate-900">{project.opportunityName}</h1>
          {project.address && (
            <p className="text-slate-600 mt-2">{project.address}</p>
          )}
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
                        {inspectionTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="notes">Notes (optional)</Label>
                    <Textarea
                      id="notes"
                      value={inspectionNotes}
                      onChange={(e) => setInspectionNotes(e.target.value)}
                      placeholder="Any additional notes for the inspector..."
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!inspectionType || createInspectionMutation.isPending}
                  >
                    {createInspectionMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Scheduling...
                      </>
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
                {/* Show inspection types from Google Sheets */}
                {project.inspection1Type && (
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-white">
                    <div>
                      <p className="font-medium">{project.inspection1Type}</p>
                      <p className="text-sm text-slate-500">Inspection 1</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      project.inspection1Result === 'Approved' ? 'bg-green-100 text-green-800' :
                      project.inspection1Result === 'Denied' ? 'bg-red-100 text-red-800' :
                      project.inspection1Result === 'Partial' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {project.inspection1Result || 'Scheduled'}
                    </span>
                  </div>
                )}
                {project.inspection2Type && (
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-white">
                    <div>
                      <p className="font-medium">{project.inspection2Type}</p>
                      <p className="text-sm text-slate-500">Inspection 2</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      project.inspection2Result === 'Approved' ? 'bg-green-100 text-green-800' :
                      project.inspection2Result === 'Denied' ? 'bg-red-100 text-red-800' :
                      project.inspection2Result === 'Partial' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {project.inspection2Result || 'Scheduled'}
                    </span>
                  </div>
                )}
                {project.inspection3Type && (
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-white">
                    <div>
                      <p className="font-medium">{project.inspection3Type}</p>
                      <p className="text-sm text-slate-500">Inspection 3</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      project.inspection3Result === 'Approved' ? 'bg-green-100 text-green-800' :
                      project.inspection3Result === 'Denied' ? 'bg-red-100 text-red-800' :
                      project.inspection3Result === 'Partial' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {project.inspection3Result || 'Scheduled'}
                    </span>
                  </div>
                )}
                {project.inspection4Type && (
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-white">
                    <div>
                      <p className="font-medium">{project.inspection4Type}</p>
                      <p className="text-sm text-slate-500">Inspection 4</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      Scheduled
                    </span>
                  </div>
                )}
                {project.inspection5Type && (
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-white">
                    <div>
                      <p className="font-medium">{project.inspection5Type}</p>
                      <p className="text-sm text-slate-500">Inspection 5</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      Scheduled
                    </span>
                  </div>
                )}
                {/* Show inspections from database */}
                {inspections?.map((inspection: any) => (
                  <div key={inspection.id} className="flex items-center justify-between p-4 border rounded-lg bg-white">
                    <div>
                      <p className="font-medium">{inspection.inspectionType}</p>
                      <p className="text-sm text-slate-500">
                        Requested {new Date(inspection.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      inspection.status === 'completed' ? 'bg-green-100 text-green-800' :
                      inspection.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      inspection.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {inspection.status.charAt(0).toUpperCase() + inspection.status.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Inspections */}
        <Card>
          <CardHeader>
            <CardTitle>Completed Inspections</CardTitle>
            <CardDescription>Inspections that have been completed for this project</CardDescription>
          </CardHeader>
          <CardContent>
            {projectCompletedInspections.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No completed inspections</p>
            ) : (
              <div className="space-y-3">
                {projectCompletedInspections.map((inspection: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg bg-white">
                    <div>
                      <p className="font-medium">{inspection.inspectionType || 'Inspection'}</p>
                      <p className="text-sm text-slate-500">
                        {inspection.completedDate ? new Date(inspection.completedDate).toLocaleDateString() : 'Date not available'}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      inspection.result === 'Approved' ? 'bg-green-100 text-green-800' :
                      inspection.result === 'Denied' ? 'bg-red-100 text-red-800' :
                      inspection.result === 'Partial' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {inspection.result || 'Completed'}
                    </span>
                  </div>
                ))}
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
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Max file size: 10MB. Supported: Images, PDF, Word, Excel
                    </p>
                  </div>
                  {selectedFile && (
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-slate-500">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  )}
                  <Button
                    onClick={handleFileUpload}
                    className="w-full"
                    disabled={!selectedFile || uploading || uploadFileMutation.isPending}
                  >
                    {uploading || uploadFileMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload File
                      </>
                    )}
                  </Button>
                </div>
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
      </div>
    </div>
  );
}
