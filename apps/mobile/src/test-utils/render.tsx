import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';

/** Render a component tree. NativeWind resolves classes via the babel transform — no provider required. */
export function renderWithProviders(ui: ReactElement) {
  return render(ui);
}
