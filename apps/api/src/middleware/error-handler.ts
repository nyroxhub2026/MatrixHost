import type { FastifyInstance } from "fastify";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      {
        requestId: request.id,
        errorName: error.name,
        errorCode: error.code
      },
      "API request failed"
    );

    const statusCode =
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 600
        ? error.statusCode
        : 500;

    const message =
      statusCode >= 500
        ? "An internal server error occurred."
        : error.message;

    void reply.status(statusCode).send({
      error: {
        code: error.code ?? "INTERNAL_SERVER_ERROR",
        message,
        requestId: request.id
      }
    });
  });
}
