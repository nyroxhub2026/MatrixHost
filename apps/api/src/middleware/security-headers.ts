import helmet from "@fastify/helmet";
import type { FastifyInstance } from "fastify";

import { appConfig } from "../config/index.js";

export async function registerSecurityHeaders(
  app: FastifyInstance
): Promise<void> {
  const isProduction =
    appConfig.NODE_ENV === "production";

  await app.register(helmet, {
    global: true,

    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },

    crossOriginEmbedderPolicy: false,

    crossOriginResourcePolicy: {
      policy: "same-site",
    },

    referrerPolicy: {
      policy: "no-referrer",
    },

    strictTransportSecurity: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: false,
          preload: false,
        }
      : false,
  });
}
