import type { FastifyInstance } from "fastify";

import { AppError } from "@matrixhost/shared";

export function registerErrorHandler(
  app: FastifyInstance
): void {
  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      {
        requestId: request.id,
        errorName: error.name,
        errorCode: error.code,
      },
      "API request failed"
    );

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
        },
      });
    }

    const statusCode =
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 500
        ? error.statusCode
        : 500;

    const isServerError = statusCode >= 500;

    const message = isServerError
      ? "An internal server error occurred."
      : error.message;

    const code = isServerError
      ? "INTERNAL_SERVER_ERROR"
      : error.statusCode === 413
        ? "PAYLOAD_TOO_LARGE"
        : error.statusCode === 429
          ? "RATE_LIMIT_EXCEEDED"
          : "REQUEST_ERROR";

    return reply.status(statusCode).send({
      success: false,
      error: {
        code,
        message,
        requestId: request.id,
      },
    });
  });
}
