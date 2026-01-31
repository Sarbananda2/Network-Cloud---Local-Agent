import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, User, Settings, Trash2, Key, LayoutDashboard, Cloud, Activity, Power, Network, FileText } from "lucide-react";
import logoUrl from "@/assets/logo.png";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/account");
    },
    onSuccess: () => {
      toast({
        title: "Account deleted",
        description: "Your account and all data have been permanently removed.",
      });
      window.location.href = "/login";
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete account. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteAccount = () => {
    setShowDeleteDialog(false);
    deleteAccountMutation.mutate();
  };

  return (
<<<<<<< HEAD
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <img src={logoUrl} alt="NetworkCloud" className="h-8 w-8 object-contain" data-testid="img-logo-header" />
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <Link href="/devices">
                <span className={`text-sm font-medium transition-colors hover:text-primary cursor-pointer ${location.startsWith('/devices') ? 'text-primary' : 'text-muted-foreground'}`}>
                  Dashboard
                </span>
              </Link>
            </nav>
=======
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="w-64 border-r border-border/40 bg-background/80 backdrop-blur px-5 py-6 flex flex-col gap-8">
        <Link href="/" className="flex items-center gap-3">
          <img src={logoUrl} alt="NetworkCloud" className="h-10 w-10 object-contain" data-testid="img-logo-header" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">NetworkCloud</div>
            <div className="text-xs text-muted-foreground">Agent</div>
>>>>>>> c8c595d29605fe452b21ae776b9ee9482ebe92d1
          </div>
        </Link>

        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Navigation</div>
        <nav className="flex flex-col gap-2">
          <Link href="/devices">
            <span className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-2 ${location.startsWith('/devices') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </span>
          </Link>
          <span className="px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50">
            <Network className="w-4 h-4" />
            Network
          </span>
          <span className="px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50">
            <Cloud className="w-4 h-4" />
            Cloud Link
          </span>
          <span className="px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50">
            <Activity className="w-4 h-4" />
            Status
          </span>
          <span className="px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50">
            <Power className="w-4 h-4" />
            Service Control
          </span>
          <span className="px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50">
            <FileText className="w-4 h-4" />
            Logs
          </span>
          <Link href="/agent-tokens">
            <span className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-2 ${location === '/agent-tokens' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
              <Key className="w-4 h-4" />
              Agent Tokens
            </span>
          </Link>
        </nav>

        <div className="mt-auto text-xs text-muted-foreground">v1.0.0</div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-16 border-b border-border/40 bg-background/80 backdrop-blur flex items-center justify-end px-6">
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-full bg-secondary/50 border border-border">
              {user?.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="Profile" className="w-6 h-6 rounded-full" />
              ) : (
                <User className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium text-foreground">{user?.firstName || 'User'}</span>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="text-muted-foreground"
                  data-testid="button-settings"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={() => setShowDeleteDialog(true)}
                  data-testid="menu-item-delete-account"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Account
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => logout()}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </header>

        <main className="flex-1 px-6 py-8 md:py-12 bg-gradient-to-b from-background via-background to-secondary/10">
          {children}
        </main>
      </div>

      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your account 
              and remove all your devices and data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteAccountMutation.isPending ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
