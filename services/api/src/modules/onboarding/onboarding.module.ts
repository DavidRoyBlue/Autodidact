import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module.js';
import { OnboardingService } from './onboarding.service.js';

@Module({
  imports: [CoursesModule],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
