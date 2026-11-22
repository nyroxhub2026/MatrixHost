# MatrixHost Node Agent

The Node Agent is the trusted node-side worker for MatrixHost. It reports node hardware, authenticates to the API, receives leased jobs over WebSocket, and performs Docker operations locally.

## Runtime requirements

- Linux host with Node.js 22 or newer.
- Docker Engine reachable through the configured Docker CLI.
- HTTPS API endpoint in production.
- A unique node UUID and a credential generated for that node by the MatrixHost API.
- Docker storage driver support for per-container writable-layer quotas through `--storage-opt size=...`. Docker must reject creation if the backing filesystem cannot enforce the requested quota; the Agent does not silently fall back to unlimited storage.
- A dedicated storage filesystem/path for the Docker data root is recommended. Set `AGENT_STORAGE_PATH` to the Docker data root (normally `/var/lib/docker`) so reported disk capacity describes the filesystem actually used by server containers.

## Agent environment

The Agent reads these variables from its process environment:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ID` | Yes | — | UUID of the registered node |
| `API_BASE_URL` | Yes | — | API origin, without query or fragment |
| `AGENT_TOKEN` | Yes | — | Node-specific credential |
| `AGENT_VERSION` | No | `1.0.0` | Agent version reported to API |
| `HEARTBEAT_INTERVAL_MS` | No | `15000` | Hardware heartbeat interval |
| `RECONNECT_INTERVAL_MS` | No | `5000` | Initial WebSocket reconnect delay |
| `LOG_LEVEL` | No | `info` | Agent log level setting |
| `NODE_ENV` | No | `production` | Production requires HTTPS |
| `AGENT_STORAGE_PATH` | No | `/` | Filesystem used for node disk reporting |

## Docker environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DOCKER_BINARY` | No | `docker` | Docker CLI path |
| `DOCKER_COMMAND_TIMEOUT_MS` | No | `30000` | Maximum Docker command duration |
| `DOCKER_MAX_BUFFER_BYTES` | No | `1048576` | Maximum Docker CLI output |
| `DOCKER_REQUIRE_AVAILABLE` | No | `false` | Fail Agent startup when Docker is unavailable |
| `DOCKER_DEFAULT_PIDS_LIMIT` | No | `512` | Default process limit per server |
| `DOCKER_ALLOWED_IMAGE_PREFIXES` | No | `ghcr.io/pterodactyl/yolks:` | Comma-separated trusted image prefixes |
| `DOCKER_MANAGED_LABEL` | No | `matrixhost.managed` | Label used to identify Agent-owned resources |

Only configure image prefixes controlled by administrators. An image matching an allowed prefix is still executable code and must be trusted.

## Implemented job behavior

- `CREATE_SERVER`: validates the payload, checks the trusted image prefix, creates a dedicated bridge network, applies CPU/memory/swap/PID and writable-layer disk limits, publishes the primary allocation, and creates the container with the requested startup command. Creation is idempotent across Agent reconnects by using a configuration fingerprint.
- Eggs that require installation scripts are rejected for now. The isolated installer-container runner is not implemented yet; the API will not silently skip an Egg install script or execute it on the host.
- `START_SERVER`, `STOP_SERVER`, `RESTART_SERVER`, `KILL_SERVER`: verify MatrixHost ownership labels before running the Docker operation.
- Job acknowledgements are sent before execution begins. Results are cached in memory for reconnect retries while the Agent process remains running.
- Heartbeats include a bounded inventory of managed containers. The API reconciles server status only when the Agent marks the inventory complete; missing managed containers are marked as errors.
- Docker CLI calls use argument arrays with shell execution disabled. Customer startup commands are passed as container arguments; they are not executed by a host shell.

## Storage and deletion behavior

Server data currently lives in each container's quota-limited writable layer. The quota is enforced by Docker's storage driver; if Docker cannot apply the requested size, server creation fails rather than running without a disk limit. Images that declare Docker volumes are rejected because volume storage would bypass the writable-layer quota.

Installer output is copied through a bounded tar stream and is checked against the server disk limit. The actual Docker storage-driver quota still must be verified on the target VPS. Containers retain their writable layer across stop/start/restart. The Agent intentionally does **not** implement server deletion yet: safe deletion requires backup verification, retention policy checks, and a durable recovery path. Do not manually remove MatrixHost server containers if their data is needed.

## Build and checks

From the repository root:

```bash
pnpm install
pnpm --filter @matrixhost/node-agent typecheck
pnpm --filter @matrixhost/node-agent test
pnpm --filter @matrixhost/node-agent build
```

The Agent must be installed as a dedicated service on the node. Do not expose the Docker socket to the public network or to the Panel/API process. Access to the Docker daemon is highly privileged and should be granted only to the Agent service account.
