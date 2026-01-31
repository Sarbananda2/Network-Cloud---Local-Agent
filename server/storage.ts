import { db } from "./db";
import { devices, deviceNetworkStates, users, agentTokens, deviceAuthorizations, type Device, type NetworkState, type AgentToken, type DeviceAuthorization, type NetworkAdapter } from "@shared/schema";
import { eq, desc, inArray, isNull, and, lt } from "drizzle-orm";

export interface IStorage {
  // Read-only operations for the frontend
  getDevices(userId: string): Promise<Device[]>;
  getDevice(id: number): Promise<Device | undefined>;
  getDeviceNetworkState(deviceId: number): Promise<NetworkState | undefined>;
  
  // Device operations for agent
  createDevice(device: Omit<Device, "id" | "createdAt" | "lastSeenAt"> & { userId: string; agentTokenId?: number | null }): Promise<Device>;
  updateDevice(id: number, updates: Partial<Pick<Device, "name" | "status" | "macAddress" | "agentTokenId">>): Promise<Device | undefined>;
  updateNetworkState(deviceId: number, ipAddress: string | undefined, isLastKnown: boolean, adapters?: NetworkAdapter[]): Promise<NetworkState>;
  deleteDevice(id: number): Promise<boolean>;
  deleteDeviceAndRevokeAgent(id: number, userId: string): Promise<{ deleted: boolean; agentRevoked: boolean }>;
  getDeviceByMac(userId: string, macAddress: string): Promise<Device | undefined>;
  
  // Agent token operations
  createAgentToken(userId: string, name: string, tokenHash: string, tokenPrefix: string): Promise<AgentToken>;
  getAgentTokens(userId: string): Promise<AgentToken[]>;
  getAgentTokenByHash(tokenHash: string): Promise<AgentToken | undefined>;
  revokeAgentToken(id: number, userId: string): Promise<boolean>;
  updateAgentTokenLastUsed(id: number): Promise<void>;
  updateAgentInfo(id: number, agentUuid: string, macAddress: string, hostname: string, ipAddress: string): Promise<AgentToken | undefined>;
  approveAgentToken(id: number, userId: string): Promise<boolean>;
  rejectAgentToken(id: number, userId: string): Promise<boolean>;
  
  // Pending replacement operations
  storePendingAgent(id: number, agentUuid: string, macAddress: string, hostname: string, ipAddress: string): Promise<AgentToken | undefined>;
  clearPendingAgent(id: number, userId: string): Promise<boolean>;
  approveReplacement(id: number, userId: string): Promise<boolean>;
  
  // Account management
  deleteAccount(userId: string): Promise<void>;
  
