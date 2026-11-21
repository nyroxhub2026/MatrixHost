import helmet from "@fastify/helmet";
import type { FastifyInstance } from "fastify";

export async function registerSecurityHeaders(
  app: FastifyInstance
): Promise<void> {
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

    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
  });
}
