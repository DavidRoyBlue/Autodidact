import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ChatService } from './chat.service.js';
import { SendMessageSchema, CreateChatSessionSchema } from '@autodidact/schemas';
import type { SendMessage, CreateChatSession } from '@autodidact/schemas';
import type { AuthUser } from '@autodidact/types';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  private readonly agentUrl: string;

  constructor(private readonly chatService: ChatService) {
    this.agentUrl = process.env['AGENT_SERVICE_URL'] ?? 'http://localhost:3001';
  }

  @Post('sessions')
  createSession(@Body(new ZodValidationPipe(CreateChatSessionSchema)) dto: CreateChatSession, @CurrentUser() user: AuthUser) {
    return this.chatService.createSession(user.id, dto.moduleId, dto.moduleId);
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.chatService.getSession(id);
  }

  // POST (not @Sse, which is GET-only) because the client sends the message in
  // the body via @microsoft/fetch-event-source. SSE needs raw response control,
  // so we stream the service Observable to the response with @Res().
  @Post('sessions/:id/stream')
  async stream(
    @Param('id') sessionId: string,
    @Body(new ZodValidationPipe(SendMessageSchema)) dto: SendMessage,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const stream$ = this.chatService.streamMessage(sessionId, user.id, dto.content, this.agentUrl);
    await new Promise<void>((resolve) => {
      const subscription = stream$.subscribe({
        next: (event) => {
          const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
          res.write(`data: ${data}\n\n`);
        },
        error: (err: unknown) => {
          res.write(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`);
          res.end();
          resolve();
        },
        complete: () => {
          res.end();
          resolve();
        },
      });
      res.on('close', () => {
        subscription.unsubscribe();
        resolve();
      });
    });
  }
}
