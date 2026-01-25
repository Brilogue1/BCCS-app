import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      try {
        toast.success("Login successful!");
        
        // Immediately redirect using window.location as the primary method
        // This bypasses any issues with wouter or other scripts
        window.location.href = "/projects";
        
        // Also try wouter as a fallback in case window.location doesn't work
        setTimeout(() => {
          try {
            setLocation("/projects");
          } catch (e) {
            console.error('Wouter redirect failed:', e);
          }
        }, 100);
        
        // Invalidate cache after redirect is initiated
        try {
          await utils.auth.me.invalidate();
        } catch (e) {
          console.error('Cache invalidation failed:', e);
        }
      } catch (error) {
        console.error('Login redirect error:', error);
        // Still try to redirect even if there's an error
        window.location.href = "/projects";
      }
    },
    onError: (error) => {
      console.error('Login error:', error);
      toast.error(error.message || "Login failed");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      loginMutation.mutate({ email, password });
    } catch (error) {
      console.error('Submit error:', error);
      toast.error("An error occurred. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img src="/bccs-logo.png" alt="BCCS Logo" className="h-24 w-24" />
          </div>
          <CardTitle className="text-2xl font-bold text-center">BCCS Client Portal</CardTitle>
          <CardDescription className="text-center">
            Enter your credentials to access your projects
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loginMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loginMutation.isPending}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
          
          {/* Support link for login issues */}
          <div className="mt-6 pt-4 border-t border-slate-200 text-center">
            <p className="text-sm text-slate-600">
              Issues logging in or need to update your password?{" "}
              <a 
                href="mailto:info@bccsfl.com" 
                className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
              >
                <Mail className="h-3 w-3" />
                Reach out here
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
