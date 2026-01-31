import type { Express } from "express";
import { createServer, type Server } from "http";
import cors from "cors";
import crypto from "crypto";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { api, deviceFlowSchemas } from "@shared/routes";
import { isAgentAuthenticated, type AgentRequest } from "./middleware/agentAuth";
import { generateToken, hashToken } from "./utils/agentToken";
import { notifyDeviceUpdate } from "./websocket";

// Helper functions for device authorization flow
function generateDeviceCode(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateUserCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars.charAt(crypto.randomInt(chars.length));
  }
  return code;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // 1. Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // 2. Protect all /api/devices routes
  // (We use inline middleware or the helper wrapper)
  
  app.get(api.devices.list.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub; // From Replit Auth
      const devices = await storage.getDevices(userId);
      res.json(devices);
    } catch (error) {
      console.error("Error fetching devices:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get(api.devices.get.path, isAuthenticated, async (req: any, res) => {
    try {
      const deviceId = parseInt(req.params.id);
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }

      const device = await storage.getDevice(deviceId);
      
      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }

      // Ensure user owns this device
      const userId = req.user.claims.sub;
      if (device.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized access to this device" });
      }

      res.json(device);
    } catch (error) {
      console.error("Error fetching device:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get(api.devices.getNetworkState.path, isAuthenticated, async (req: any, res) => {
    try {
      const deviceId = parseInt(req.params.id);
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }

      // Check ownership first
      const device = await storage.getDevice(deviceId);
      const userId = req.user.claims.sub;
      
      if (!device || device.userId !== userId) {
        // Return 404 to avoid leaking existence, or 401 if strict
        return res.status(404).json({ message: "Device not found" });
      }

      const state = await storage.getDeviceNetworkState(deviceId);
      
      // It's valid to have a device with no network state yet
      res.json(state || null);
    } catch (error) {
      console.error("Error fetching network state:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Delete device (user-facing)
  app.delete(api.devices.delete.path, isAuthenticated, async (req: any, res) => {
    try {
      const deviceId = parseInt(req.params.id);
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }

      const userId = req.user.claims.sub;
      const device = await storage.getDevice(deviceId);

      if (!device || device.userId !== userId) {
        return res.status(404).json({ message: "Device not found" });
      }

      const result = await storage.deleteDeviceAndRevokeAgent(deviceId, userId);
      if (result.agentRevoked) {
        res.json({ message: "Device deleted and associated NetworkCloud app access revoked" });
      } else {
        res.json({ message: "Device deleted successfully" });
      }
    } catch (error) {
      console.error("Error deleting device:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Account deletion endpoint
  app.delete("/api/account", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      await storage.deleteAccount(userId);
      
      req.logout((err: any) => {
        if (err) {
          console.error("Error during logout after account deletion:", err);
        }
        req.session.destroy((sessionErr: any) => {
          if (sessionErr) {
            console.error("Error destroying session:", sessionErr);
          }
          res.clearCookie("connect.sid");
          res.status(204).send();
        });
      });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // === AGENT TOKEN MANAGEMENT (Dashboard) ===
  
  app.get(api.agentTokens.list.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tokens = await storage.getAgentTokens(userId);
      res.json(tokens.map(t => ({
        id: t.id,
        name: t.name,
        tokenPrefix: t.tokenPrefix,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
        revokedAt: t.revokedAt,
        approved: t.approved,
        agentUuid: t.agentUuid,
        agentMacAddress: t.agentMacAddress,
        agentHostname: t.agentHostname,
        agentIpAddress: t.agentIpAddress,
        firstConnectedAt: t.firstConnectedAt,
        lastHeartbeatAt: t.lastHeartbeatAt,
        pendingAgentUuid: t.pendingAgentUuid,
        pendingAgentMacAddress: t.pendingAgentMacAddress,
        pendingAgentHostname: t.pendingAgentHostname,
        pendingAgentIpAddress: t.pendingAgentIpAddress,
        pendingAgentAt: t.pendingAgentAt,
      })));
    } catch (error) {
      console.error("Error fetching agent tokens:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post(api.agentTokens.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const parseResult = api.agentTokens.create.body.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Validation error", errors: parseResult.error.flatten().fieldErrors });
      }
      
      const userId = req.user.claims.sub;
      const { name } = parseResult.data;
      
      const { token, tokenHash, tokenPrefix } = generateToken();
      const agentToken = await storage.createAgentToken(userId, name, tokenHash, tokenPrefix);
      
      res.status(201).json({
        id: agentToken.id,
        name: agentToken.name,
        tokenPrefix: agentToken.tokenPrefix,
        token,
        createdAt: agentToken.createdAt,
      });
    } catch (error) {
      console.error("Error creating agent token:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.delete(api.agentTokens.revoke.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tokenId = parseInt(req.params.id);
      
      if (isNaN(tokenId)) {
        return res.status(400).json({ message: "Invalid token ID" });
      }
      
      const revoked = await storage.revokeAgentToken(tokenId, userId);
      
      if (!revoked) {
        return res.status(404).json({ message: "Token not found" });
      }
      
      res.json({ message: "Token revoked successfully" });
    } catch (error) {
      console.error("Error revoking agent token:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // === AGENT TOKEN APPROVAL ===
  
  app.post(api.agentTokens.approve.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tokenId = parseInt(req.params.id);
      
      if (isNaN(tokenId)) {
        return res.status(400).json({ message: "Invalid token ID" });
      }
      
      const approved = await storage.approveAgentToken(tokenId, userId);
      
      if (!approved) {
        return res.status(404).json({ message: "Token not found" });
      }
      
      res.json({ message: "Agent approved successfully" });
    } catch (error) {
      console.error("Error approving agent:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post(api.agentTokens.reject.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tokenId = parseInt(req.params.id);
      
      if (isNaN(tokenId)) {
        return res.status(400).json({ message: "Invalid token ID" });
      }
      
      const rejected = await storage.rejectAgentToken(tokenId, userId);
      
      if (!rejected) {
        return res.status(404).json({ message: "Token not found" });
      }
      
      res.json({ message: "Agent rejected and reset" });
    } catch (error) {
      console.error("Error rejecting agent:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Approve pending replacement agent
  app.post(api.agentTokens.approveReplacement.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tokenId = parseInt(req.params.id);
      
      if (isNaN(tokenId)) {
        return res.status(400).json({ message: "Invalid token ID" });
      }
      
      const approved = await storage.approveReplacement(tokenId, userId);
      
      if (!approved) {
        return res.status(404).json({ message: "Token not found or no pending replacement" });
      }
      
      res.json({ message: "Replacement agent approved successfully" });
    } catch (error) {
      console.error("Error approving replacement:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Reject pending replacement agent (keep current agent)
  app.post(api.agentTokens.rejectPending.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tokenId = parseInt(req.params.id);
      
      if (isNaN(tokenId)) {
        return res.status(400).json({ message: "Invalid token ID" });
      }
      
      const cleared = await storage.clearPendingAgent(tokenId, userId);
      
      if (!cleared) {
        return res.status(404).json({ message: "Token not found" });
      }
      
      res.json({ message: "Pending replacement rejected, current agent retained" });
    } catch (error) {
      console.error("Error rejecting pending agent:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // === AGENT API (Called by the agent) ===
  
  // Enable CORS for all agent API endpoints
  // This allows the Agent Simulator (and any external client) to call these endpoints
  // Security is handled by Bearer token authentication, not origin restrictions
  const agentCorsOptions = {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
  app.use("/api/agent", cors(agentCorsOptions));
  
  app.post(api.agent.heartbeat.path, isAgentAuthenticated, async (req: AgentRequest, res) => {
    try {
      const parseResult = api.agent.heartbeat.body.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Validation error", errors: parseResult.error.flatten().fieldErrors });
      }
      
      const { agentUuid, macAddress, hostname, ipAddress } = parseResult.data;
      const tokenId = req.agentTokenId!;
      const userId = req.agentUserId!;
      
      // Get current token state BEFORE updating
      const tokensBefore = await storage.getAgentTokens(userId);
      const tokenBefore = tokensBefore.find(t => t.id === tokenId);
      
      if (!tokenBefore) {
        return res.status(401).json({ message: "Token not found" });
      }
      
      // Check if this is a different agent trying to use an ALREADY CONNECTED token
      // Use UUID for mismatch detection (more reliable than MAC)
      if (tokenBefore.agentUuid && tokenBefore.agentUuid !== agentUuid) {
        // Different agent detected - store as pending replacement instead of blocking
        await storage.storePendingAgent(tokenId, agentUuid, macAddress, hostname, ipAddress || "");
        await storage.updateAgentTokenLastUsed(tokenId);
        return res.json({
          status: "pending_reauthorization",
          serverTime: new Date().toISOString(),
          message: "A different agent is requesting to use this token. Waiting for user to approve replacement.",
        });
      }
      
      // Check if this agent is the pending one (already stored, waiting for approval)
      if (tokenBefore.pendingAgentUuid && tokenBefore.pendingAgentUuid === agentUuid) {
        await storage.updateAgentTokenLastUsed(tokenId);
        return res.json({
          status: "pending_reauthorization",
          serverTime: new Date().toISOString(),
          message: "Waiting for user to approve this agent as replacement.",
        });
      }
      
      // Update agent info and get fresh token data
      const updatedToken = await storage.updateAgentInfo(tokenId, agentUuid, macAddress, hostname, ipAddress || "");
      await storage.updateAgentTokenLastUsed(tokenId);
      
      // Use fresh token data for approval check
      if (!updatedToken?.approved) {
        return res.json({
          status: "pending_approval",
          serverTime: new Date().toISOString(),
          message: "Waiting for approval from dashboard user.",
        });
      }
      
      res.json({
        status: "ok",
        serverTime: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error processing heartbeat:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post(api.agent.registerDevice.path, isAgentAuthenticated, async (req: AgentRequest, res) => {
    try {
      const parseResult = api.agent.registerDevice.body.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Validation error", errors: parseResult.error.flatten().fieldErrors });
      }
      
      const userId = req.agentUserId!;
      const agentTokenId = req.agentTokenId!;
      const { name, macAddress, status, ipAddress, adapters } = parseResult.data;
      
      if (macAddress) {
        const existing = await storage.getDeviceByMac(userId, macAddress);
        if (existing) {
          // Update existing device and link to this agent token
          const updated = await storage.updateDevice(existing.id, { 
            name, 
            status: status || "online",
            agentTokenId 
          });
          if (ipAddress !== undefined || adapters !== undefined) {
            await storage.updateNetworkState(existing.id, ipAddress, false, adapters);
          }
          notifyDeviceUpdate(userId);
          return res.status(200).json(updated);
        }
      }
      
      const device = await storage.createDevice({
        userId,
        agentTokenId,
        name,
        macAddress: macAddress || null,
        status: status || "online",
      });
      
      if (ipAddress !== undefined || adapters !== undefined) {
        await storage.updateNetworkState(device.id, ipAddress, false, adapters);
      }
      
      notifyDeviceUpdate(userId);
      res.status(201).json(device);
    } catch (error) {
      console.error("Error registering device:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.patch(api.agent.updateDevice.path, isAgentAuthenticated, async (req: AgentRequest, res) => {
    try {
      const parseResult = api.agent.updateDevice.body.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Validation error", errors: parseResult.error.flatten().fieldErrors });
      }
      
      const userId = req.agentUserId!;
      const deviceId = parseInt(req.params.id);
      
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }
      
      const device = await storage.getDevice(deviceId);
      if (!device || device.userId !== userId) {
        return res.status(404).json({ message: "Device not found" });
      }
      
      const { name, status, ipAddress, adapters } = parseResult.data;
      const updates: any = {};
      if (name) updates.name = name;
      if (status) updates.status = status;
      
      const updated = await storage.updateDevice(deviceId, updates);
      
      if (ipAddress !== undefined || adapters !== undefined) {
        await storage.updateNetworkState(deviceId, ipAddress, false, adapters);
      }
      
      notifyDeviceUpdate(userId);
      res.json(updated);
    } catch (error) {
      console.error("Error updating device:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.delete(api.agent.deleteDevice.path, isAgentAuthenticated, async (req: AgentRequest, res) => {
    try {
      const userId = req.agentUserId!;
      const deviceId = parseInt(req.params.id);
      
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }
      
      const device = await storage.getDevice(deviceId);
      if (!device || device.userId !== userId) {
        return res.status(404).json({ message: "Device not found" });
      }
      
      // Agent-initiated delete doesn't revoke itself, just deletes the device
      await storage.deleteDevice(deviceId);
      notifyDeviceUpdate(userId);
      res.json({ message: "Device deleted successfully" });
    } catch (error) {
      console.error("Error deleting device:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.put(api.agent.syncDevices.path, isAgentAuthenticated, async (req: AgentRequest, res) => {
    try {
      const parseResult = api.agent.syncDevices.body.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Validation error", errors: parseResult.error.flatten().fieldErrors });
      }
      
      const userId = req.agentUserId!;
      const agentTokenId = req.agentTokenId!;
      const { devices: incomingDevices } = parseResult.data;
      
      const existingDevices = await storage.getDevices(userId);
      const existingByMac = new Map(existingDevices.filter(d => d.macAddress).map(d => [d.macAddress, d]));
      
      let created = 0;
      let updated = 0;
      
      for (const incoming of incomingDevices) {
        const { name, macAddress, status, ipAddress, adapters } = incoming;
        
        if (macAddress && existingByMac.has(macAddress)) {
          const existing = existingByMac.get(macAddress)!;
          await storage.updateDevice(existing.id, { name, status, agentTokenId });
          if (ipAddress !== undefined || adapters !== undefined) {
            await storage.updateNetworkState(existing.id, ipAddress, false, adapters);
          }
          existingByMac.delete(macAddress);
          updated++;
        } else {
          const device = await storage.createDevice({ userId, agentTokenId, name, macAddress: macAddress || null, status });
          if (ipAddress !== undefined || adapters !== undefined) {
            await storage.updateNetworkState(device.id, ipAddress, false, adapters);
          }
          created++;
        }
      }
      
      let deleted = 0;
      const remainingDevices = Array.from(existingByMac.values());
      for (const device of remainingDevices) {
        await storage.deleteDevice(device.id);
        deleted++;
      }
      
      if (created > 0 || updated > 0 || deleted > 0) {
        notifyDeviceUpdate(userId);
      }
      
      res.json({ created, updated, deleted });
    } catch (error) {
      console.error("Error syncing devices:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // === DEVICE AUTHORIZATION FLOW (OAuth Device Flow) ===
  
  // Enable CORS for device authorization endpoints (called by external agents)
  const deviceCorsOptions = {
    origin: "*",
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  };
  app.use("/api/device", cors(deviceCorsOptions));
  
  // POST /api/device/authorize - Agent requests a device code
  app.post("/api/device/authorize", async (req, res) => {
    try {
      const parseResult = deviceFlowSchemas.authorize.body.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "invalid_request", message: "Validation error" });
      }
      
      const { hostname, macAddress } = parseResult.data;
      
      // Generate codes
      const deviceCode = generateDeviceCode();
      const deviceCodeHash = hashToken(deviceCode);
      const userCode = generateUserCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      
      // Store authorization request
      await storage.createDeviceAuthorization(
        deviceCodeHash,
        userCode,
        hostname || null,
        macAddress || null,
        expiresAt
      );
      
      // Build verification URI
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || req.hostname;
      const verificationUri = `${protocol}://${host}/link`;
      
      res.json({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: verificationUri,
        expires_in: 900,
        interval: 5,
      });
    } catch (error: any) {
      // Handle unique constraint violation (retry with new codes)
      if (error.code === "23505") {
        return res.status(500).json({ error: "code_generation_failed", message: "Please try again" });
      }
      console.error("Error creating device authorization:", error);
      res.status(500).json({ error: "server_error" });
    }
  });
  
  // POST /api/device/token - Agent polls for token
  app.post("/api/device/token", async (req, res) => {
    try {
      const parseResult = deviceFlowSchemas.token.body.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "invalid_request", message: "device_code is required" });
      }
      
      const { device_code } = parseResult.data;
      const deviceCodeHash = hashToken(device_code);
      const auth = await storage.getDeviceAuthorizationByDeviceCodeHash(deviceCodeHash);
      
      if (!auth) {
        return res.status(400).json({ error: "invalid_grant", message: "Device code not found" });
      }
      
      // Check expiration
      if (new Date() > auth.expiresAt) {
        await storage.updateDeviceAuthorizationStatus(auth.id, "expired");
        return res.status(400).json({ error: "expired_token", message: "Device code has expired" });
      }
      
      // Check status
      switch (auth.status) {
        case "pending":
          return res.status(400).json({ error: "authorization_pending" });
        
        case "denied":
          return res.status(400).json({ error: "access_denied" });
        
        case "exchanged":
          return res.status(400).json({ error: "invalid_grant", message: "Code already used" });
        
        case "approved":
          // Create agent token for the user
          const userId = auth.userId!;
          const tokenName = auth.hostname ? `Agent: ${auth.hostname}` : "Device Flow Agent";
          const { token, tokenHash, tokenPrefix } = generateToken();
          
          const agentToken = await storage.createAgentToken(userId, tokenName, tokenHash, tokenPrefix);
          
          // Mark authorization as exchanged
          await storage.updateDeviceAuthorizationStatus(auth.id, "exchanged");
          
          // Generate a UUID for this agent
          const agentUuid = crypto.randomUUID();
          
          // Pre-populate agent info so heartbeat just approves
          await storage.updateAgentInfo(
            agentToken.id,
            agentUuid,
            auth.macAddress || "",
            auth.hostname || "",
            ""
          );
          
          // Auto-approve since user explicitly approved via device flow
          await storage.approveAgentToken(agentToken.id, userId);
          
          return res.json({
            access_token: token,
            token_type: "Bearer",
            agent_uuid: agentUuid,
          });
        
        default:
          return res.status(400).json({ error: "invalid_grant" });
      }
    } catch (error) {
      console.error("Error polling device token:", error);
      res.status(500).json({ error: "server_error" });
    }
  });
  
  // POST /api/device/verify - Web UI validates user code (requires auth)
  app.post("/api/device/verify", isAuthenticated, async (req: any, res) => {
    try {
      const parseResult = deviceFlowSchemas.verify.body.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "invalid_code", message: "User code is required" });
      }
      
      const { user_code } = parseResult.data;
      
      // Normalize code (uppercase, add dash if missing)
      let normalizedCode = user_code.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (normalizedCode.length === 8) {
        normalizedCode = normalizedCode.slice(0, 4) + "-" + normalizedCode.slice(4);
      }
      
      const auth = await storage.getDeviceAuthorizationByUserCode(normalizedCode);
      
      if (!auth) {
        return res.status(404).json({ error: "invalid_code", message: "Code not found" });
      }
      
      // Check expiration
      if (new Date() > auth.expiresAt) {
        return res.status(400).json({ error: "expired_code", message: "Code has expired" });
      }
      
      // Check if already processed
      if (auth.status !== "pending") {
        return res.status(400).json({ error: "code_used", message: "Code has already been used" });
      }
      
      res.json({
        hostname: auth.hostname,
        macAddress: auth.macAddress,
        createdAt: auth.createdAt,
      });
    } catch (error) {
      console.error("Error verifying device code:", error);
      res.status(500).json({ error: "server_error" });
    }
  });
  
  // POST /api/device/approve - Web UI approves/denies device (requires auth)
  app.post("/api/device/approve", isAuthenticated, async (req: any, res) => {
    try {
      const parseResult = deviceFlowSchemas.approve.body.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "invalid_request", message: "Validation error", errors: parseResult.error.flatten().fieldErrors });
      }
      
      const { user_code, approved } = parseResult.data;
      const userId = req.user.claims.sub;
      
      // Normalize code
      let normalizedCode = user_code.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (normalizedCode.length === 8) {
        normalizedCode = normalizedCode.slice(0, 4) + "-" + normalizedCode.slice(4);
      }
      
      const auth = await storage.getDeviceAuthorizationByUserCode(normalizedCode);
      
      if (!auth) {
        return res.status(404).json({ error: "invalid_code", message: "Code not found" });
      }
      
      // Check expiration
      if (new Date() > auth.expiresAt) {
        return res.status(400).json({ error: "expired_code", message: "Code has expired" });
      }
      
      // Check if already processed
      if (auth.status !== "pending") {
        return res.status(400).json({ error: "code_used", message: "Code has already been processed" });
      }
      
      const newStatus = approved ? "approved" : "denied";
      await storage.updateDeviceAuthorizationStatus(auth.id, newStatus, approved ? userId : undefined);
      
      res.json({
        success: true,
        message: approved ? "Device linked successfully" : "Device linking denied",
      });
    } catch (error) {
      console.error("Error approving device:", error);
      res.status(500).json({ error: "server_error" });
    }
  });
  
  // Cleanup expired authorizations periodically (simple in-memory interval)
  setInterval(async () => {
    try {
      const cleaned = await storage.cleanupExpiredAuthorizations();
      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} expired device authorizations`);
      }
    } catch (error) {
      console.error("Error cleaning up authorizations:", error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  return httpServer;
}
