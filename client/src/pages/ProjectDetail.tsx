import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, Calendar, Download, Loader2, Mail, Phone, Plus, Trash2, Upload, User, X } from "lucide-react";
import { useState, useRef } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import inspectionTypes from "../../../shared/inspectionTypes.json";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const { user } = useAuth();

  const { data: project, isLoading } = trpc.projects.getById.useQuery({ id: projectId });
  const { data: inspections } = trpc.inspections.list.useQuery({ projectId });
  const { data: contacts } = trpc.contacts.list.useQuery({ projectId });
  const { data: pastInspections } = trpc.pastInspections.list.useQuery();

  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);

  // Inspection form state
  const [inspectionType, setInspectionType] = useState("");
  const [inspectionNotes, setInspectionNotes] = useState("");

  // Contact form state
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");

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

  return (
    <div className="min-h-screen bg-slate-50">
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

        {/* In Progress Inspections */}
        {(project.inspection1Type || project.inspection2Type || project.inspection3Type || project.inspection4Type || project.inspection5Type) && (
          <Card>
            <CardHeader>
              <CardTitle>In Progress Inspections</CardTitle>
              <CardDescription>Planned inspections for this project</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {project.inspection1Type && (
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50">
                    <div>
                      <p className="font-medium text-slate-900">{project.inspection1Type}</p>
                      <p className="text-sm text-slate-500">Inspection 1</p>
                    </div>
                    <span className="px-3 py-1 bg-blue-200 text-blue-800 rounded-full text-sm font-medium">In Progress</span>
                  </div>
                )}
                {project.inspection2Type && (
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50">
                    <div>
                      <p className="font-medium text-slate-900">{project.inspection2Type}</p>
                      <p className="text-sm text-slate-500">Inspection 2</p>
                    </div>
                    <span className="px-3 py-1 bg-blue-200 text-blue-800 rounded-full text-sm font-medium">In Progress</span>
                  </div>
                )}
                {project.inspection3Type && (
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50">
                    <div>
                      <p className="font-medium text-slate-900">{project.inspection3Type}</p>
                      <p className="text-sm text-slate-500">Inspection 3</p>
                    </div>
                    <span className="px-3 py-1 bg-blue-200 text-blue-800 rounded-full text-sm font-medium">In Progress</span>
                  </div>
                )}
                {project.inspection4Type && (
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50">
                    <div>
                      <p className="font-medium text-slate-900">{project.inspection4Type}</p>
                      <p className="text-sm text-slate-500">Inspection 4</p>
                    </div>
                    <span className="px-3 py-1 bg-blue-200 text-blue-800 rounded-full text-sm font-medium">In Progress</span>
                  </div>
                )}
                {project.inspection5Type && (
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50">
                    <div>
                      <p className="font-medium text-slate-900">{project.inspection5Type}</p>
                      <p className="text-sm text-slate-500">Inspection 5</p>
                    </div>
                    <span className="px-3 py-1 bg-blue-200 text-blue-800 rounded-full text-sm font-medium">In Progress</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Completed Inspections */}
        {pastInspections && pastInspections.filter((i: any) => i.projectName === project.opportunityName).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Completed Inspections</CardTitle>
              <CardDescription>Inspections that have been completed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pastInspections?.filter((i: any) => i.projectName === project.opportunityName).map((inspection: any) => (
                  <div key={`${inspection.projectName}-${inspection.inspectionType}`} className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                    <div>
                      <p className="font-medium text-slate-900">{inspection.inspectionType}</p>
                      <p className="text-sm text-slate-500">
                        {inspection.dateApproved ? new Date(inspection.dateApproved).toLocaleDateString() : "No date"}
                      </p>
                    </div>
                    <span className="px-3 py-1 bg-green-200 text-green-800 rounded-full text-sm font-medium">{inspection.approvedStatus || "Completed"}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Inspections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Inspections</CardTitle>
              <CardDescription>Scheduled inspections for this project</CardDescription>
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
                    <Label htmlFor="inspectionType">Inspection Type *</Label>
                    <Select value={inspectionType} onValueChange={setInspectionType} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select inspection type" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {inspectionTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="inspectionNotes">Notes (Optional)</Label>
                    <Textarea
                      id="inspectionNotes"
                      value={inspectionNotes}
                      onChange={(e) => setInspectionNotes(e.target.value)}
                      placeholder="Any additional notes..."
                      rows={4}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={createInspectionMutation.isPending || !inspectionType}
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
            {!inspections || inspections.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No inspections scheduled</p>
            ) : (
              <div className="space-y-3">
                {inspections?.map((inspection: any) => (
                  <div
                    key={inspection.id}
                    className="flex items-start justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{inspection.inspectionType}</p>
                      {inspection.notes && (
                        <p className="text-sm text-slate-600 mt-1">{inspection.notes}</p>
                      )}
                      <p className="text-xs text-slate-500 mt-2">
                        Created: {new Date(inspection.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ml-4 ${
                      inspection.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : inspection.status === "scheduled"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {inspection.status.charAt(0).toUpperCase() + inspection.status.slice(1)}
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
                    Add an additional email contact for {project.opportunityName}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddContact} className="space-y-4">
                  <div>
                    <Label htmlFor="contactName">Name (Optional)</Label>
                    <Input
                      id="contactName"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Contact name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactEmail">Email *</Label>
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
                    disabled={createContactMutation.isPending || !contactEmail}
                  >
                    {createContactMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      "Add Email"
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
                {contacts.map((contact) => (
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
            <Dialog>
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
                <p className="text-sm text-slate-600">File upload functionality coming soon</p>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500 text-center py-8">No files uploaded</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
