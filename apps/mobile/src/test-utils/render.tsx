import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
import { TamaguiProvider } from 'tamagui';
import config from '../design/config';

/** Render a component tree wrapped in the app's TamaguiProvider (dark theme). */
export function renderWithProviders(ui: ReactElement) {
  return render(
    <TamaguiProvider config={config} defaultTheme="dark">
      {ui}
    </TamaguiProvider>,
  );
}
