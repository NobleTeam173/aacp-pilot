var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var users = /* @__PURE__ */ new Map();
var usersByEmail = /* @__PURE__ */ new Map();
var refreshTokens = /* @__PURE__ */ new Map();
var auditLog = [];
var ACCESS_EXPIRES_SEC = 15 * 60;
var REFRESH_EXPIRES_SEC = 7 * 24 * 60 * 60;
var PBKDF2_ITERATIONS = 1e4;
var MFA_ENFORCED_ROLES = /* @__PURE__ */ new Set(["admin", "coach"]);
function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex, "bytesToHex");
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
__name(hexToBytes, "hexToBytes");
function randomHex(byteLen) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLen)));
}
__name(randomHex, "randomHex");
function base64UrlEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(str) {
  const padded = str.padEnd(str.length + (4 - str.length % 4) % 4, "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
__name(base64UrlDecode, "base64UrlDecode");
async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256
  );
  return `${PBKDF2_ITERATIONS}:${bytesToHex(salt)}:${bytesToHex(bits)}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  const [iters, saltHex, hashHex] = stored.split(":");
  const enc = new TextEncoder();
  const salt = hexToBytes(saltHex);
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: Number(iters) },
    keyMaterial,
    256
  );
  return bytesToHex(bits) === hashHex;
}
__name(verifyPassword, "verifyPassword");
async function importHmacKey(secret, usage) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}
__name(importHmacKey, "importHmacKey");
async function createJwt(payload, secret, expiresInSec) {
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1e3);
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSec })));
  const key = await importHmacKey(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${base64UrlEncode(sig)}`;
}
__name(createJwt, "createJwt");
async function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const key = await importHmacKey(secret, "verify");
  const valid = await crypto.subtle.verify("HMAC", key, base64UrlDecode(signature), new TextEncoder().encode(`${header}.${body}`));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
  if (Math.floor(Date.now() / 1e3) >= payload.exp) return null;
  return payload;
}
__name(verifyJwt, "verifyJwt");
async function generateHotp(secretHex, counter) {
  const key = hexToBytes(secretHex);
  const counterBytes = new Uint8Array(8);
  const hi = Math.floor(counter / 4294967296);
  const lo = counter >>> 0;
  new DataView(counterBytes.buffer).setUint32(0, hi, false);
  new DataView(counterBytes.buffer).setUint32(4, lo, false);
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counterBytes));
  const offset = sig[sig.length - 1] & 15;
  const code = ((sig[offset] & 127) << 24 | sig[offset + 1] << 16 | sig[offset + 2] << 8 | sig[offset + 3]) % 1e6;
  return code.toString().padStart(6, "0");
}
__name(generateHotp, "generateHotp");
async function verifyTotp(secretHex, token) {
  if (!token || token.length !== 6) return false;
  const step = Math.floor(Date.now() / 1e3 / 30);
  for (const delta of [-1, 0, 1]) {
    if (await generateHotp(secretHex, step + delta) === token) return true;
  }
  return false;
}
__name(verifyTotp, "verifyTotp");
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}
__name(json, "json");
function err(message, status = 400) {
  return json({ error: message }, status);
}
__name(err, "err");
async function authenticate(request, env) {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const secret = env.AACP_ACCESS_TOKEN_SECRET ?? "aacp-access-secret";
  return verifyJwt(token, secret);
}
__name(authenticate, "authenticate");
function requireAuth(user) {
  if (!user) return err("Unauthorized", 401);
  return null;
}
__name(requireAuth, "requireAuth");
function requireRole(user, ...roles) {
  const authErr = requireAuth(user);
  if (authErr) return authErr;
  if (!roles.includes(user.role)) return err("Forbidden", 403);
  return null;
}
__name(requireRole, "requireRole");
function audit(action, userId, entityType, details = {}) {
  auditLog.push({ id: randomHex(8), action, userId, entityType, details, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
}
__name(audit, "audit");
async function handleRegister(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password || !body?.name || !body?.role) {
    return err("email, password, name, and role are required");
  }
  const email = body.email.trim().toLowerCase();
  if (usersByEmail.has(email)) return err("Email already registered");
  const role = body.role.trim().toLowerCase();
  if (!["youth", "coach", "employer", "admin"].includes(role)) return err("Invalid role");
  const id = randomHex(16);
  const passwordHash = await hashPassword(body.password);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const user = {
    id,
    email,
    passwordHash,
    name: body.name.trim(),
    role,
    organization: body.organization?.trim(),
    cohortId: body.cohortId,
    mfaEnabled: false,
    mfaSecret: null,
    createdAt: now,
    updatedAt: now
  };
  users.set(id, user);
  usersByEmail.set(email, id);
  audit("register", id, "user");
  return json({ userId: id, role, message: "User registered successfully" }, 201);
}
__name(handleRegister, "handleRegister");
async function handleLogin(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) return err("email and password are required");
  const email = body.email.trim().toLowerCase();
  const uid = usersByEmail.get(email);
  const user = uid ? users.get(uid) : null;
  if (!user || !await verifyPassword(body.password, user.passwordHash)) {
    return err("Invalid credentials", 401);
  }
  const testMode = (env.AACP_AUTH_TEST_MODE ?? "false") === "true";
  const mfaEnforced = MFA_ENFORCED_ROLES.has(user.role);
  if (mfaEnforced && !user.mfaEnabled && !testMode) {
    return json({ userId: user.id, role: user.role, mfaRequired: true, mfaSetupRequired: true, message: "MFA setup required" });
  }
  if (user.mfaEnabled && !testMode) {
    if (!body.otp) return json({ userId: user.id, role: user.role, mfaRequired: true, message: "MFA token required" });
    if (!await verifyTotp(user.mfaSecret, body.otp)) return err("Invalid MFA token", 401);
  }
  const accessSecret = env.AACP_ACCESS_TOKEN_SECRET ?? "aacp-access-secret";
  const refreshSecret = env.AACP_REFRESH_TOKEN_SECRET ?? "aacp-refresh-secret";
  const basePayload = { sub: user.id, email: user.email, role: user.role, cohortId: user.cohortId };
  const accessToken = await createJwt({ ...basePayload, tokenType: "access" }, accessSecret, ACCESS_EXPIRES_SEC);
  const refreshToken = await createJwt({ ...basePayload, tokenType: "refresh" }, refreshSecret, REFRESH_EXPIRES_SEC);
  refreshTokens.set(refreshToken, {
    token: refreshToken,
    userId: user.id,
    expiresAt: Math.floor(Date.now() / 1e3) + REFRESH_EXPIRES_SEC,
    revoked: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  audit("login", user.id, "session");
  return json({ userId: user.id, role: user.role, accessToken, refreshToken, tokenType: "Bearer", message: "Login successful" });
}
__name(handleLogin, "handleLogin");
async function handleRefresh(request, env) {
  const body = await request.json().catch(() => null);
  const token = body?.refreshToken;
  if (!token) return err("refreshToken required");
  const stored = refreshTokens.get(token);
  if (!stored || stored.revoked || stored.expiresAt <= Math.floor(Date.now() / 1e3)) {
    return err("Invalid or expired refresh token", 401);
  }
  const refreshSecret = env.AACP_REFRESH_TOKEN_SECRET ?? "aacp-refresh-secret";
  const payload = await verifyJwt(token, refreshSecret);
  if (!payload || payload.tokenType !== "refresh") return err("Invalid refresh token", 401);
  const user = users.get(payload.sub);
  if (!user) return err("User not found", 401);
  const accessSecret = env.AACP_ACCESS_TOKEN_SECRET ?? "aacp-access-secret";
  const accessToken = await createJwt(
    { sub: user.id, email: user.email, role: user.role, cohortId: user.cohortId, tokenType: "access" },
    accessSecret,
    ACCESS_EXPIRES_SEC
  );
  return json({ userId: user.id, role: user.role, accessToken, refreshToken: token, tokenType: "Bearer" });
}
__name(handleRefresh, "handleRefresh");
async function handleLogout(request) {
  const body = await request.json().catch(() => null);
  const token = body?.refreshToken;
  if (token) {
    const rec = refreshTokens.get(token);
    if (rec) {
      rec.revoked = true;
      refreshTokens.set(token, rec);
    }
  }
  return json({ message: "Logged out" });
}
__name(handleLogout, "handleLogout");
async function handleMfaSetup(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) return err("email and password required");
  const email = body.email.trim().toLowerCase();
  const uid = usersByEmail.get(email);
  const user = uid ? users.get(uid) : null;
  if (!user || !await verifyPassword(body.password, user.passwordHash)) return err("Invalid credentials", 401);
  const secret = randomHex(20);
  user.mfaSecret = secret;
  user.mfaEnabled = false;
  users.set(user.id, user);
  return json({ secret, message: "MFA secret generated. Confirm with a TOTP token." });
}
__name(handleMfaSetup, "handleMfaSetup");
async function handleMfaConfirm(request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password || !body?.token) return err("email, password, and token required");
  const email = body.email.trim().toLowerCase();
  const uid = usersByEmail.get(email);
  const user = uid ? users.get(uid) : null;
  if (!user || !await verifyPassword(body.password, user.passwordHash) || !user.mfaSecret) {
    return err("Invalid credentials or MFA not initiated", 401);
  }
  if (!await verifyTotp(user.mfaSecret, body.token)) return err("Invalid TOTP token");
  user.mfaEnabled = true;
  users.set(user.id, user);
  return json({ success: true, message: "MFA enabled" });
}
__name(handleMfaConfirm, "handleMfaConfirm");
async function handleMfaDisable(request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) return err("email and password required");
  const email = body.email.trim().toLowerCase();
  const uid = usersByEmail.get(email);
  const user = uid ? users.get(uid) : null;
  if (!user || !await verifyPassword(body.password, user.passwordHash)) return err("Invalid credentials", 401);
  user.mfaEnabled = false;
  user.mfaSecret = null;
  users.set(user.id, user);
  return json({ success: true, message: "MFA disabled" });
}
__name(handleMfaDisable, "handleMfaDisable");
function handleDashboardYouth(request, user) {
  const url = new URL(request.url);
  const userId = user.sub ?? url.searchParams.get("userId");
  const cohortId = user.cohortId ?? url.searchParams.get("cohortId");
  return json({
    progress: {
      readinessScore: 68,
      competencyCompleted: 7,
      competencyInProgress: 4,
      competencyPendingReview: 2,
      targetRole: "Aviation Maintenance Technician"
    },
    badges: [{
      badgeId: "badge-vr-safe-operations",
      title: "Safe VR Operations",
      description: "Completed the safe operations virtual simulation review.",
      earnedAt: (/* @__PURE__ */ new Date()).toISOString()
    }],
    nextSteps: [{
      stepId: "step-001",
      title: "Submit evidence for navigation competency",
      description: "Provide evidence for navigation task completion and instrument practice.",
      type: "evidence",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString()
    }],
    metadata: { userId, cohortId, generatedAt: (/* @__PURE__ */ new Date()).toISOString() }
  });
}
__name(handleDashboardYouth, "handleDashboardYouth");
function handleDashboardEmployer(request) {
  const url = new URL(request.url);
  const timeframe = url.searchParams.get("timeframe") ?? "30d";
  const cohortId = url.searchParams.get("cohortId");
  return json({
    summary: { cohortId, participantCount: 50, averageReadiness: 72, readinessBands: { high: 28, medium: 46, low: 26 } },
    readinessTrends: [
      { period: "0d", averageReadiness: 72 },
      { period: "7d", averageReadiness: 70 },
      { period: "14d", averageReadiness: 68 }
    ],
    gapMapByRoleFamily: [{
      roleFamilyId: "rf-aviation-ops",
      roleFamilyName: "Aviation Operations",
      gapScore: 18,
      averageReadiness: 74,
      topCompetencyGaps: [{ competencyId: "comp-001", title: "Flight Procedure Accuracy", gapCount: 8 }]
    }],
    topMatches: [{
      userId: "user-123",
      roleId: "role-jet-tech",
      roleName: "Jet Technician Apprentice",
      matchScore: 82,
      readinessScore: 71,
      keyGaps: ["navigation", "regulatory documentation"],
      status: "recommended"
    }],
    regulatoryFlags: [{ flagType: "training_gap", count: 3, description: "Additional CARs-aligned training required." }],
    recentActivity: [{
      type: "assessment",
      title: "Competency assessment submitted",
      date: (/* @__PURE__ */ new Date()).toISOString(),
      status: "pending"
    }],
    metadata: { generatedAt: (/* @__PURE__ */ new Date()).toISOString(), timeframe }
  });
}
__name(handleDashboardEmployer, "handleDashboardEmployer");
function handleDashboardCoach(request) {
  const url = new URL(request.url);
  const cohortId = url.searchParams.get("cohortId") ?? "cohort-default";
  return json({
    reviewQueue: [{
      assessmentId: "assessment-001",
      userId: "user-001",
      userName: "Ava Pilot",
      competencyTitle: "Emergency Procedures",
      status: "pending",
      submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1e3).toISOString()
    }],
    cohortReadiness: [{
      roleFamilyId: "rf-flight-support",
      roleFamilyName: "Flight Support",
      averageReadiness: 69,
      participantCount: 22
    }],
    participantOverview: [{
      userId: "user-001",
      userName: "Ava Pilot",
      currentScore: 71,
      openItems: 3,
      lastActivity: new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString()
    }],
    regulatoryReviewItems: [{
      itemId: "item-001",
      itemType: "assessment",
      reason: "CARs-aligned evidence required",
      submittedAt: (/* @__PURE__ */ new Date()).toISOString()
    }],
    actionItems: [{
      actionId: "action-001",
      title: "Review navigation evidence",
      description: "Review evidence and certify readiness for the pilot cohort.",
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1e3).toISOString()
    }],
    metadata: { cohortId, generatedAt: (/* @__PURE__ */ new Date()).toISOString() }
  });
}
__name(handleDashboardCoach, "handleDashboardCoach");
function handleAuditLogs(request, user) {
  const guard = requireRole(user, "admin");
  if (guard) return guard;
  const url = new URL(request.url);
  let logs = [...auditLog];
  const userId = url.searchParams.get("userId");
  const action = url.searchParams.get("action");
  const entityType = url.searchParams.get("entityType");
  if (userId) logs = logs.filter((l) => l.userId === userId);
  if (action) logs = logs.filter((l) => l.action === action);
  if (entityType) logs = logs.filter((l) => l.entityType === entityType);
  return json({ logs, total: logs.length });
}
__name(handleAuditLogs, "handleAuditLogs");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (path === "/health") return json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    if (path === "/ping") return new Response("pong");
    if (path === "/app" || path === "/app/") {
      return Response.redirect(new URL("/app.html", request.url).toString(), 301);
    }
    if (path === "/auth/register" && request.method === "POST") return handleRegister(request, env);
    if (path === "/auth/login" && request.method === "POST") return handleLogin(request, env);
    if (path === "/auth/logout" && request.method === "POST") return handleLogout(request);
    if (path === "/auth/refresh" && request.method === "POST") return handleRefresh(request, env);
    if (path === "/auth/mfa/setup" && request.method === "POST") return handleMfaSetup(request, env);
    if (path === "/auth/mfa/confirm" && request.method === "POST") return handleMfaConfirm(request);
    if (path === "/auth/mfa/disable" && request.method === "POST") return handleMfaDisable(request);
    const user = await authenticate(request, env);
    if (path === "/dashboard/youth" && request.method === "GET") {
      const g = requireRole(user, "youth", "admin");
      if (g) return g;
      return handleDashboardYouth(request, user);
    }
    if (path === "/dashboard/employer" && request.method === "GET") {
      const g = requireRole(user, "employer", "admin");
      if (g) return g;
      return handleDashboardEmployer(request);
    }
    if (path === "/dashboard/coach" && request.method === "GET") {
      const g = requireRole(user, "coach", "admin");
      if (g) return g;
      return handleDashboardCoach(request);
    }
    if (path === "/audit/logs" && request.method === "GET") return handleAuditLogs(request, user);
    if (path.startsWith("/privacy") || path.startsWith("/ai") || path.startsWith("/telemetry")) {
      const g = requireAuth(user);
      if (g) return g;
      return json({ message: "Coming soon", path });
    }
    return json({ error: "Not found" }, 404);
  }
};

// ../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-dGEUp4/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-dGEUp4/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
