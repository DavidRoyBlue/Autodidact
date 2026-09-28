import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

const errorSpy = vi.fn();
vi.mock('@autodidact/observability', () => ({
  createLogger: () => ({ error: errorSpy }),
}));

import { AllExceptionsFilter } from '../common/filters/http-exception.filter.js';

function makeHost() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const response = { status };
  const request = { url: '/v1/courses', method: 'GET' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => {
    errorSpy.mockClear();
  });

  it('logs an unhandled (non-HttpException) error at error level with the exception and path', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();
    const err = new Error('column "is_onboarding" does not exist');

    filter.catch(err, host);

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err, path: '/v1/courses', method: 'GET' }),
      'Unhandled exception',
    );
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, error: 'Internal server error' }),
    );
  });

  it('does not log an expected HttpException (e.g. 404)', () => {
    const filter = new AllExceptionsFilter();
    const { host, status } = makeHost();

    filter.catch(new NotFoundException('Course not found'), host);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(404);
  });
});
