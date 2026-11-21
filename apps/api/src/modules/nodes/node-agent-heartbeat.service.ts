import { prisma } from "@matrixhost/database";
import { AppError } from "@matrixhost/shared";

import type {
  AgentHeartbeatInput,
} from "./node-agent.schemas.js";

export async function updateNodeHeartbeat(
  nodeId: string,
  input: AgentHeartbeatInput
) {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: { id: true },
  });

  if (!node) {
    throw AppError.notFound("Node not found.");
  }

  const updatedNode = await prisma.node.update({
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

      status: "ONLINE",
      lastHeartbeatAt: new Date(),
    },
    select: {
      id: true,
      name: true,
      status: true,
      lastHeartbeatAt: true,
    },
  });

  return updatedNode;
}
