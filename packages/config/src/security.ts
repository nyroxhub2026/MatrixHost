export const SECURITY_CONFIG = {
  password: {
    minLength: 12,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecialCharacter: true
  },

  authentication: {
    accessTokenLifetimeSeconds: 900,
    refreshTokenLifetimeSeconds: 604800,
    maxFailedLoginAttempts: 5,
    loginLockoutSeconds: 900
  },

  rateLimits: {
    global: {
      windowMs: 60000,
      maxRequests: 120
    },
    authentication: {
      windowMs: 60000,
      maxRequests: 10
    },
    serverActions: {
      windowMs: 60000,
      maxRequests: 30
    }
  },

  request: {
    maxBodySizeBytes: 1048576,
    maxJsonDepth: 20
  },

  sessions: {
    secureCookiesInProduction: true,
    httpOnlyCookies: true,
    sameSite: "strict" as const
  },

  nodeAgent: {
    requireTls: true,
    heartbeatIntervalSeconds: 30,
    heartbeatTimeoutSeconds: 90
  }
} as const;

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Resource-Policy": "same-site"
} as const;

export function validatePassword(password: string): boolean {
  const rules = SECURITY_CONFIG.password;

  if (
    password.length < rules.minLength ||
    password.length > rules.maxLength
  ) {
    return false;
  }

  if (rules.requireUppercase && !/[A-Z]/.test(password)) {
    return false;
  }

  if (rules.requireLowercase && !/[a-z]/.test(password)) {
    return false;
  }

  if (rules.requireNumber && !/[0-9]/.test(password)) {
    return false;
  }

  if (
    rules.requireSpecialCharacter &&
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return false;
  }

  return true;
}

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
