import { Controller, Get } from '@nestjs/common';
import { getPool } from '@autodidact/db';
import { cloudRunAuthHeaders } from '@autodidact/providers';

@Controller('health')
export class HealthController {
  @Get()
  async check() {
    const checks: Record<string, 'ok' | 'error'> = {};

    try {
      await getPool().query('SELECT 1');
      checks['db'] = 'ok';
    } catch {
      checks['db'] = 'error';
    }

    const agentUrl = process.env['AGENT_SERVICE_URL'] ?? 'http://localhost:3001';
    try {
      // Agent is private (Cloud Run IAM); attach an OIDC token so the liveness
      // ping is authorised. No-op header in local dev (http loopback).
      const res = await fetch(`${agentUrl}/health`, {
        headers: await cloudRunAuthHeaders(agentUrl),
      });
      checks['agent'] = res.ok ? 'ok' : 'error';
    } catch {
      checks['agent'] = 'error';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    return {
      status: allOk ? 'ok' : 'degraded',
      services: checks,
    };
  }
}
