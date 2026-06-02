import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CoursesService } from './courses.service.js';
import { CreateCourseRequestSchema } from '@autodidact/schemas';
import type { CreateCourseRequest } from '@autodidact/schemas';
import type { AuthUser } from '@autodidact/types';

@Controller('courses')
@UseGuards(AuthGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateCourseRequestSchema)) dto: CreateCourseRequest,
    @CurrentUser() user: AuthUser,
  ) {
    // The pipe is scoped to @Body — a method-level @UsePipes would also run the
    // course schema against the @CurrentUser() arg, rejecting every request.
    return this.coursesService.createOrReuse(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.coursesService.getUserCourses(user.id);
  }

  @Get('status/:jobId')
  status(@Param('jobId') jobId: string) {
    return this.coursesService.getJobStatus(jobId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.coursesService.getCourseWithModules(id);
  }

  @Post(':id/enroll')
  enroll(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.coursesService.enrollUser(user.id, id);
  }
}
