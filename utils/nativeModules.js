import { Buffer } from 'buffer';

// Polyfill Buffer at absolute top for pdf-lib
global.Buffer = global.Buffer || Buffer;

let SharingModule = null;
let ConstantsModule = null;
let NativePdf = null;

// Lazy-load Sharing module with guard
try {
  SharingModule = require('expo-sharing');
} catch {
  SharingModule = null;
}

// Lazy-load Constants module with guard
try {
  ConstantsModule = require('expo-constants').default;
} catch {
  ConstantsModule = null;
}

// Detect if running in Expo Go
const isExpoGo =
  ConstantsModule?.executionEnvironment === 'storeClient' ||
  ConstantsModule?.appOwnership === 'expo';

// Try loading native PDF whenever available in runtime.
// If the module is missing (e.g. Expo Go), this gracefully falls back.
try {
  NativePdf = require('react-native-pdf').default;
} catch (err) {
  console.warn('Failed to load react-native-pdf native module:', err.message);
  NativePdf = null;
}

export { SharingModule, ConstantsModule, NativePdf, isExpoGo };
