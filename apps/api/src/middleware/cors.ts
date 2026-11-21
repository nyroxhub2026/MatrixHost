import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../config/index.js";

export async function registerCors(
  app: FastifyInstance,
  config: AppConfig
): Promise<void> {
  await app.register(cors, {
    origin: config.PANEL_URL,
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

    maxAge: 600,
  });
}
