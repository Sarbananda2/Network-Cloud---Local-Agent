import { z } from 'zod';
import { devices, deviceNetworkStates, agentTokens } from './schema';

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  notFound: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  auth: {
    session: {
      method: 'GET' as const,
      path: '/api/auth/session',
      responses: {
        200: z.object({
          authenticated: z.boolean(),
          user: z.any().optional(), // Typed more specifically in implementation if needed
        }),
      },
    },
  },
  devices: {
    list: {
      method: 'GET' as const,
      path: '/api/devices',
      responses: {
        200: z.array(z.custom<typeof devices.$inferSelect>()),
        401: errorSchemas.unauthorized,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/devices/:id',
      responses: {
        200: z.custom<typeof devices.$inferSelect>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    getNetworkState: {
      method: 'GET' as const,
      path: '/api/devices/:id/network-state',
      responses: {
        200: z.custom<typeof deviceNetworkStates.$inferSelect>().nullable(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
  },
  agentTokens: {
    list: {
      method: 'GET' as const,
      path: '/api/agent-tokens',
      responses: {
        200: z.array(z.object({
          id: z.number(),
          name: z.string(),
          tokenPrefix: z.string(),
          lastUsedAt: z.date().nullable(),
          createdAt: z.date().nullable(),
          revokedAt: z.date().nullable(),
        })),
        401: errorSchemas.unauthorized,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/agent-tokens',
      body: z.object({
        name: z.string().min(1).max(100),
      }),
      responses: {
        201: z.object({
          id: z.number(),
          name: z.string(),
          tokenPrefix: z.string(),
          token: z.string(),
          createdAt: z.date().nullable(),
        }),
        401: errorSchemas.unauthorized,
      },
    },
    revoke: {
      method: 'DELETE' as const,
      path: '/api/agent-tokens/:id',
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
  },
  agent: {
    registerDevice: {
      method: 'POST' as const,
      path: '/api/agent/devices',
      body: z.object({
        name: z.string().min(1),
        macAddress: z.string().regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/).optional(),
        status: z.enum(['online', 'offline', 'away']).default('online'),
        ipAddress: z.string().ip().optional(),
      }),
      responses: {
        201: z.custom<typeof devices.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    updateDevice: {
      method: 'PATCH' as const,
      path: '/api/agent/devices/:id',
      body: z.object({
        name: z.string().min(1).optional(),
        status: z.enum(['online', 'offline', 'away']).optional(),
        ipAddress: z.string().ip().optional(),
      }),
      responses: {
        200: z.custom<typeof devices.$inferSelect>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    deleteDevice: {
      method: 'DELETE' as const,
      path: '/api/agent/devices/:id',
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    heartbeat: {
      method: 'POST' as const,
      path: '/api/agent/heartbeat',
      responses: {
        200: z.object({
          status: z.literal('ok'),
          serverTime: z.string(),
        }),
        401: errorSchemas.unauthorized,
      },
    },
    syncDevices: {
      method: 'PUT' as const,
      path: '/api/agent/devices/sync',
      body: z.object({
        devices: z.array(z.object({
          name: z.string().min(1),
          macAddress: z.string().regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/).optional(),
          status: z.enum(['online', 'offline', 'away']),
          ipAddress: z.string().ip().optional(),
        })),
      }),
      responses: {
        200: z.object({
          created: z.number(),
          updated: z.number(),
          deleted: z.number(),
        }),
        401: errorSchemas.unauthorized,
      },
    },
  },
};

// ============================================
// HELPER: buildUrl
// ============================================
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

// ============================================
// TYPE HELPERS
// ============================================
export type DeviceResponse = z.infer<typeof api.devices.get.responses[200]>;
export type DeviceListResponse = z.infer<typeof api.devices.list.responses[200]>;
export type NetworkStateResponse = z.infer<typeof api.devices.getNetworkState.responses[200]>;
