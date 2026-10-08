import { renderHook } from '@testing-library/react-native';

// Each focus of the screen runs the registered effect once.
let mockFocus: () => void = () => {};
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    mockFocus = effect;
  },
}));

import { useRefreshOnFocus } from '../useRefreshOnFocus';

describe('useRefreshOnFocus', () => {
  it('skips the first focus and refetches on every later one', () => {
    const refetch = jest.fn();
    renderHook(() => useRefreshOnFocus(refetch));

    mockFocus();
    expect(refetch).not.toHaveBeenCalled();

    mockFocus();
    mockFocus();
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('calls the latest refetch passed in', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ fn }) => useRefreshOnFocus(fn), { initialProps: { fn: first } });
    mockFocus();
    rerender({ fn: second });
    mockFocus();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
