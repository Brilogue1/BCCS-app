import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Calendar, Loader2, Mail, Phone, Plus, User, X } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const { user } = useAuth();

  const { data: project, isLoading } = trpc.projects.getById.useQuery({ id: projectId });
  const { data: inspections } = trpc.inspections.list.useQuery({ projectId });
  const { data: contacts } = trpc.contacts.list.useQuery({ projectId });

  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);

  // Inspection form state
  const [inspectionType, setInspectionType] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [inspectionTime, setInspectionTime] = useState("");
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
      setInspectionDate("");
      setInspectionTime("");
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
      inspectionDate: new Date(inspectionDate),
      inspectionTime,
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-600 mb-4">Project not found</p>
            <Link href="/projects">
              <Button>Back to Projects</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Link href="/projects">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{project.opportunityName}</h1>
          <p className="text-sm text-slate-600">{project.address}</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Project Information */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Project Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-600">Project Name</Label>
                    <p className="font-medium">{project.opportunityName}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Address</Label>
                    <p className="font-medium">{project.address || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Subdivision</Label>
                    <p className="font-medium">{project.subdivision || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Lot #</Label>
                    <p className="font-medium">{project.lotNumber || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Permit #</Label>
                    <p className="font-medium">{project.permitNumber || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Stage</Label>
                    <p className="font-medium">{project.stage || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Last Updated</Label>
                    <p className="font-medium">
                      {project.lastUpdated
                        ? new Date(project.lastUpdated).toLocaleDateString()
                        : "N/A"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assigned Staff</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-slate-600">Assigned Permit Tech</Label>
                  <p className="font-medium">{project.assignedPermitTech || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Assigned Plans Examiner</Label>
                  <p className="font-medium">{project.assignedPlansExaminer || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Assigned Inspector</Label>
                  <p className="font-medium">{project.assignedInspector || "N/A"}</p>
                </div>
              </CardContent>
            </Card>

            {/* Inspections */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Inspections</CardTitle>
                  <Dialog open={inspectionDialogOpen} onOpenChange={setInspectionDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Calendar className="h-4 w-4 mr-2" />
                        Schedule Inspection
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Schedule Inspection</DialogTitle>
                        <DialogDescription>
                          Book a new inspection for this project
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleScheduleInspection} className="space-y-4">
                        <div>
                          <Label htmlFor="inspectionType">Inspection Type</Label>
                          <Input
                            id="inspectionType"
                            value={inspectionType}
                            onChange={(e) => setInspectionType(e.target.value)}
                            placeholder="e.g., Foundation, Framing, Final"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="inspectionDate">Date</Label>
                          <Input
                            id="inspectionDate"
                            type="date"
                            value={inspectionDate}
                            onChange={(e) => setInspectionDate(e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="inspectionTime">Time (Optional)</Label>
                          <Input
                            id="inspectionTime"
                            type="time"
                            value={inspectionTime}
                            onChange={(e) => setInspectionTime(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="inspectionNotes">Notes (Optional)</Label>
                          <Textarea
                            id="inspectionNotes"
                            value={inspectionNotes}
                            onChange={(e) => setInspectionNotes(e.target.value)}
                            placeholder="Any additional notes..."
                          />
                        </div>
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={createInspectionMutation.isPending}
                        >
                          {createInspectionMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Scheduling...
                            </>
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
                {!inspections || inspections.length === 0 ? (
                  <p className="text-slate-600 text-sm text-center py-4">
                    No inspections scheduled yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {inspections.map((inspection) => (
                      <div
                        key={inspection.id}
                        className="flex items-start justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{inspection.inspectionType}</p>
                          <p className="text-sm text-slate-600">
                            {new Date(inspection.inspectionDate).toLocaleDateString()}
                            {inspection.inspectionTime && ` at ${inspection.inspectionTime}`}
                          </p>
                          {inspection.notes && (
                            <p className="text-sm text-slate-500 mt-1">{inspection.notes}</p>
                          )}
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            inspection.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : inspection.status === "cancelled"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {inspection.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <User className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <Label className="text-slate-600">Name</Label>
                    <p className="font-medium">{project.contactName || "N/A"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <Label className="text-slate-600">Phone</Label>
                    <p className="font-medium">{project.phone || "N/A"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <Label className="text-slate-600">Email</Label>
                    <p className="font-medium">{project.email || "N/A"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Additional Contact Emails */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Additional Emails</CardTitle>
                  <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Contact Email</DialogTitle>
                        <DialogDescription>
                          Add an additional email address for this project
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleAddContact} className="space-y-4">
                        <div>
                          <Label htmlFor="contactEmail">Email Address</Label>
                          <Input
                            id="contactEmail"
                            type="email"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            placeholder="email@example.com"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="contactName">Name (Optional)</Label>
                          <Input
                            id="contactName"
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            placeholder="Contact name"
                          />
                        </div>
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={createContactMutation.isPending}
                        >
                          {createContactMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            "Add Email"
                          )}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {!contacts || contacts.length === 0 ? (
                  <p className="text-slate-600 text-sm text-center py-4">
                    No additional emails added
                  </p>
                ) : (
                  <div className="space-y-2">
                    {contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center justify-between p-2 bg-slate-50 rounded"
                      >
                        <div>
                          {contact.name && (
                            <p className="text-sm font-medium">{contact.name}</p>
                          )}
                          <p className="text-sm text-slate-600">{contact.email}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteContactMutation.mutate({ id: contact.id })}
                          disabled={deleteContactMutation.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
