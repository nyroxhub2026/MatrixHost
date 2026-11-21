# MatrixHost

**Independent Game Hosting Platform**

MatrixHost is a custom game hosting management platform with its own
frontend, backend, node agent, Docker orchestration engine and database.

## Main Features

- Custom Customer Panel
- Custom Admin Panel
- Independent REST API
- Multi-node management
- Docker-based game server management
- Real-time WebSocket console
- File manager
- Server resource monitoring
- Backups and restoration
- Scheduled tasks
- Database management
- User permissions and subusers
- Egg JSON import and compatibility engine
- Secure isolated installation environments

## Architecture

MatrixHost consists of:

- `apps/panel` - Customer and Admin web interface.
- `apps/api` - Main backend API.
- `apps/node-agent` - Hosting node management service.
- `packages/database` - Database schema and client.
- `packages/shared` - Shared utilities and validation.
- `packages/types` - Shared TypeScript types.
- `packages/config` - Shared application configuration.
- `packages/egg-engine` - Egg parser and compatibility engine.

## Technology

- Next.js
- React
- TypeScript
- Node.js
- Fastify
- PostgreSQL
- Prisma
- Redis
- BullMQ
- Docker
- WebSocket
- Nginx

## Languages

- English (default)
- Armenian
- Russian
- Arabic

## Security Principles

- No public Docker socket.
- No unrestricted customer host access.
- Authenticated node communication.
- Role-based access control.
- Isolated Egg installation.
- Resource limits for containers.
- Secure file path validation.
- Audit logging.

## Development

Development and deployment documentation will be maintained in `docs/`.

## License

MIT.
