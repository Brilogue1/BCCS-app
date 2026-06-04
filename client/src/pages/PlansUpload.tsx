import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Link2, CheckCircle2, Loader2, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

export default function PlansUpload() {
  const { user } = useAuth();
  const [address, setAddress] = useState("");
  const [dropboxLink, setDropboxLink] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const submitMutation = trpc.plansUpload.submitLink.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setCooldown(false);
    },
    onError: (err) => {
      setCooldown(true);
      setTimeout(() => setCooldown(false), 5000);
      toast.error(err.message || "Failed to submit. Please wait a moment before trying again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) {
      toast.error("Please enter the property address.");
      return;
    }
    if (!dropboxLink.trim()) {
      toast.error("Please enter your Dropbox or Google Drive link.");
      return;
    }
    if (cooldown) return;
    submitMutation.mutate({
      address: address.trim(),
      dropboxLink: dropboxLink.trim(),
      notes: notes.trim(),
    });
  };

  const handleReset = () => {
    setAddress("");
    setDropboxLink("");
    setNotes("");
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center shadow-lg">
          <CardContent className="pt-10 pb-8 px-8">
            <div className="flex justify-center mb-4">
              <div className="bg-green-100 rounded-full p-4">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Link Submitted!</h2>
            <p className="text-slate-500 mb-6">
              Your Dropbox / Google Drive link has been sent to the BCCS team and logged for review.
            </p>
            <div className="space-y-3">
              <Button onClick={handleReset} className="w-full">
                Submit Another
              </Button>
              <Link href="/">
                <Button variant="outline" className="w-full">
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-slate-600">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Dashboard
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">Submit Plans</h1>
          <p className="text-slate-500 mt-1">Share your Dropbox or Google Drive link with the BCCS team</p>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5 text-blue-600" />
              Plans Submission
            </CardTitle>
            <CardDescription>
              Upload your plans to Dropbox or Google Drive first, then paste the shared link below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Address */}
              <div className="space-y-1.5">
                <Label htmlFor="address">
                  Property Address <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="address"
                  placeholder="e.g. 123 Main St, Miami, FL 33101"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                />
              </div>

              {/* Dropbox Link */}
              <div className="space-y-1.5">
                <Label htmlFor="dropboxLink">
                  Dropbox / Google Drive Link <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="dropboxLink"
                  type="url"
                  placeholder="https://www.dropbox.com/sh/... or https://drive.google.com/..."
                  value={dropboxLink}
                  onChange={(e) => setDropboxLink(e.target.value)}
                  required
                />
                <p className="text-xs text-slate-400">
                  Make sure the link is set to "Anyone with the link can view" in Dropbox or Google Drive.
                </p>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional information for the team..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={submitMutation.isPending || cooldown}
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Plans Link
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
