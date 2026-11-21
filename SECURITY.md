# MatrixHost Security Policy

## Reporting a Vulnerability

Do not publish credentials, private keys, access tokens or sensitive
server information in public issues.

Security vulnerabilities should be reported privately to the
project maintainers.

## Security Requirements

- Never expose the Docker API publicly.
- Never execute customer-provided scripts directly on the host.
- Run Egg installation scripts in isolated containers.
- Validate all file paths.
- Authenticate every node connection.
- Enforce resource limits.
- Keep secrets outside source control.
- Apply role-based permissions.
- Record sensitive administrative actions.

## Supported Security Scope

The security scope includes:

- MatrixHost Panel
- MatrixHost API
- MatrixHost Node Agent
- Docker orchestration
- Authentication and authorization
- File management
- Egg installation
- Backup management
