import { Injectable, type NestInterceptor, type ExecutionContext, type CallHandler } from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Request } from 'express';
import type { AuthUser } from '@autodidact/types';
import { createLogger } from '@autodidact/observability';
import { OnboardingService } from './onboarding.service.js';

@Injectable()
export class OnboardingInterceptor implements NestInterceptor {
  private readonly logger = createLogger('onboarding');

  constructor(private readonly onboarding: OnboardingService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const userId = request.user?.id;
    if (userId) {
      try {
        // Awaited so the onboarding course is present in the SAME first GET /courses response.
        await this.onboarding.onboardOnce(userId);
      } catch (err) {
        // Never block the request on onboarding (spec D5).
        this.logger.error({ err, userId }, 'Auto-enroll onboarding hook failed; continuing request');
      }
    }
    return next.handle();
  }
}
