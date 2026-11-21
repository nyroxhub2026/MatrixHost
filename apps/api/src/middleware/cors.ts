import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../config/index.js";

export async function registerCors(
  app: FastifyInstance,
  config: AppConfig
): Promise<void> {
  const allowedOrigin = new URL(config.PANEL_URL).origin;

  await app.register(cors, {
    origin: allowedOrigin,

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-ID",
    ],

    exposedHeaders: [
      "X-Request-ID",
    ],

    maxAge: 600,
  });
}
