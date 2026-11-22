import type { FastifyError, FastifyInstance } from "fastify";

import { AppError } from "@matrixhost/shared";

export function registerErrorHandler(
  app: FastifyInstance
): void {
  app.setErrorHandler((error, request, reply) => {
    const fastifyError = error as FastifyError;

    request.log.error(
      {
        requestId: request.id,
        errorName: fastifyError.name,
        errorCode: fastifyError.code,
      },
      "API request failed"
    );

    if (reply.sent) {
      return;
    }

    if (error instanceof AppError) {
      return reply.status(fastifyError.statusCode).send({
        success: false,
        error: {
          code: fastifyError.code,
          message: error.message,
          requestId: request.id,
        },
      });
    }

    const statusCode =
      typeof fastifyError.statusCode === "number" &&
      Number.isInteger(fastifyError.statusCode) &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 500
        ? fastifyError.statusCode
        : 500;

    const isServerError = statusCode >= 500;

    let code = "REQUEST_ERROR";

    if (statusCode === 413) {
      code = "PAYLOAD_TOO_LARGE";
    } else if (statusCode === 429) {
      code = "RATE_LIMIT_EXCEEDED";
    } else if (statusCode === 400) {
      code = "BAD_REQUEST";
    } else if (statusCode === 404) {
      code = "NOT_FOUND";
    } else if (statusCode === 401) {
      code = "UNAUTHORIZED";
    } else if (statusCode === 403) {
      code = "FORBIDDEN";
    } else if (isServerError) {
      code = "INTERNAL_SERVER_ERROR";
    }

    const message = isServerError
      ? "An internal server error occurred."
      : statusCode === 413
        ? "Request payload is too large."
        : statusCode === 429
          ? "Too many requests. Please try again later."
          : statusCode === 400
            ? "Invalid request."
            : statusCode === 404
              ? "Resource not found."
              : statusCode === 401
                ? "Authentication required."
                : statusCode === 403
                  ? "Permission denied."
                  : "Request failed.";

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
