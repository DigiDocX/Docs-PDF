import { Linking } from 'react-native';
import { SharingModule } from './nativeModules';

/**
 * Multi-level fallback chain for opening PDFs
 * 1. Sharing.shareAsync (primary)
 * 2. Linking.openURL (secondary)
 * 3. Error if none available
 */
export const fallbackOpenWithShare = async (uri) => {
  if (!uri) throw new Error('Invalid file URI');

  // Try sharing module first (most reliable)
  if (SharingModule?.shareAsync) {
    await SharingModule.shareAsync(uri);
    return;
  }

  // Try linking as fallback
  const canOpen = await Linking.canOpenURL(uri);
  if (canOpen) {
    await Linking.openURL(uri);
    return;
  }

  // No opener available
  throw new Error('No PDF opener available in this runtime.');
};
