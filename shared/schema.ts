import { pgTable, text, serial, timestamp, boolean, varchar, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { users } from "./models/auth";

// === NETWORK ADAPTER SCHEMA ===
// Represents a single network adapter from ipconfig /all
// Valid adapter types (lowercase)
const adapterTypes = ["ethernet", "wifi", "virtual", "vpn", "loopback", "other"] as const;
type AdapterType = typeof adapterTypes[number];

// Normalize adapter type: lowercase and map unknown to "other"
const normalizeAdapterType = (val: unknown): AdapterType => {
  if (typeof val !== "string") return "other";
  const lower = val.toLowerCase();
  return adapterTypes.includes(lower as AdapterType) ? (lower as AdapterType) : "other";
};

export const networkAdapterSchema = z.object({
  name: z.string(), // e.g., "Ethernet", "Wi-Fi", "Hyper-V Virtual Ethernet Adapter"
  // Accept any case and normalize to lowercase; unknown values become "other"
  type: z.preprocess(normalizeAdapterType, z.enum(adapterTypes)),
  macAddress: z.string().nullable().optional(), // Physical address
  ipv4: z.string().nullable().optional(), // IPv4 address
  ipv6: z.string().nullable().optional(), // IPv6 address
  gateway: z.string().nullable().optional(), // Default gateway
  subnetMask: z.string().nullable().optional(),
  dns: z.array(z.string()).nullable().optional(), // DNS servers
  dhcpEnabled: z.boolean().nullable().optional(),
  dhcpServer: z.string().nullable().optional(),
  connected: z.boolean().default(true), // Whether adapter is connected/has media
});

export type NetworkAdapter = z.infer<typeof networkAdapterSchema>;

export const networkAdaptersArraySchema = z.array(networkAdapterSchema);

// Export everything from auth model (users AND sessions tables)
export * from "./models/auth";

// === DEVICE AUTHORIZATIONS (OAuth Device Flow) ===

export const deviceAuthorizations = pgTable("device_authorizations", {
  id: serial("id").primaryKey(),
  deviceCodeHash: varchar("device_code_hash", { length: 64 }).notNull().unique(),
  userCode: varchar("user_code", { length: 16 }).notNull().unique(),
  hostname: varchar("hostname", { length: 255 }),
  macAddress: varchar("mac_address", { length: 17 }),
  userId: varchar("user_id", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deviceAuthorizationsRelations = relations(deviceAuthorizations, ({ one }) => ({
  user: one(users, {
    fields: [deviceAuthorizations.userId],
    references: [users.id],
  }),
}));

export type DeviceAuthorization = typeof deviceAuthorizations.$inferSelect;

export const insertDeviceAuthorizationSchema = createInsertSchema(deviceAuthorizations).omit({
  id: true,
  createdAt: true,
});

export type InsertDeviceAuthorization = z.infer<typeof insertDeviceAuthorizationSchema>;

// === AGENT TOKENS ===

export const agentTokens = pgTable("agent_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  tokenPrefix: varchar("token_prefix", { length: 8 }).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
  // Agent tracking fields
  approved: boolean("approved").default(false),
  agentUuid: varchar("agent_uuid", { length: 36 }),
  agentMacAddress: varchar("agent_mac_address", { length: 17 }),
  agentHostname: text("agent_hostname"),
  agentIpAddress: text("agent_ip_address"),
  firstConnectedAt: timestamp("first_connected_at"),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  // Pending replacement fields (for when a different agent tries to use this token)
  pendingAgentUuid: varchar("pending_agent_uuid", { length: 36 }),
  pendingAgentMacAddress: varchar("pending_agent_mac_address", { length: 17 }),
  pendingAgentHostname: text("pending_agent_hostname"),
  pendingAgentIpAddress: text("pending_agent_ip_address"),
  pendingAgentAt: timestamp("pending_agent_at"),
});

export const agentTokensRelations = relations(agentTokens, ({ one }) => ({
  user: one(users, {
    fields: [agentTokens.userId],
    references: [users.id],
  }),
}));

// === TABLE DEFINITIONS ===

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  agentTokenId: integer("agent_token_id").references(() => agentTokens.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  macAddress: varchar("mac_address", { length: 17 }),
  status: text("status").notNull().default("offline"),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const deviceNetworkStates = pgTable("device_network_states", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devices.id).unique(), // Unique - one state per device
  ipAddress: text("ip_address"), // Primary IP (backward compatibility)
  adapters: jsonb("adapters").$type<NetworkAdapter[]>(), // Full adapter data from ipconfig /all
  isLastKnown: boolean("is_last_known").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === RELATIONS ===

export const devicesRelations = relations(devices, ({ one, many }) => ({
  user: one(users, {
    fields: [devices.userId],
    references: [users.id],
  }),
  networkState: one(deviceNetworkStates, {
    fields: [devices.id],
    references: [deviceNetworkStates.deviceId],
  }),
}));

export const deviceNetworkStatesRelations = relations(deviceNetworkStates, ({ one }) => ({
  device: one(devices, {
    fields: [deviceNetworkStates.deviceId],
    references: [devices.id],
  }),
}));

// === BASE SCHEMAS ===

export const insertDeviceSchema = createInsertSchema(devices).omit({ 
  id: true, 
  createdAt: true, 
  lastSeenAt: true 
});

export const insertNetworkStateSchema = createInsertSchema(deviceNetworkStates).omit({ 
  id: true, 
  updatedAt: true 
});

// === EXPLICIT API CONTRACT TYPES ===

// Base types
export type Device = typeof devices.$inferSelect;
export type NetworkState = typeof deviceNetworkStates.$inferSelect;

// Response types
export type DeviceResponse = Device;
export type DeviceListResponse = Device[];
export type NetworkStateResponse = NetworkState | null;

// Combined detail response (optional, but useful for detail view)
export interface DeviceDetailResponse extends Device {
  networkState?: NetworkState;
}

// Session type
export interface SessionResponse {
  user?: typeof users.$inferSelect;
  authenticated: boolean;
}

// === AGENT TOKEN TYPES ===

export type AgentToken = typeof agentTokens.$inferSelect;

export const insertAgentTokenSchema = createInsertSchema(agentTokens).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
  approved: true,
  agentUuid: true,
  agentMacAddress: true,
  agentHostname: true,
  agentIpAddress: true,
  firstConnectedAt: true,
  lastHeartbeatAt: true,
  pendingAgentUuid: true,
  pendingAgentMacAddress: true,
  pendingAgentHostname: true,
  pendingAgentIpAddress: true,
  pendingAgentAt: true,
});

export type InsertAgentToken = z.infer<typeof insertAgentTokenSchema>;

export interface AgentTokenResponse {
  id: number;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date | null;
  revokedAt: Date | null;
  // Agent tracking fields
  approved: boolean | null;
  agentUuid: string | null;
  agentMacAddress: string | null;
  agentHostname: string | null;
  agentIpAddress: string | null;
  firstConnectedAt: Date | null;
  lastHeartbeatAt: Date | null;
  // Pending replacement fields
  pendingAgentUuid: string | null;
  pendingAgentMacAddress: string | null;
  pendingAgentHostname: string | null;
  pendingAgentIpAddress: string | null;
  pendingAgentAt: Date | null;
}

export interface AgentTokenCreateResponse extends AgentTokenResponse {
  token: string;
}
