import { renderHook } from '@testing-library/react-native';

// jest.mock factories may only reference variables prefixed with `mock`.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockUseJobStatus = jest.fn();
jest.mock('../../api/courses', () => ({
  useJobStatus: (jobId: string | null) => mockUseJobStatus(jobId),
}));

import { useCourseGeneration } from '../useCourseGeneration';

describe('useCourseGeneration', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockUseJobStatus.mockReset();
  });

  it('reports isGenerating while the job is active/waiting', () => {
    mockUseJobStatus.mockReturnValue({ data: { status: 'active' } });
    const { result } = renderHook(() => useCourseGeneration('course-1', 'job-1'));
    expect(result.current.isGenerating).toBe(true);
    expect(result.current.failed).toBe(false);
    expect(result.current.status).toBe('active');
  });

  it('flags failure on a failed job', () => {
    mockUseJobStatus.mockReturnValue({ data: { status: 'failed' } });
    const { result } = renderHook(() => useCourseGeneration('course-1', 'job-1'));
    expect(result.current.failed).toBe(true);
    expect(result.current.isGenerating).toBe(false);
  });

  it('navigates to the course on completion', () => {
    mockUseJobStatus.mockReturnValue({ data: { status: 'completed' } });
    renderHook(() => useCourseGeneration('course-9', 'job-1'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/courses/course-9');
  });

  it('does not navigate when completed but courseId is null', () => {
    mockUseJobStatus.mockReturnValue({ data: { status: 'completed' } });
    renderHook(() => useCourseGeneration(null, 'job-1'));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('returns a null status when there is no job data', () => {
    mockUseJobStatus.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useCourseGeneration('c', null));
    expect(result.current.status).toBeNull();
    expect(result.current.isGenerating).toBe(false);
  });
});
