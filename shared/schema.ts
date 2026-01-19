import { pgTable, text, serial, timestamp, boolean, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { users } from "./models/auth";

// Export everything from auth model (users AND sessions tables)
export * from "./models/auth";

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
  name: text("name").notNull(),
  macAddress: varchar("mac_address", { length: 17 }),
  status: text("status").notNull().default("offline"),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const deviceNetworkStates = pgTable("device_network_states", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devices.id).unique(), // Unique - one state per device
  ipAddress: text("ip_address"),
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
});

export type InsertAgentToken = z.infer<typeof insertAgentTokenSchema>;

export interface AgentTokenResponse {
  id: number;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date | null;
  revokedAt: Date | null;
}

export interface AgentTokenCreateResponse extends AgentTokenResponse {
  token: string;
}
