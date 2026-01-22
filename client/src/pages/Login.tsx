import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      try {
        await utils.auth.me.invalidate();
        toast.success("Login successful!");
        // Use a longer delay and ensure redirect happens even if other scripts error
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Force redirect by directly manipulating window.location as fallback
        setTimeout(() => {
          setLocation("/projects");
          // Fallback: if wouter doesn't work, use window.location
          setTimeout(() => {
            if (window.location.pathname === '/login') {
              window.location.href = '/projects';
            }
          }, 500);
        }, 0);
      } catch (error) {
        console.error('Login redirect error:', error);
        // Still try to redirect even if there's an error
        window.location.href = '/projects';
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
        </CardContent>
      </Card>
    </div>
  );
}
