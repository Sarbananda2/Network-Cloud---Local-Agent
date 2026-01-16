import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Mail, Lock, Shield } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import logoUrl from "@/assets/logo.png";

export default function LoginPage() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-background via-background to-secondary/30 flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Card className="border border-border/60 shadow-2xl shadow-primary/5 bg-background p-8 lg:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
          
          <div className="relative z-10 space-y-8">
            {/* Logo & Branding */}
            <div className="text-center space-y-4">
              <img 
                src={logoUrl} 
                alt="NetworkCloud" 
                className="h-16 mx-auto object-contain"
                data-testid="img-logo-login"
              />
              <div>
                <h1 className="text-2xl font-bold font-display text-foreground">Welcome to NetworkCloud</h1>
                <p className="text-muted-foreground mt-1">Sign in to access your dashboard</p>
              </div>
            </div>

            {/* Provider Buttons */}
            <div className="space-y-3">
              <Button 
                variant="outline"
                size="lg" 
                onClick={handleLogin}
                className="w-full"
                data-testid="button-login-google"
              >
                <SiGoogle className="w-5 h-5 mr-3 text-[#4285F4]" />
                Continue with Google
              </Button>

              {/* Divider */}
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/60"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-3 text-muted-foreground">or</span>
                </div>
              </div>

              <Button 
                size="lg" 
                onClick={handleLogin}
                className="w-full"
                data-testid="button-login"
              >
                <Mail className="w-5 h-5 mr-3" />
                Continue with Email
              </Button>
            </div>

            {/* Trust Signal */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Lock className="w-3.5 h-3.5" />
              <span>Secure authentication powered by Replit</span>
            </div>

            {/* Terms */}
            <p className="text-center text-xs text-muted-foreground leading-relaxed">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          <Shield className="w-3.5 h-3.5 inline mr-1" />
          Your data is encrypted and secure
        </p>
      </motion.div>
    </div>
  );
}
