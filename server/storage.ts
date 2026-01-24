import { db } from "./db";
import { devices, deviceNetworkStates, users, agentTokens, type Device, type NetworkState, type AgentToken } from "@shared/schema";
import { eq, desc, inArray, isNull, and } from "drizzle-orm";

export interface IStorage {
  // Read-only operations for the frontend
  getDevices(userId: string): Promise<Device[]>;
  getDevice(id: number): Promise<Device | undefined>;
  getDeviceNetworkState(deviceId: number): Promise<NetworkState | undefined>;
  
  // Device operations for agent
  createDevice(device: Omit<Device, "id" | "createdAt" | "lastSeenAt"> & { userId: string }): Promise<Device>;
  updateDevice(id: number, updates: Partial<Pick<Device, "name" | "status" | "macAddress">>): Promise<Device | undefined>;
  updateNetworkState(deviceId: number, ipAddress: string, isLastKnown: boolean): Promise<NetworkState>;
  deleteDevice(id: number): Promise<boolean>;
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

  async updateNetworkState(deviceId: number, ipAddress: string, isLastKnown: boolean): Promise<NetworkState> {
    // Upsert network state
    const [state] = await db.insert(deviceNetworkStates)
      .values({
        deviceId,
        ipAddress,
        isLastKnown,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: deviceNetworkStates.deviceId,
        set: {
          ipAddress,
          isLastKnown,
          updatedAt: new Date()
        }
      })
      .returning();
    return state;
  }

  async updateDevice(id: number, updates: Partial<Pick<Device, "name" | "status" | "macAddress">>): Promise<Device | undefined> {
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
    await db.delete(users).where(eq(users.id, userId));
  }
}

export const storage = new DatabaseStorage();
