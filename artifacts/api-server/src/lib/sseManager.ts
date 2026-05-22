import type { Response } from "express";

const driverConnections = new Map<number, Set<Response>>();
const adminConnections = new Set<Response>();

export function registerDriverConnection(driverId: number, res: Response): void {
  if (!driverConnections.has(driverId)) {
    driverConnections.set(driverId, new Set());
  }
  driverConnections.get(driverId)!.add(res);
}

export function unregisterDriverConnection(driverId: number, res: Response): void {
  const set = driverConnections.get(driverId);
  if (set) {
    set.delete(res);
    if (set.size === 0) driverConnections.delete(driverId);
  }
}

export function pushToDriver(driverId: number, event: string, data: unknown): void {
  const connections = driverConnections.get(driverId);
  if (!connections || connections.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of connections) {
    try {
      res.write(payload);
    } catch {
      connections.delete(res);
    }
  }
}

export function registerAdminConnection(res: Response): void {
  adminConnections.add(res);
}

export function unregisterAdminConnection(res: Response): void {
  adminConnections.delete(res);
}

export function broadcastToAdmins(event: string, data: unknown): void {
  if (adminConnections.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of adminConnections) {
    try {
      res.write(payload);
    } catch {
      adminConnections.delete(res);
    }
  }
}

export function getStats() {
  return {
    connectedDrivers: driverConnections.size,
    adminConnections: adminConnections.size,
  };
}
