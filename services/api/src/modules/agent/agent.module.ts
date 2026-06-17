import { Module } from '@nestjs/common';
import { ApiAgentClient } from '../../services/agent.client.js';

// Single registration of the Agent HTTP client, shared by every module that
// talks to the Agent service (courses, health). Keeps one provider instance and
// one place to override in tests.
@Module({
  providers: [ApiAgentClient],
  exports: [ApiAgentClient],
})
export class AgentModule {}
