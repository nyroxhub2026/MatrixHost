import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

import type {
  AgentHeartbeatInput,
} from "./node-agent.schemas.js";

function getServerStatus(
  containerStatus: AgentHeartbeatInput["servers"][number]["status"],
): "RUNNING" | "STARTING" | "OFFLINE" | "ERROR" | "SUSPENDED" | null {
  switch (containerStatus) {
    case "running":
      return "RUNNING";
    case "restarting":
      return "STARTING";
    case "created":
    case "exited":
    case "removing":
      return "OFFLINE";
    case "paused":
      return "SUSPENDED";
    case "dead":
      return "ERROR";
    default:
      return null;
  }
}

export async function updateNodeHeartbeat(
  nodeId: string,
  input: AgentHeartbeatInput
) {
  return prisma.$transaction(async (transaction) => {
    const node = await transaction.node.findUnique({
      where: { id: nodeId },
      select: { id: true },
    });

    if (!node) {
      throw AppError.notFound("Node not found.");
    }

    const updatedNode = await transaction.node.update({
      where: { id: nodeId },
      data: {
        hostname: input.hostname,
        operatingSystem: input.operatingSystem,
        architecture: input.architecture,

        cpuModel: input.cpuModel,
        cpuCores: input.cpuCores,

        memoryTotalBytes: BigInt(input.memoryTotalBytes),
        memoryFreeBytes: BigInt(input.memoryFreeBytes),

        swapTotalBytes: BigInt(input.swapTotalBytes),
        swapFreeBytes: BigInt(input.swapFreeBytes),

        diskTotalBytes: BigInt(input.diskTotalBytes),
        diskFreeBytes: BigInt(input.diskFreeBytes),

        agentVersion: input.agentVersion,
        dockerVersion: input.dockerVersion,

        status:
          input.dockerVersion === "unavailable"
            ? "ERROR"
            : "ONLINE",
        lastHeartbeatAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        status: true,
        lastHeartbeatAt: true,
      },
    });

    if (input.dockerVersion !== "unavailable") {
      for (const server of input.servers) {
        const status = getServerStatus(server.status);

        if (!status) {
          continue;
        }

        await transaction.server.updateMany({
          where: {
            id: server.serverId,
            nodeId,
            containerId: server.containerId,
            status: {
              notIn: ["INSTALLING", "SUSPENDED", "ERROR", "RESTORING"],
            },
          },
          data: {
            status,
          },
        });
      }

      if (input.serverInventoryComplete) {
        const knownServers = await transaction.server.findMany({
          where: {
            nodeId,
            containerId: {
              not: null,
            },
            status: {
              notIn: ["INSTALLING", "SUSPENDED", "ERROR"],
            },
          },
          select: {
            id: true,
          },
        });

        const reportedServerIds = new Set(
          input.servers.map((server) => server.serverId),
        );

        const missingServerIds = knownServers
          .filter((server) => !reportedServerIds.has(server.id))
          .map((server) => server.id);

        if (missingServerIds.length > 0) {
          await transaction.server.updateMany({
            where: {
              id: {
                in: missingServerIds,
              },
              nodeId,
              status: {
                notIn: ["INSTALLING", "SUSPENDED", "ERROR"],
              },
            },
            data: {
              status: "ERROR",
            },
          });
        }
      }
    }

    return updatedNode;
  });
}
