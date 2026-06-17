import { Controller, Get } from '@nestjs/common';
import { getPool } from '@autodidact/db';
import { ApiAgentClient } from '../../services/agent.client.js';

@Controller('health')
export class HealthController {
  constructor(private readonly agent: ApiAgentClient) {}

  @Get()
  async check() {
    const checks: Record<string, 'ok' | 'error'> = {};

    try {
      await getPool().query('SELECT 1');
      checks['db'] = 'ok';
    } catch {
      checks['db'] = 'error';
    }

    // Probe via ApiAgentClient (the sanctioned agent caller); it attaches the
    // OIDC token and never throws. The catch also covers a malformed client.
    try {
      checks['agent'] = (await this.agent.isAgentHealthy()) ? 'ok' : 'error';
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
