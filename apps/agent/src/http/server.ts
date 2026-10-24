import { RULES_VERSION } from '@pending/machine';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Env } from '../env';
import { buildRoute } from './build';
import type { BuildRoute, RouteLimits } from './build';
import { config } from './config';
import { LIMITS, identity, limiter } from './limits';
import { BASE_HEADERS, json } from './reply';

export type AgentDeps = Pick<BuildRoute, 'model' | 'system' | 'promptVersion' | 'infer'> & {
  env: Env;
  now?: () => Date;
  limits?: Partial<RouteLimits>;
};

export function healthz(): { ok: true; rulesVersion: typeof RULES_VERSION } {
  return { ok: true, rulesVersion: RULES_VERSION };
}

// The local installation's routes (ARCHITECTURE section 4); the public static site calls none of them.
export function agentServer(deps: AgentDeps): Server {
  const { env } = deps;
  // SECURITY-AND-FAILURE-CONTRACT section 7: one allowed origin from WEB_ORIGIN, no wildcard, no credentials.
  const allowed = new URL(env.WEB_ORIGIN).origin;
  const route: BuildRoute = {
    ...deps,
    origin: allowed,
    admit: limiter(env.MAX_CONCURRENT_BUILDS, LIMITS.buildsPerWindow, LIMITS.windowMs),
    limits: {
      bodyBytes: LIMITS.bodyBytes,
      pingMs: LIMITS.pingMs,
      firstTokenMs: LIMITS.firstTokenMs[env.INFERENCE_MODE],
      callMs: LIMITS.callMs[env.INFERENCE_MODE],
      buildMs: LIMITS.buildMs[env.INFERENCE_MODE],
      ...deps.limits,
    },
    now: deps.now ?? (() => new Date()),
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const path = new URL(req.url ?? '/', 'http://agent').pathname;
    const key = `${req.method ?? ''} ${path}`;
    const cors = req.headers.origin === allowed;
    res.setHeader('vary', 'origin');
    if (cors) {
      res.setHeader('access-control-allow-origin', allowed);
      res.setHeader('access-control-expose-headers', 'x-request-id, retry-after');
    }
    if (req.method === 'OPTIONS') {
      const preflight = {
        'access-control-allow-methods': 'GET, POST',
        'access-control-allow-headers': 'content-type, x-request-id',
        'access-control-max-age': '600',
      };
      return void res
        .writeHead(cors ? 204 : 403, cors ? { ...BASE_HEADERS, ...preflight } : BASE_HEADERS)
        .end();
    }
    if (key === 'GET /healthz') return json(res, 200, healthz());
    if (key === 'GET /api/config') return json(res, 200, config(env, deps.model, req.socket.remoteAddress));
    if (key === 'POST /api/build') return buildRoute(req, res, identity(req, env.IDENTITY_HEADER), route);
    res.writeHead(404, BASE_HEADERS).end();
  }

  return createServer((req, res) => {
    handle(req, res).catch(() => {
      console.error('request failed before a response');
      if (!res.headersSent) res.writeHead(500, BASE_HEADERS);
      res.end();
    });
  });
}
