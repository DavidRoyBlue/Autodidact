// Adds @testing-library/react-native's jest matchers (toBeOnTheScreen, etc.).
import '@testing-library/react-native/extend-expect';

// The auth store's `persist` middleware writes to expo-secure-store on every set.
// Mock it globally so component/store tests don't hit the native module.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// NativeWind's runtime stylesheet isn't initialized under Jest (no Metro CSS
// pipeline), so `setColorScheme` throws "without using darkMode: class" even
// though tailwind.config sets darkMode:'class'. Stub the hook; only `_layout`
// calls setColorScheme (at real runtime it works — device-verified).
jest.mock('nativewind', () => ({
  ...jest.requireActual('nativewind'),
  useColorScheme: () => ({
    colorScheme: 'dark',
    setColorScheme: jest.fn(),
    toggleColorScheme: jest.fn(),
  }),
}));
