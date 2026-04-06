/**
 * Ensure file URI has proper file:// protocol
 * Required for react-native-pdf to read from FileSystem.documentDirectory
 */
export const ensureFileUri = (uri) => {
  if (!uri) return uri;
  return uri.startsWith('file://') ? uri : `file://${uri}`;
};

/**
 * Format bytes to human-readable file size
 */
export const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Math.round((bytes / Math.pow(1024, idx)) * 10) / 10} ${units[idx]}`;
};

/**
 * Format date to relative format (Today, Yesterday, or date string)
 */
export const formatDate = (date) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
