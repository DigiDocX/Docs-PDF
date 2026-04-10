import 'react-native-get-random-values';
import * as ExpoCrypto from 'expo-crypto';

// Ensure both global and globalThis expose the same crypto object.
if (typeof globalThis.crypto !== 'object') {
  globalThis.crypto = {};
}

if (typeof global !== 'undefined' && typeof global.crypto !== 'object') {
  global.crypto = globalThis.crypto;
}

if (typeof globalThis.crypto.getRandomValues !== 'function' && typeof ExpoCrypto.getRandomValues === 'function') {
  globalThis.crypto.getRandomValues = (typedArray) => ExpoCrypto.getRandomValues(typedArray);
}

if (typeof global !== 'undefined' && typeof global.crypto?.getRandomValues !== 'function' && typeof globalThis.crypto.getRandomValues === 'function') {
  global.crypto.getRandomValues = globalThis.crypto.getRandomValues;
}
