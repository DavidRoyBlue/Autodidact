import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { ApiAgentClient } from '../../services/agent.client.js';
import { AgentModule } from '../agent/agent.module.js';
import { QUEUE_PROVIDER_TOKEN } from '../../providers.token.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';

@Module({
  imports: [AgentModule],
  controllers: [CoursesController],
  providers: [
    {
      provide: CoursesService,
      useFactory: (agentClient: ApiAgentClient, queueProvider: ConstructorParameters<typeof CoursesService>[1], provisioning: ProvisioningService) =>
        new CoursesService(agentClient, queueProvider, provisioning),
      inject: [ApiAgentClient, QUEUE_PROVIDER_TOKEN, ProvisioningService],
    },
  ],
  exports: [CoursesService],
})
export class CoursesModule {}
