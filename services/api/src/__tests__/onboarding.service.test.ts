import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
vi.mock('@autodidact/db', () => ({
  getDb: () => ({ select: mockSelect, update: mockUpdate }),
  users: { id: 'id', onboardedAt: 'onboarded_at' },
  courses: { id: 'id', isOnboarding: 'is_onboarding' },
  eq: (col: unknown, val: unknown) => ({ col, val }),
  sql: (s: unknown) => s,
}));
vi.mock('@autodidact/observability', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { OnboardingService } from '../modules/onboarding/onboarding.service.js';

function selectReturning(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: async () => rows }) }) };
}

describe('OnboardingService.onboardOnce', () => {
  let enrollUser: ReturnType<typeof vi.fn>;
  let service: OnboardingService;

  beforeEach(() => {
    mockSelect.mockReset();
    mockUpdate.mockReset();
    enrollUser = vi.fn().mockResolvedValue(undefined);
    mockUpdate.mockReturnValue({ set: () => ({ where: async () => undefined }) });
    service = new OnboardingService({ enrollUser } as never);
  });

  it('enrolls and stamps onboarded_at on the first request', async () => {
    mockSelect
      .mockReturnValueOnce(selectReturning([{ onboardedAt: null }]))  // user lookup
      .mockReturnValueOnce(selectReturning([{ id: 'course-1' }]));    // onboarding course
    await service.onboardOnce('user-1');
    expect(enrollUser).toHaveBeenCalledWith('user-1', 'course-1');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when already onboarded (onboarded_at set)', async () => {
    mockSelect.mockReturnValueOnce(selectReturning([{ onboardedAt: new Date() }]));
    await service.onboardOnce('user-1');
    expect(enrollUser).not.toHaveBeenCalled();
  });

  it('skips gracefully (no throw, no enroll) when no onboarding course exists', async () => {
    mockSelect
      .mockReturnValueOnce(selectReturning([{ onboardedAt: null }]))
      .mockReturnValueOnce(selectReturning([])); // no onboarding course
    await expect(service.onboardOnce('user-1')).resolves.toBeUndefined();
    expect(enrollUser).not.toHaveBeenCalled();
  });

  it('caches after success — the second call does not hit the DB', async () => {
    mockSelect
      .mockReturnValueOnce(selectReturning([{ onboardedAt: null }]))
      .mockReturnValueOnce(selectReturning([{ id: 'course-1' }]));
    await service.onboardOnce('user-1');
    mockSelect.mockClear();
    await service.onboardOnce('user-1');
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('skips silently when the user is not provisioned (no cache, no enroll)', async () => {
    mockSelect.mockReturnValueOnce(selectReturning([])); // user lookup returns no row
    await expect(service.onboardOnce('ghost')).resolves.toBeUndefined();
    expect(enrollUser).not.toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalledTimes(1); // no course lookup performed
  });
});
