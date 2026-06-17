import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { ApiAgentClient } from '../../services/agent.client.js';
import { AgentModule } from '../agent/agent.module.js';
import { QUEUE_PROVIDER_TOKEN } from '../../providers.token.js';

@Module({
  imports: [AgentModule],
  controllers: [CoursesController],
  providers: [
    {
      provide: CoursesService,
      useFactory: (agentClient: ApiAgentClient, queueProvider: ConstructorParameters<typeof CoursesService>[1]) =>
        new CoursesService(agentClient, queueProvider),
      inject: [ApiAgentClient, QUEUE_PROVIDER_TOKEN],
    },
  ],
  exports: [CoursesService],
})
export class CoursesModule {}
