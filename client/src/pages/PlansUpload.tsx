import { useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, FolderOpen, X, FileText, CheckCircle2, Loader2, Mail } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const MAX_FILE_SIZE_MB = 15;
const MAX_FILES = 20;
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
];

interface SelectedFile {
  file: File;
  id: string;
  error?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:application/pdf;base64,")
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PlansUpload() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [address, setAddress] = useState("");
  const [projectName, setProjectName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<{ folderUrl?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.plansUpload.upload.useMutation({
    onSuccess: (data) => {
      setUploadSuccess({ folderUrl: data.folderUrl });
      toast.success("Plans uploaded successfully! A notification email has been sent.");
    },
    onError: (err) => {
      toast.error(err.message || "Upload failed. Please try again.");
    },
  });

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    const toAdd: SelectedFile[] = [];

    for (const file of arr) {
      if (selectedFiles.length + toAdd.length >= MAX_FILES) {
        toast.error(`Maximum ${MAX_FILES} files allowed.`);
        break;
      }
      const sizeMB = file.size / (1024 * 1024);
      let error: string | undefined;
      if (sizeMB > MAX_FILE_SIZE_MB) {
        error = `File too large (${sizeMB.toFixed(1)} MB, max ${MAX_FILE_SIZE_MB} MB)`;
      }
      toAdd.push({ file, id: `${file.name}-${Date.now()}-${Math.random()}`, error });
    }

    setSelectedFiles(prev => [...prev, ...toAdd]);
  }, [selectedFiles]);

  const removeFile = (id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!address.trim()) {
      toast.error("Please enter a project address.");
      return;
    }
    const validFiles = selectedFiles.filter(f => !f.error);
    if (validFiles.length === 0) {
      toast.error("Please add at least one valid file.");
      return;
    }

    // Convert files to base64
    const filesPayload: { fileName: string; fileData: string; mimeType: string }[] = [];
    for (const sf of validFiles) {
      try {
        const b64 = await fileToBase64(sf.file);
        filesPayload.push({
          fileName: sf.file.name,
          fileData: b64,
          mimeType: sf.file.type || "application/octet-stream",
        });
      } catch {
        toast.error(`Failed to read file: ${sf.file.name}`);
        return;
      }
    }

    uploadMutation.mutate({
      address: address.trim(),
      projectName: projectName.trim() || undefined,
      files: filesPayload,
    });
  };

  const handleReset = () => {
    setAddress("");
    setProjectName("");
    setSelectedFiles([]);
    setUploadSuccess(null);
  };

  const validFiles = selectedFiles.filter(f => !f.error);
  const invalidFiles = selectedFiles.filter(f => f.error);

  if (uploadSuccess) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center gap-3">
              <img src="/bccs-logo.png" alt="BCCS" className="h-10 w-10" />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">BCCS Client Portal</h1>
                <p className="text-sm text-slate-600">Plans Upload</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-green-100 rounded-full">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Plans Uploaded Successfully!</h2>
          <p className="text-slate-600 mb-2">
            Your plans have been uploaded to Google Drive and the BCCS team has been notified.
          </p>
          <p className="text-sm text-slate-500 mb-8 flex items-center justify-center gap-1">
            <Mail className="h-4 w-4" />
            Notification sent to bccsfla@gmail.com
          </p>

          {uploadSuccess.folderUrl && (
            <a
              href={uploadSuccess.folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline mb-8 font-medium"
            >
              <FolderOpen className="h-4 w-4" />
              View uploaded files in Google Drive
            </a>
          )}

          <div className="flex gap-3 justify-center">
            <Button onClick={handleReset} variant="outline">
              Upload More Plans
            </Button>
            <Link href="/dashboard">
              <Button>Back to Dashboard</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/bccs-logo.png" alt="BCCS" className="h-10 w-10" />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">BCCS Client Portal</h1>
                <p className="text-sm text-slate-600">Plans Upload</p>
              </div>
            </div>
            <Link href="/dashboard">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
        <div className="bg-slate-50 border-t py-2">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-sm text-slate-600">
              Issues with the app or need support?{" "}
              <a href="mailto:info@bccsfl.com" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                <Mail className="h-3 w-3" />
                Please reach out here
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-blue-600" />
              Upload Plans to Google Drive
            </CardTitle>
            <CardDescription>
              Files will be saved in a new folder on Google Drive and the BCCS team will be notified by email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="address">
                Project Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="address"
                placeholder="e.g. 7114 Orchid Island Pl, Vero Beach, FL"
                value={address}
                onChange={e => setAddress(e.target.value)}
                disabled={uploadMutation.isPending}
              />
            </div>

            {/* Optional project name */}
            <div className="space-y-2">
              <Label htmlFor="projectName">
                Project / Opportunity Name <span className="text-slate-400 text-xs">(optional)</span>
              </Label>
              <Input
                id="projectName"
                placeholder="e.g. Smith Residence"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                disabled={uploadMutation.isPending}
              />
              <p className="text-xs text-slate-500">
                The Drive folder will be named: <em>{address || "Address"}{projectName ? ` - ${projectName}` : ""}</em>
              </p>
            </div>

            {/* Drop zone */}
            <div className="space-y-2">
              <Label>Files <span className="text-red-500">*</span></Label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !uploadMutation.isPending && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
                } ${uploadMutation.isPending ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Upload className="h-8 w-8 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700">
                  Drag & drop files here, or click to browse
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  PDF, images, Word, Excel, ZIP — up to {MAX_FILE_SIZE_MB} MB each, max {MAX_FILES} files
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                  disabled={uploadMutation.isPending}
                />
              </div>
            </div>

            {/* File list */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Selected Files</Label>
                  <Badge variant="secondary">{validFiles.length} valid{invalidFiles.length > 0 ? `, ${invalidFiles.length} invalid` : ""}</Badge>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedFiles.map(sf => (
                    <div
                      key={sf.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        sf.error ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
                      }`}
                    >
                      <FileText className={`h-4 w-4 flex-shrink-0 ${sf.error ? "text-red-400" : "text-slate-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{sf.file.name}</p>
                        {sf.error ? (
                          <p className="text-xs text-red-600">{sf.error}</p>
                        ) : (
                          <p className="text-xs text-slate-500">{(sf.file.size / 1024 / 1024).toFixed(2)} MB</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                        onClick={() => removeFile(sf.id)}
                        disabled={uploadMutation.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submit */}
            <Button
              className="w-full gap-2"
              onClick={handleSubmit}
              disabled={uploadMutation.isPending || validFiles.length === 0 || !address.trim()}
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading to Google Drive…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload {validFiles.length > 0 ? `${validFiles.length} File${validFiles.length !== 1 ? "s" : ""}` : "Plans"}
                </>
              )}
            </Button>
            {uploadMutation.isPending && (
              <p className="text-xs text-center text-slate-500">
                This may take up to 60 seconds while files are saved to Google Drive…
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
