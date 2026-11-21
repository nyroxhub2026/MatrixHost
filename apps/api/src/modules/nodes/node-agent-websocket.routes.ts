import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "@matrixhost/shared";

import { authenticateNodeAgent } from "./node-agent-auth.service.js";
import { claimNextNodeJob } from "./node-agent-job.service.js";
import {
  acknowledgeNodeJob,
  completeNodeJob,
  extendNodeJobLease,
} from "./node-agent-job-result.service.js";

const paramsSchema = z
  .object({
    nodeId: z.uuid(),
  })
  .strict();

const incomingMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("job_ack"),
      jobId: z.uuid(),
      accepted: z.boolean(),
    })
    .strict(),

  z
    .object({
      type: z.literal("job_result"),
      jobId: z.uuid(),
      success: z.boolean(),
      result: z.record(z.string(), z.unknown()).optional(),
      error: z
        .object({
          code: z.string().min(1).max(100),
          message: z.string().min(1).max(1000),
        })
        .strict()
        .optional(),
    })
    .strict()
    .refine(
      (message) => message.success || message.error !== undefined,
      "Failed jobs must include an error.",
    ),

  z
    .object({
      type: z.literal("pong"),
      timestamp: z.iso.datetime(),
    })
    .strict(),
]);

const MAX_IN_FLIGHT_JOBS = 5;
const JOB_POLL_INTERVAL_MS = 1_000;
const LEASE_RENEW_INTERVAL_MS = 30_000;

function sendJson(
  socket: {
    readyState: number;
    send(data: string): void;
  },
  message: Record<string, unknown>,
): boolean {
  if (socket.readyState !== 1) {
    return false;
  }

  socket.send(JSON.stringify(message));
  return true;
}

export async function nodeAgentWebSocketRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/:nodeId/agent/ws",
    {
      websocket: true,
      preValidation: async (request) => {
        const params = paramsSchema.safeParse(request.params);

        if (!params.success) {
          throw AppError.badRequest("Invalid node ID.");
        }

        const authorization = request.headers.authorization;

        if (
          typeof authorization !== "string" ||
          !authorization.startsWith("Bearer ")
        ) {
          throw AppError.unauthorized(
            "Agent credentials are required.",
          );
        }

        const credential = authorization.slice(7);

        if (!credential) {
          throw AppError.unauthorized(
            "Agent credentials are required.",
          );
        }

        await authenticateNodeAgent(
          params.data.nodeId,
          credential,
        );
      },
    },
    (socket, request) => {
      const params = paramsSchema.parse(request.params);
      const nodeId = params.nodeId;
      const connectionId = randomUUID();

      const inFlightJobs = new Set<string>();

      let closed = false;
      let polling = false;

      request.log.info(
        { nodeId, connectionId },
        "Node Agent WebSocket connected.",
      );

      sendJson(socket, {
        type: "connected",
        nodeId,
        serverTime: new Date().toISOString(),
        protocolVersion: 1,
      });

      async function pollJobs(): Promise<void> {
        if (
          closed ||
          polling ||
          socket.readyState !== 1
        ) {
          return;
        }

        polling = true;

        try {
          while (
            !closed &&
            socket.readyState === 1 &&
            inFlightJobs.size < MAX_IN_FLIGHT_JOBS
          ) {
            const job = await claimNextNodeJob(
              nodeId,
              connectionId,
            );

            if (!job) {
              break;
            }

            inFlightJobs.add(job.id);

            const sent = sendJson(socket, {
              type: "job",
              job,
            });

            if (!sent) {
              break;
            }

            request.log.info(
              {
                nodeId,
                jobId: job.id,
                jobType: job.type,
                attempt: job.attempt,
              },
              "Node job delivered.",
            );
          }
        } catch (error) {
          request.log.error(
            { error, nodeId },
            "Failed to poll Node Agent jobs.",
          );
        } finally {
          polling = false;
        }
      }

      async function renewLeases(): Promise<void> {
        if (closed) {
          return;
        }

        for (const jobId of inFlightJobs) {
          try {
            const renewed = await extendNodeJobLease(
              nodeId,
              connectionId,
              jobId,
            );

            if (!renewed) {
              inFlightJobs.delete(jobId);
            }
          } catch (error) {
            request.log.error(
              { error, nodeId, jobId },
              "Failed to renew Node Agent job lease.",
            );
          }
        }
      }

      async function handleMessage(
        rawMessage: { toString(): string },
      ): Promise<void> {
        let parsedJson: unknown;

        try {
          parsedJson = JSON.parse(rawMessage.toString());
        } catch {
          request.log.warn(
            { nodeId },
            "Node Agent sent invalid JSON.",
          );

          socket.close(1008, "Invalid message.");
          return;
        }

        const parsed =
          incomingMessageSchema.safeParse(parsedJson);

        if (!parsed.success) {
          request.log.warn(
            { nodeId },
            "Node Agent sent an invalid protocol message.",
          );

          socket.close(1008, "Invalid protocol message.");
          return;
        }

        const message = parsed.data;

        try {
          switch (message.type) {
            case "job_ack": {
              if (!inFlightJobs.has(message.jobId)) {
                request.log.warn(
                  {
                    nodeId,
                    jobId: message.jobId,
                  },
                  "Received ACK for an unknown job.",
                );
                return;
              }

              const acknowledged = await acknowledgeNodeJob(
                nodeId,
                connectionId,
                message.jobId,
                message.accepted,
              );

              if (!acknowledged) {
                inFlightJobs.delete(message.jobId);
                return;
              }

              if (!message.accepted) {
                inFlightJobs.delete(message.jobId);
              }

              request.log.info(
                {
                  nodeId,
                  jobId: message.jobId,
                  accepted: message.accepted,
                },
                "Node Agent job acknowledgement received.",
              );

              void pollJobs();
              return;
            }

            case "job_result": {
              if (!inFlightJobs.has(message.jobId)) {
                request.log.warn(
                  {
                    nodeId,
                    jobId: message.jobId,
                  },
                  "Received result for an unknown job.",
                );
                return;
              }

              const completed = await completeNodeJob(
                nodeId,
                connectionId,
                message.jobId,
                {
                  success: message.success,
                  result: message.result,
                  error: message.error,
                },
              );

              inFlightJobs.delete(message.jobId);

              request.log.info(
                {
                  nodeId,
                  jobId: message.jobId,
                  success: message.success,
                  accepted: completed,
                },
                "Node Agent job result received.",
              );

              void pollJobs();
              return;
            }

            case "pong": {
              request.log.debug(
                { nodeId },
                "Node Agent pong received.",
              );
              return;
            }
          }
        } catch (error) {
          request.log.error(
            {
              error,
              nodeId,
              messageType: message.type,
            },
            "Failed to process Node Agent message.",
          );
        }
      }

      const pollTimer = setInterval(() => {
        void pollJobs();
      }, JOB_POLL_INTERVAL_MS);

      const leaseTimer = setInterval(() => {
        void renewLeases();
      }, LEASE_RENEW_INTERVAL_MS);

      socket.on("message", (rawMessage) => {
        void handleMessage(rawMessage);
      });

      socket.on("error", (error) => {
        request.log.error(
          { error, nodeId },
          "Node Agent WebSocket error.",
        );
      });

      socket.on("close", () => {
        closed = true;

        clearInterval(pollTimer);
        clearInterval(leaseTimer);

        inFlightJobs.clear();

        request.log.info(
          { nodeId, connectionId },
          "Node Agent WebSocket disconnected.",
        );
      });

      void pollJobs();
    },
  );
}
