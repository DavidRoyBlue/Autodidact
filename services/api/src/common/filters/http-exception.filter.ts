import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createLogger } from '@autodidact/observability';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = createLogger('api');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = isHttpException ? exception.getResponse() : 'Internal server error';

    // Unhandled (non-HttpException) errors are otherwise silent — the caller only
    // sees a generic 500. Log the real cause with its stack at error level.
    if (!isHttpException) {
      this.logger.error(
        { err: exception, path: request.url, method: request.method },
        'Unhandled exception',
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: message,
    });
  }
}
