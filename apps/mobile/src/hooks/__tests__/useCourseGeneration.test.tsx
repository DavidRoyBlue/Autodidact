import { renderHook } from '@testing-library/react-native';

// jest.mock factories may only reference variables prefixed with `mock`.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockUseGenerationStatus = jest.fn();
jest.mock('../../api/courses', () => ({
  useGenerationStatus: (courseId: string | null) => mockUseGenerationStatus(courseId),
}));

import { useCourseGeneration } from '../useCourseGeneration';

describe('useCourseGeneration', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockUseGenerationStatus.mockReset();
  });

  it('reports isGenerating while generation is active', () => {
    mockUseGenerationStatus.mockReturnValue({ data: { status: 'active' } });
    const { result } = renderHook(() => useCourseGeneration('course-1'));
    expect(result.current.isGenerating).toBe(true);
    expect(result.current.failed).toBe(false);
    expect(result.current.status).toBe('active');
  });

  it('reports isGenerating while the course is still pending', () => {
    mockUseGenerationStatus.mockReturnValue({ data: { status: 'pending' } });
    const { result } = renderHook(() => useCourseGeneration('course-1'));
    expect(result.current.isGenerating).toBe(true);
  });

  it('flags failure on a failed generation', () => {
    mockUseGenerationStatus.mockReturnValue({ data: { status: 'failed' } });
    const { result } = renderHook(() => useCourseGeneration('course-1'));
    expect(result.current.failed).toBe(true);
    expect(result.current.isGenerating).toBe(false);
  });

  it('navigates to the course on completion', () => {
    mockUseGenerationStatus.mockReturnValue({ data: { status: 'completed' } });
    renderHook(() => useCourseGeneration('course-9'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/courses/course-9');
  });

  it('does not navigate when completed but courseId is null', () => {
    mockUseGenerationStatus.mockReturnValue({ data: { status: 'completed' } });
    renderHook(() => useCourseGeneration(null));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('returns a null status when there is no generation data', () => {
    mockUseGenerationStatus.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useCourseGeneration(null));
    expect(result.current.status).toBeNull();
    expect(result.current.isGenerating).toBe(false);
  });

  it('passes the courseId through to the status query', () => {
    mockUseGenerationStatus.mockReturnValue({ data: undefined });
    renderHook(() => useCourseGeneration('course-42'));
    expect(mockUseGenerationStatus).toHaveBeenCalledWith('course-42');
  });
});
