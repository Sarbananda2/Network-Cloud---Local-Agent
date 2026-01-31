import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { 
  Key, Plus, Copy, Check, Trash2, Loader2, ShieldCheck, AlertTriangle, 
  Clock, Monitor, Wifi, CheckCircle2, XCircle, HelpCircle, Fingerprint
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AgentToken {
  id: number;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  approved: boolean | null;
  agentUuid: string | null;
  agentMacAddress: string | null;
  agentHostname: string | null;
  agentIpAddress: string | null;
  firstConnectedAt: string | null;
  lastHeartbeatAt: string | null;
  pendingAgentUuid: string | null;
  pendingAgentMacAddress: string | null;
  pendingAgentHostname: string | null;
  pendingAgentIpAddress: string | null;
  pendingAgentAt: string | null;
}

interface NewTokenResponse {
  id: number;
  name: string;
  tokenPrefix: string;
  token: string;
  createdAt: string;
}

export default function AgentTokens() {
  const { toast } = useToast();
  const [newTokenName, setNewTokenName] = useState("");
  const [showNewTokenDialog, setShowNewTokenDialog] = useState(false);
  const [newToken, setNewToken] = useState<NewTokenResponse | null>(null);
  const [tokenToRevoke, setTokenToRevoke] = useState<AgentToken | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: tokens, isLoading } = useQuery<AgentToken[]>({
    queryKey: ["/api/agent-tokens"],
    refetchInterval: 5000, // Poll every 5 seconds to catch new agent connections
  });

  const createTokenMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/agent-tokens", { name });
      return response.json();
    },
    onSuccess: (data: NewTokenResponse) => {
      setShowNewTokenDialog(false);
      setNewToken(data);
      setNewTokenName("");
      queryClient.invalidateQueries({ queryKey: ["/api/agent-tokens"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create token. Please try again.",
        variant: "destructive",
      });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: async (tokenId: number) => {
      await apiRequest("DELETE", `/api/agent-tokens/${tokenId}`);
    },
    onSuccess: () => {
      toast({
        title: "Token revoked",
        description: "The agent token has been permanently revoked.",
      });
      setTokenToRevoke(null);
      queryClient.invalidateQueries({ queryKey: ["/api/agent-tokens"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to revoke token. Please try again.",
        variant: "destructive",
      });
    },
  });

  const approveTokenMutation = useMutation({
    mutationFn: async (tokenId: number) => {
      await apiRequest("POST", `/api/agent-tokens/${tokenId}/approve`);
    },
    onSuccess: () => {
      toast({
        title: "Agent approved",
        description: "The agent can now sync devices to your account.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-tokens"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve agent. Please try again.",
        variant: "destructive",
      });
    },
  });

  const rejectTokenMutation = useMutation({
    mutationFn: async (tokenId: number) => {
      await apiRequest("POST", `/api/agent-tokens/${tokenId}/reject`);
    },
    onSuccess: () => {
      toast({
        title: "Agent rejected",
        description: "The agent connection has been rejected and reset.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-tokens"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject agent. Please try again.",
        variant: "destructive",
      });
    },
  });

  const approveReplacementMutation = useMutation({
    mutationFn: async (tokenId: number) => {
      await apiRequest("POST", `/api/agent-tokens/${tokenId}/approve-replacement`);
    },
    onSuccess: () => {
      toast({
        title: "Replacement approved",
        description: "The new agent has replaced the previous one.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-tokens"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve replacement. Please try again.",
        variant: "destructive",
      });
    },
  });

  const rejectPendingMutation = useMutation({
    mutationFn: async (tokenId: number) => {
      await apiRequest("POST", `/api/agent-tokens/${tokenId}/reject-pending`);
    },
    onSuccess: () => {
      toast({
        title: "Pending rejected",
        description: "The pending agent has been rejected. Current agent retained.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-tokens"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject pending agent. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateToken = () => {
    if (!newTokenName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for this token.",
        variant: "destructive",
      });
      return;
    }
    createTokenMutation.mutate(newTokenName.trim());
  };

  const handleCopyToken = async () => {
    if (newToken?.token) {
      await navigator.clipboard.writeText(newToken.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Token copied",
        description: "The token has been copied to your clipboard.",
      });
    }
  };

  const handleCloseNewTokenDialog = () => {
    setNewToken(null);
    setCopied(false);
  };

  // Categorize tokens
  const activeTokens = tokens?.filter(t => !t.revokedAt) || [];
  const revokedTokens = tokens?.filter(t => t.revokedAt) || [];
  
  // Further categorize active tokens
  const pendingApproval = activeTokens.filter(t => t.agentMacAddress && !t.approved);
  const approvedAgents = activeTokens.filter(t => t.approved && !t.pendingAgentUuid);
  const pendingReplacement = activeTokens.filter(t => t.approved && t.pendingAgentUuid);
  const neverConnected = activeTokens.filter(t => !t.agentMacAddress && !t.approved);

  const isRecentlyActive = (lastHeartbeat: string | null) => {
    if (!lastHeartbeat) return false;
    const diff = Date.now() - new Date(lastHeartbeat).getTime();
    return diff < 5 * 60 * 1000; // 5 minutes
  };

  const AgentDeviceInfo = ({ token }: { token: AgentToken }) => (
    <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-2">
      {token.agentUuid && (
        <div className="flex items-center gap-2 text-sm">
          <Fingerprint className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Agent ID:</span>
          <code className="text-xs bg-background px-2 py-0.5 rounded font-mono" data-testid={`text-uuid-${token.id}`}>
            {token.agentUuid}
          </code>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <Monitor className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">Hostname:</span>
        <span className="font-medium" data-testid={`text-hostname-${token.id}`}>{token.agentHostname || "Unknown"}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Key className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">MAC:</span>
        <code className="text-xs bg-background px-2 py-0.5 rounded font-mono" data-testid={`text-mac-${token.id}`}>
          {token.agentMacAddress}
        </code>
      </div>
      {token.agentIpAddress && (
        <div className="flex items-center gap-2 text-sm">
          <Wifi className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">IP:</span>
          <span className="font-mono text-sm" data-testid={`text-ip-${token.id}`}>{token.agentIpAddress}</span>
        </div>
      )}
      {token.lastHeartbeatAt && (
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Last seen:</span>
          <span data-testid={`text-lastseen-${token.id}`}>
            {formatDistanceToNow(new Date(token.lastHeartbeatAt), { addSuffix: true })}
          </span>
          {isRecentlyActive(token.lastHeartbeatAt) && (
            <Badge variant="outline" className="text-green-600 border-green-600 ml-1">Online</Badge>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">Agent Tokens</h1>
            <p className="text-muted-foreground">
              Create and manage API tokens for your local NetworkCloud agents.
            </p>
          </div>
          
          <Button 
            onClick={() => setShowNewTokenDialog(true)}
            data-testid="button-create-token"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Token
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : activeTokens.length === 0 && revokedTokens.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 px-4"
            data-testid="empty-state-no-tokens"
          >
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
              <Key className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-3 text-center">
              No agent tokens yet
            </h2>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Create an API token to connect your local NetworkCloud agent to this dashboard.
              Each token allows one agent to register and update devices on your behalf.
            </p>
            <Button onClick={() => setShowNewTokenDialog(true)} data-testid="button-create-first-token">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Token
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {/* Pending Approval Section */}
            {pendingApproval.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-amber-500/50 bg-amber-500/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="w-5 h-5" />
                      Pending Approval ({pendingApproval.length})
                    </CardTitle>
                    <CardDescription>
                      New agents are waiting for your approval before they can sync devices.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="divide-y divide-border">
                      {pendingApproval.map((token) => (
                        <div 
                          key={token.id} 
                          className="py-4 first:pt-0 last:pb-0"
                          data-testid={`row-pending-token-${token.id}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                                  <HelpCircle className="w-5 h-5 text-amber-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-foreground" data-testid={`text-token-name-${token.id}`}>
                                    {token.name}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    New device wants to connect
                                  </p>
                                </div>
                              </div>
                              <AgentDeviceInfo token={token} />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => approveTokenMutation.mutate(token.id)}
                                disabled={approveTokenMutation.isPending}
                                data-testid={`button-approve-${token.id}`}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => rejectTokenMutation.mutate(token.id)}
                                disabled={rejectTokenMutation.isPending}
                                className="text-destructive hover:text-destructive"
                                data-testid={`button-reject-${token.id}`}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Pending Replacement Section */}
            {pendingReplacement.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-orange-500/50 bg-orange-500/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-orange-600">
                      <AlertTriangle className="w-5 h-5" />
                      Pending Replacement ({pendingReplacement.length})
                    </CardTitle>
                    <CardDescription>
                      A different agent is trying to use these tokens. Approve to replace the current agent, or reject to keep the current one.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="divide-y divide-border">
                      {pendingReplacement.map((token) => (
                        <div 
                          key={token.id} 
                          className="py-4 first:pt-0 last:pb-0"
                          data-testid={`row-pending-replacement-${token.id}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-foreground" data-testid={`text-token-name-${token.id}`}>
                                    {token.name}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Different agent wants to take over
                                  </p>
                                </div>
                              </div>
                              
                              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="p-3 bg-muted/50 rounded-lg">
                                  <p className="text-xs font-medium text-muted-foreground mb-2">Current Agent</p>
                                  <div className="space-y-1 text-sm">
                                    <div className="flex items-center gap-2">
                                      <Monitor className="w-3 h-3 text-muted-foreground" />
                                      <span>{token.agentHostname || "Unknown"}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Key className="w-3 h-3 text-muted-foreground" />
                                      <code className="text-xs">{token.agentMacAddress}</code>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/30">
                                  <p className="text-xs font-medium text-orange-600 mb-2">New Agent (Pending)</p>
                                  <div className="space-y-1 text-sm">
                                    <div className="flex items-center gap-2">
                                      <Monitor className="w-3 h-3 text-orange-600" />
                                      <span>{token.pendingAgentHostname || "Unknown"}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Key className="w-3 h-3 text-orange-600" />
                                      <code className="text-xs">{token.pendingAgentMacAddress}</code>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button
                                size="sm"
                                onClick={() => approveReplacementMutation.mutate(token.id)}
                                disabled={approveReplacementMutation.isPending}
                                data-testid={`button-approve-replacement-${token.id}`}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                Replace
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => rejectPendingMutation.mutate(token.id)}
                                disabled={rejectPendingMutation.isPending}
                                data-testid={`button-reject-pending-${token.id}`}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Keep Current
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Approved Agents Section */}
            {approvedAgents.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-green-600" />
                    Approved Agents ({approvedAgents.length})
                  </CardTitle>
                  <CardDescription>
                    These agents are authorized to sync devices to your account.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-border">
                    {approvedAgents.map((token) => (
                      <div 
                        key={token.id} 
                        className="py-4 first:pt-0 last:pb-0"
                        data-testid={`row-approved-token-${token.id}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                              </div>
                              <div>
                                <p className="font-medium text-foreground" data-testid={`text-token-name-${token.id}`}>
                                  {token.name}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                                    {token.tokenPrefix}...
                                  </code>
                                  <Badge variant="outline" className="text-green-600 border-green-600">Approved</Badge>
                                </div>
                              </div>
                            </div>
                            <AgentDeviceInfo token={token} />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTokenToRevoke(token)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            data-testid={`button-revoke-token-${token.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Never Connected Section */}
            {neverConnected.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-5 h-5" />
                    Waiting for Connection ({neverConnected.length})
                  </CardTitle>
                  <CardDescription>
                    These tokens have been created but no agent has connected yet.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-border">
                    {neverConnected.map((token) => (
                      <div 
                        key={token.id} 
                        className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                        data-testid={`row-waiting-token-${token.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <Key className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div>
                              <p className="font-medium text-foreground" data-testid={`text-token-name-${token.id}`}>
                                {token.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                                  {token.tokenPrefix}...
                                </code>
                                <span className="text-xs text-muted-foreground">
                                  Created {formatDistanceToNow(new Date(token.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTokenToRevoke(token)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          data-testid={`button-revoke-token-${token.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Revoked Tokens Section */}
            {revokedTokens.length > 0 && (
              <Card className="opacity-60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-muted-foreground">
                    <AlertTriangle className="w-5 h-5" />
                    Revoked Tokens
                  </CardTitle>
                  <CardDescription>
                    These tokens are no longer valid and cannot be used.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-border">
                    {revokedTokens.map((token) => (
                      <div 
                        key={token.id} 
                        className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                        data-testid={`row-revoked-token-${token.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <Key className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div>
                              <p className="font-medium text-muted-foreground line-through">
                                {token.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                                  {token.tokenPrefix}...
                                </code>
                                <Badge variant="outline" className="text-xs">Revoked</Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Create Token Dialog */}
        <Dialog open={showNewTokenDialog} onOpenChange={setShowNewTokenDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Agent Token</DialogTitle>
              <DialogDescription>
                Give your token a descriptive name to help you identify which agent is using it.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="e.g., Home Network Agent"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateToken()}
                data-testid="input-token-name"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewTokenDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreateToken} 
                disabled={createTokenMutation.isPending}
                data-testid="button-confirm-create-token"
              >
                {createTokenMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Create Token
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Token Success Dialog */}
        <Dialog open={!!newToken} onOpenChange={() => handleCloseNewTokenDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                Token Created
              </DialogTitle>
              <DialogDescription>
                Copy this token now. For security, you won't be able to see it again.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Your API Token</p>
                <code className="text-sm font-mono break-all select-all" data-testid="text-new-token">
                  {newToken?.token}
                </code>
              </div>
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={handleCopyToken}
                data-testid="button-copy-token"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  <strong>Next steps:</strong> Configure your agent with this token. When the agent connects, 
                  you'll see a new entry in "Pending Approval" where you can approve or reject it.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCloseNewTokenDialog} data-testid="button-done-token">
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Revoke Confirmation Dialog */}
        <AlertDialog open={!!tokenToRevoke} onOpenChange={(open) => !open && setTokenToRevoke(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke this token?</AlertDialogTitle>
              <AlertDialogDescription>
                This will immediately invalidate the token "{tokenToRevoke?.name}". 
                Any agents using this token will no longer be able to connect.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-revoke">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => tokenToRevoke && revokeTokenMutation.mutate(tokenToRevoke.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-revoke"
              >
                {revokeTokenMutation.isPending ? "Revoking..." : "Revoke Token"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