  // Device authorization operations (OAuth Device Flow)
  createDeviceAuthorization(deviceCodeHash: string, userCode: string, hostname: string | null, macAddress: string | null, expiresAt: Date): Promise<DeviceAuthorization>;
  getDeviceAuthorizationByDeviceCodeHash(deviceCodeHash: string): Promise<DeviceAuthorization | undefined>;
  getDeviceAuthorizationByUserCode(userCode: string): Promise<DeviceAuthorization | undefined>;
  updateDeviceAuthorizationStatus(id: number, status: string, userId?: string): Promise<DeviceAuthorization | undefined>;
  cleanupExpiredAuthorizations(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getDevices(userId: string): Promise<Device[]> {
    return await db.select()
      .from(devices)
      .where(eq(devices.userId, userId))
      .orderBy(desc(devices.lastSeenAt));
  }

  async getDevice(id: number): Promise<Device | undefined> {
    const [device] = await db.select().from(devices).where(eq(devices.id, id));
    return device;
  }

  async getDeviceNetworkState(deviceId: number): Promise<NetworkState | undefined> {
    const [state] = await db.select()
      .from(deviceNetworkStates)
      .where(eq(deviceNetworkStates.deviceId, deviceId));
    return state;
  }

  // Internal use only
  async createDevice(device: Omit<Device, "id" | "createdAt" | "lastSeenAt"> & { userId: string }): Promise<Device> {
    const [newDevice] = await db.insert(devices).values(device).returning();
    return newDevice;
  }

  async updateNetworkState(
    deviceId: number, 
    ipAddress: string | undefined, 
    isLastKnown: boolean, 
    adapters?: NetworkAdapter[]
  ): Promise<NetworkState> {
    // Build update set with only provided fields to avoid overwriting existing values
    const updateSet: Record<string, any> = {
      isLastKnown,
      updatedAt: new Date()
    };
    
    // Only include fields that are explicitly provided
    if (ipAddress !== undefined && ipAddress !== "") {
      updateSet.ipAddress = ipAddress;
    }
    if (adapters !== undefined) {
      updateSet.adapters = adapters;
    }
    
    // Check if record exists first
    const existing = await this.getDeviceNetworkState(deviceId);
    
    if (existing) {
      // Update existing record with only the provided fields
      const [state] = await db.update(deviceNetworkStates)
        .set(updateSet)
        .where(eq(deviceNetworkStates.deviceId, deviceId))
        .returning();
      return state;
    } else {
      // Insert new record with typed values
      const [state] = await db.insert(deviceNetworkStates)
        .values({
          deviceId,
          isLastKnown,
          updatedAt: new Date(),
          ipAddress: (ipAddress !== undefined && ipAddress !== "") ? ipAddress : null,
          adapters: adapters !== undefined ? adapters : null,
        })
        .returning();
      return state;
    }
  }

  async updateDevice(id: number, updates: Partial<Pick<Device, "name" | "status" | "macAddress" | "agentTokenId">>): Promise<Device | undefined> {
    const [updated] = await db.update(devices)
      .set({ ...updates, lastSeenAt: new Date() })
      .where(eq(devices.id, id))
      .returning();
    return updated;
  }

  async deleteDevice(id: number): Promise<boolean> {
    await db.delete(deviceNetworkStates).where(eq(deviceNetworkStates.deviceId, id));
    const result = await db.delete(devices).where(eq(devices.id, id)).returning();
    return result.length > 0;
  }

  async deleteDeviceAndRevokeAgent(id: number, userId: string): Promise<{ deleted: boolean; agentRevoked: boolean }> {
    // First get the device to find its agent token
    const device = await this.getDevice(id);
    if (!device || device.userId !== userId) {
      return { deleted: false, agentRevoked: false };
    }
    
    // Delete the network state and device
    await db.delete(deviceNetworkStates).where(eq(deviceNetworkStates.deviceId, id));
    const result = await db.delete(devices).where(eq(devices.id, id)).returning();
    const deleted = result.length > 0;
    
    // If device had an agent token, revoke it
    let agentRevoked = false;
    if (device.agentTokenId) {
      agentRevoked = await this.revokeAgentToken(device.agentTokenId, userId);
    }
    
    return { deleted, agentRevoked };
  }

  async getDeviceByMac(userId: string, macAddress: string): Promise<Device | undefined> {
    const [device] = await db.select()
      .from(devices)
      .where(and(eq(devices.userId, userId), eq(devices.macAddress, macAddress)));
    return device;
  }

  async createAgentToken(userId: string, name: string, tokenHash: string, tokenPrefix: string): Promise<AgentToken> {
    const [token] = await db.insert(agentTokens)
      .values({ userId, name, tokenHash, tokenPrefix })
      .returning();
    return token;
  }

  async getAgentTokens(userId: string): Promise<AgentToken[]> {
    return await db.select()
      .from(agentTokens)
      .where(eq(agentTokens.userId, userId))
      .orderBy(desc(agentTokens.createdAt));
  }

  async getAgentTokenByHash(tokenHash: string): Promise<AgentToken | undefined> {
    const [token] = await db.select()
      .from(agentTokens)
      .where(and(eq(agentTokens.tokenHash, tokenHash), isNull(agentTokens.revokedAt)));
    return token;
  }

  async revokeAgentToken(id: number, userId: string): Promise<boolean> {
    const result = await db.update(agentTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(agentTokens.id, id), eq(agentTokens.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async updateAgentTokenLastUsed(id: number): Promise<void> {
    await db.update(agentTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(agentTokens.id, id));
  }

  async updateAgentInfo(id: number, agentUuid: string, macAddress: string, hostname: string, ipAddress: string): Promise<AgentToken | undefined> {
    const now = new Date();
    const [token] = await db.select().from(agentTokens).where(eq(agentTokens.id, id));
    
    const updates: any = {
      agentUuid: agentUuid,
      agentMacAddress: macAddress,
      agentHostname: hostname,
      agentIpAddress: ipAddress,
      lastHeartbeatAt: now,
    };
    
    // Set firstConnectedAt only on first connection
    if (!token?.firstConnectedAt) {
      updates.firstConnectedAt = now;
    }
    
    const [updated] = await db.update(agentTokens)
      .set(updates)
      .where(eq(agentTokens.id, id))
      .returning();
    return updated;
  }

  async approveAgentToken(id: number, userId: string): Promise<boolean> {
    const result = await db.update(agentTokens)
      .set({ approved: true })
      .where(and(eq(agentTokens.id, id), eq(agentTokens.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async rejectAgentToken(id: number, userId: string): Promise<boolean> {
    // Rejecting clears the agent info and pending info, sets approved to false
    const result = await db.update(agentTokens)
      .set({ 
        approved: false,
        agentUuid: null,
        agentMacAddress: null,
        agentHostname: null,
        agentIpAddress: null,
        firstConnectedAt: null,
        lastHeartbeatAt: null,
        pendingAgentUuid: null,
        pendingAgentMacAddress: null,
        pendingAgentHostname: null,
        pendingAgentIpAddress: null,
        pendingAgentAt: null,
      })
      .where(and(eq(agentTokens.id, id), eq(agentTokens.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async storePendingAgent(id: number, agentUuid: string, macAddress: string, hostname: string, ipAddress: string): Promise<AgentToken | undefined> {
    const now = new Date();
    const [updated] = await db.update(agentTokens)
      .set({
        pendingAgentUuid: agentUuid,
        pendingAgentMacAddress: macAddress,
        pendingAgentHostname: hostname,
        pendingAgentIpAddress: ipAddress,
        pendingAgentAt: now,
      })
      .where(eq(agentTokens.id, id))
      .returning();
    return updated;
  }

  async clearPendingAgent(id: number, userId: string): Promise<boolean> {
    const result = await db.update(agentTokens)
      .set({
        pendingAgentUuid: null,
        pendingAgentMacAddress: null,
        pendingAgentHostname: null,
        pendingAgentIpAddress: null,
        pendingAgentAt: null,
      })
      .where(and(eq(agentTokens.id, id), eq(agentTokens.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async approveReplacement(id: number, userId: string): Promise<boolean> {
    // Get the pending agent info
    const [token] = await db.select().from(agentTokens)
      .where(and(eq(agentTokens.id, id), eq(agentTokens.userId, userId)));
    
    if (!token || !token.pendingAgentUuid) {
      return false;
    }

    // Move pending agent to active agent, clear pending fields
    const now = new Date();
    const result = await db.update(agentTokens)
      .set({
        agentUuid: token.pendingAgentUuid,
        agentMacAddress: token.pendingAgentMacAddress,
        agentHostname: token.pendingAgentHostname,
        agentIpAddress: token.pendingAgentIpAddress,
        firstConnectedAt: now,
        lastHeartbeatAt: now,
        approved: true,
        pendingAgentUuid: null,
        pendingAgentMacAddress: null,
        pendingAgentHostname: null,
        pendingAgentIpAddress: null,
        pendingAgentAt: null,
      })
      .where(eq(agentTokens.id, id))
      .returning();
    return result.length > 0;
  }

  async deleteAccount(userId: string): Promise<void> {
    const userDevices = await db.select({ id: devices.id })
      .from(devices)
      .where(eq(devices.userId, userId));
    
    const deviceIds = userDevices.map(d => d.id);
    
    if (deviceIds.length > 0) {
      await db.delete(deviceNetworkStates)
        .where(inArray(deviceNetworkStates.deviceId, deviceIds));
    }
    
    await db.delete(devices).where(eq(devices.userId, userId));
    await db.delete(agentTokens).where(eq(agentTokens.userId, userId));
    await db.delete(deviceAuthorizations).where(eq(deviceAuthorizations.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  // Device authorization operations (OAuth Device Flow)
  async createDeviceAuthorization(
    deviceCodeHash: string, 
    userCode: string, 
    hostname: string | null, 
    macAddress: string | null, 
    expiresAt: Date
  ): Promise<DeviceAuthorization> {
    const [auth] = await db.insert(deviceAuthorizations)
      .values({
        deviceCodeHash,
        userCode,
        hostname,
        macAddress,
        expiresAt,
        status: "pending",
      })
      .returning();
    return auth;
  }

  async getDeviceAuthorizationByDeviceCodeHash(deviceCodeHash: string): Promise<DeviceAuthorization | undefined> {
    const [auth] = await db.select()
      .from(deviceAuthorizations)
      .where(eq(deviceAuthorizations.deviceCodeHash, deviceCodeHash));
    return auth;
  }

  async getDeviceAuthorizationByUserCode(userCode: string): Promise<DeviceAuthorization | undefined> {
    const [auth] = await db.select()
      .from(deviceAuthorizations)
      .where(eq(deviceAuthorizations.userCode, userCode));
    return auth;
  }

  async updateDeviceAuthorizationStatus(
    id: number, 
    status: string, 
    userId?: string
  ): Promise<DeviceAuthorization | undefined> {
    const updates: any = { status };
    if (userId) {
      updates.userId = userId;
    }
    const [updated] = await db.update(deviceAuthorizations)
      .set(updates)
      .where(eq(deviceAuthorizations.id, id))
      .returning();
    return updated;
  }

  async cleanupExpiredAuthorizations(): Promise<number> {
    const now = new Date();
    const result = await db.delete(deviceAuthorizations)
      .where(and(
        lt(deviceAuthorizations.expiresAt, now),
        eq(deviceAuthorizations.status, "pending")
      ))
      .returning();
    return result.length;
  }
}

export const storage = new DatabaseStorage();
