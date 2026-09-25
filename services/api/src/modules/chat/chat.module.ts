import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ProgressModule } from '../progress/progress.module.js';
import { AgentModule } from '../agent/agent.module.js';
import { ApiPlatformClient } from '../../services/agent-platform.client.js';

@Module({
  imports: [ProgressModule, AgentModule],
  controllers: [ChatController],
  providers: [ChatService, ApiPlatformClient],
})
export class ChatModule {}
