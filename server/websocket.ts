import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import cookie from "cookie";
import signature from "cookie-signature";
import session from "express-session";
import connectPg from "connect-pg-simple";

interface UserConnection {
  userId: string;
  ws: WebSocket;
  isAlive: boolean;
}

const connections: UserConnection[] = [];

const PING_INTERVAL = 30000; // 30 seconds

function getSessionStore() {
  const pgStore = connectPg(session);
  return new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    tableName: "sessions",
  });
}

async function getUserIdFromSession(req: IncomingMessage): Promise<string | null> {
  const cookies = cookie.parse(req.headers.cookie || "");
  const signedCookie = cookies["connect.sid"];
  
  if (!signedCookie) {
    return null;
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error("[ws] SESSION_SECRET not configured");
    return null;
  }

  const sessionId = signedCookie.startsWith("s:")
    ? signature.unsign(signedCookie.slice(2), sessionSecret)
    : signedCookie;

  if (!sessionId) {
    return null;
  }

  return new Promise((resolve) => {
    const store = getSessionStore();
    store.get(sessionId, (err, sessionData) => {
      if (err || !sessionData) {
        resolve(null);
        return;
      }

      const data = sessionData as Record<string, any>;
      const passport = data.passport as { user?: { claims?: { sub?: string } } } | undefined;
      const userId = passport?.user?.claims?.sub;
      resolve(userId || null);
    });
  });
}

function removeConnection(ws: WebSocket) {
  const index = connections.findIndex((c) => c.ws === ws);
  if (index !== -1) {
    connections.splice(index, 1);
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  // Ping all clients every 30 seconds to keep connections alive
  const pingInterval = setInterval(() => {
    for (const conn of connections) {
      if (!conn.isAlive) {
        // Connection didn't respond to last ping, terminate it
        console.log(`[ws] terminating stale connection for user ${conn.userId}`);
        conn.ws.terminate();
        removeConnection(conn.ws);
        continue;
      }

      // Mark as not alive, will be set back to true on pong
      conn.isAlive = false;
      conn.ws.ping();
    }
  }, PING_INTERVAL);

  wss.on("close", () => {
    clearInterval(pingInterval);
  });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const userId = await getUserIdFromSession(req);

    if (!userId) {
      ws.close(1008, "Unauthorized");
      return;
    }

    const connection: UserConnection = { userId, ws, isAlive: true };
    connections.push(connection);
    console.log(`[ws] user ${userId} connected (${connections.length} total connections)`);

    // Handle pong responses
    ws.on("pong", () => {
      const conn = connections.find((c) => c.ws === ws);
      if (conn) {
        conn.isAlive = true;
      }
    });

    ws.on("close", () => {
      removeConnection(ws);
      console.log(`[ws] user ${userId} disconnected (${connections.length} total connections)`);
    });

    ws.on("error", (err) => {
      console.error(`[ws] error for user ${userId}:`, err.message);
      removeConnection(ws);
    });

    ws.send(JSON.stringify({ type: "connected", userId }));
  });

  return wss;
}

export function notifyUser(userId: string, event: { type: string; payload?: any }) {
  const userConnections = connections.filter((c) => c.userId === userId);
  const message = JSON.stringify(event);

  console.log(`[ws] sending ${event.type} to user ${userId} (${userConnections.length} connections)`);

  for (const conn of userConnections) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(message);
    }
  }
}

export function notifyDeviceUpdate(userId: string) {
  console.log(`[ws] notifying user ${userId} of device update`);
  notifyUser(userId, { type: "devices_updated" });
}
