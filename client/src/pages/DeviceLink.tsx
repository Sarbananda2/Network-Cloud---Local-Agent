import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, Loader2, CheckCircle2, XCircle, Monitor, AlertCircle, ArrowLeft } from "lucide-react";
import logoUrl from "@/assets/logo.png";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";

type Step = "enter_code" | "confirm" | "success" | "denied" | "error";

interface DeviceInfo {
  hostname: string | null;
  macAddress: string | null;
  createdAt: string;
}

// Format code to uppercase with hyphen separator (e.g., "ABCD-1234")
const formatCodeInput = (value: string) => {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length > 4) {
    return cleaned.slice(0, 4) + "-" + cleaned.slice(4, 8);
  }
  return cleaned;
};

export default function DeviceLinkPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [step, setStep] = useState<Step>("enter_code");
  const [userCode, setUserCode] = useState("");
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Prefill user code from URL parameter if provided
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const codeFromUrl = params.get("user_code");
    if (codeFromUrl) {
      const formatted = formatCodeInput(codeFromUrl);
      setUserCode(formatted);
    }
  }, [searchString]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCodeInput(e.target.value);
    setUserCode(formatted);
    setErrorMessage("");
  };

  const handleVerifyCode = async () => {
    if (userCode.replace(/-/g, "").length !== 8) {
      setErrorMessage("Please enter a valid 8-character code");
      return;
    }

    setIsVerifying(true);
    setErrorMessage("");

    try {
      const response = await apiRequest("POST", "/api/device/verify", { user_code: userCode });
      const data = await response.json();

      if (!response.ok) {
        if (data.error === "invalid_code") {
          setErrorMessage("Code not found. Please check and try again.");
        } else if (data.error === "expired_code") {
          setErrorMessage("This code has expired. Please request a new code from the app.");
        } else if (data.error === "code_used") {
          setErrorMessage("This code has already been used.");
        } else {
          setErrorMessage(data.message || "Failed to verify code");
        }
        return;
      }

      setDeviceInfo(data);
      setStep("confirm");
    } catch (error) {
      setErrorMessage("Failed to verify code. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleApprove = async (approved: boolean) => {
    setIsApproving(true);

    try {
      const response = await apiRequest("POST", "/api/device/approve", { 
        user_code: userCode, 
        approved 
      });
      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.message || "Failed to process request");
        setStep("error");
        return;
      }

      setStep(approved ? "success" : "denied");
    } catch (error) {
      setErrorMessage("Failed to process request. Please try again.");
      setStep("error");
    } finally {
      setIsApproving(false);
    }
  };

  const handleReset = () => {
    setStep("enter_code");
    setUserCode("");
    setDeviceInfo(null);
    setErrorMessage("");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const returnUrl = encodeURIComponent("/link");
    window.location.href = `/api/login?return_to=${returnUrl}`;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
          
          <div className="relative z-10 space-y-6">
            <div className="text-center space-y-4">
              <img 
                src={logoUrl} 
                alt="NetworkCloud" 
                className="h-12 mx-auto object-contain"
                data-testid="img-logo-link"
              />
            </div>

            <AnimatePresence mode="wait">
              {step === "enter_code" && (
                <motion.div
                  key="enter_code"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="text-center">
                    <h1 className="text-xl font-bold font-display text-foreground">Add a New Device</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Enter the code shown in the NetworkCloud app</p>
                  </div>

                  <div className="space-y-4">
                    <Input
                      type="text"
                      placeholder="XXXX-XXXX"
                      value={userCode}
                      onChange={handleCodeChange}
                      maxLength={9}
                      className="text-center text-2xl font-mono tracking-widest h-14"
                      autoFocus
                      data-testid="input-user-code"
                    />

                    {errorMessage && (
                      <div className="flex items-center gap-2 text-sm text-destructive" data-testid="text-code-error">
                        <AlertCircle className="w-4 h-4" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    <Button
                      onClick={handleVerifyCode}
                      disabled={isVerifying || userCode.replace(/-/g, "").length !== 8}
                      className="w-full"
                      data-testid="button-verify-code"
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          <Link2 className="w-4 h-4 mr-2" />
                          Verify Code
                        </>
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === "confirm" && deviceInfo && (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="text-center">
                    <h1 className="text-xl font-bold font-display text-foreground">Confirm Device</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Do you want to link this device?</p>
                  </div>

                  <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Monitor className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground" data-testid="text-device-hostname">
                          {deviceInfo.hostname || "Unknown Device"}
                        </p>
                        {deviceInfo.macAddress && (
                          <p className="text-xs text-muted-foreground font-mono" data-testid="text-device-mac">
                            {deviceInfo.macAddress}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button
                      onClick={() => handleApprove(true)}
                      disabled={isApproving}
                      className="w-full"
                      data-testid="button-approve-device"
                    >
                      {isApproving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Approve and Link
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleApprove(false)}
                      disabled={isApproving}
                      className="w-full"
                      data-testid="button-deny-device"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Deny
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6 text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold font-display text-foreground">Device Connected</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Your device is now connected. It will appear on your dashboard shortly.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/devices")}
                    className="w-full"
                    data-testid="button-go-to-dashboard"
                  >
                    Go to Dashboard
                  </Button>
                </motion.div>
              )}

              {step === "denied" && (
                <motion.div
                  key="denied"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6 text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                    <XCircle className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold font-display text-foreground">Request Denied</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                      The device linking request has been denied.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    className="w-full"
                    data-testid="button-link-another"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Add Another Device
                  </Button>
                </motion.div>
              )}

              {step === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6 text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-8 h-8 text-destructive" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold font-display text-foreground">Something Went Wrong</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {errorMessage || "An error occurred. Please try again."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    className="w-full"
                    data-testid="button-try-again"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Try Again
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
