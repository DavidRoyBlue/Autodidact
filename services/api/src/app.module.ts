import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module.js';
import { QueueModule } from './modules/queue/queue.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { ProgressModule } from './modules/progress/progress.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';

@Module({
  imports: [AuthModule, QueueModule, CoursesModule, ChatModule, ProgressModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
