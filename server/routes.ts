import type { Express } from "express";
import { createServer, type Server } from "http";
import cors from "cors";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { isAgentAuthenticated, type AgentRequest } from "./middleware/agentAuth";
import { generateToken } from "./utils/agentToken";

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
      const { name, macAddress, status, ipAddress } = parseResult.data;
      
      if (macAddress) {
        const existing = await storage.getDeviceByMac(userId, macAddress);
        if (existing) {
          const updated = await storage.updateDevice(existing.id, { name, status: status || "online" });
          if (ipAddress) {
            await storage.updateNetworkState(existing.id, ipAddress, false);
          }
          return res.status(200).json(updated);
        }
      }
      
      const device = await storage.createDevice({
        userId,
        name,
        macAddress: macAddress || null,
        status: status || "online",
      });
      
      if (ipAddress) {
        await storage.updateNetworkState(device.id, ipAddress, false);
      }
      
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
      
      const { name, status, ipAddress } = parseResult.data;
      const updates: any = {};
      if (name) updates.name = name;
      if (status) updates.status = status;
      
      const updated = await storage.updateDevice(deviceId, updates);
      
      if (ipAddress) {
        await storage.updateNetworkState(deviceId, ipAddress, false);
      }
      
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
      
      await storage.deleteDevice(deviceId);
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
      const { devices: incomingDevices } = parseResult.data;
      
      const existingDevices = await storage.getDevices(userId);
      const existingByMac = new Map(existingDevices.filter(d => d.macAddress).map(d => [d.macAddress, d]));
      
      let created = 0;
      let updated = 0;
      
      for (const incoming of incomingDevices) {
        const { name, macAddress, status, ipAddress } = incoming;
        
        if (macAddress && existingByMac.has(macAddress)) {
          const existing = existingByMac.get(macAddress)!;
          await storage.updateDevice(existing.id, { name, status });
          if (ipAddress) {
            await storage.updateNetworkState(existing.id, ipAddress, false);
          }
          existingByMac.delete(macAddress);
          updated++;
        } else {
          const device = await storage.createDevice({ userId, name, macAddress: macAddress || null, status });
          if (ipAddress) {
            await storage.updateNetworkState(device.id, ipAddress, false);
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
      
      res.json({ created, updated, deleted });
    } catch (error) {
      console.error("Error syncing devices:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  return httpServer;
}
