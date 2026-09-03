import type { Express } from "express";
import type { Server } from "node:http";

export function startServer(app: Express, port: number, onListening?: () => void): Server {
  return app.listen(port, "0.0.0.0", onListening);
}
