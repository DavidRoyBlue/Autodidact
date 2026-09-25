import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ProgressModule } from '../progress/progress.module.js';
import { ApiAgentClient } from '../../services/agent.client.js';
import { ApiPlatformClient } from '../../services/agent-platform.client.js';

@Module({
  imports: [ProgressModule],
  controllers: [ChatController],
  providers: [ChatService, ApiAgentClient, ApiPlatformClient],
})
export class ChatModule {}
