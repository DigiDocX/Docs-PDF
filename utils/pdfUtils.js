import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument } from 'pdf-lib';
import { Buffer } from 'buffer';

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

/**
 * Manage PDF pages: add or insert blank A4 pages
 *
 * @param {string} existingPath - Full file system path to the PDF file
 * @param {string} action - 'ADD_END' to append or 'INSERT_AT' to insert at index
 * @param {number} index - 0-based page index (required for 'INSERT_AT', ignored for 'ADD_END')
 * @returns {Promise<number>} Timestamp (version key) to trigger re-render, or 0 on error
 *
 * @example
 * // Add a blank page to the end
 * const version = await managePdfPages(pdfPath, 'ADD_END');
 *
 * // Insert a blank page at index 1 (between page 1 and 2)
 * const version = await managePdfPages(pdfPath, 'INSERT_AT', 1);
 */
export const managePdfPages = async (existingPath, action, index = 0) => {
  try {
    if (!existingPath) {
      throw new Error('PDF path is required');
    }

    if (!['ADD_END', 'INSERT_AT'].includes(action)) {
      throw new Error("Action must be 'ADD_END' or 'INSERT_AT'");
    }

    // A4 dimensions in points (595 x 842)
    const A4_WIDTH = 595;
    const A4_HEIGHT = 842;

    // Read PDF file as Base64
    const base64Data = await FileSystem.readAsStringAsync(existingPath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert Base64 to Uint8Array for pdf-lib
    const binaryString = Buffer.from(base64Data, 'base64').toString('binary');
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Load the PDF document
    const pdfDoc = await PDFDocument.load(bytes);

    // Perform the requested action
    if (action === 'ADD_END') {
      pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    } else if (action === 'INSERT_AT') {
      const pageCount = pdfDoc.getPageCount();
      const safeIndex = Math.max(0, Math.min(index, pageCount));
      pdfDoc.insertPage(safeIndex, [A4_WIDTH, A4_HEIGHT]);
    }

    // Save the modified PDF back to file system
    const pdfBytes = await pdfDoc.save();
    const modifiedBase64 = Buffer.from(pdfBytes).toString('base64');

    await FileSystem.writeAsStringAsync(existingPath, modifiedBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Return current timestamp as a version key for re-render triggers
    return Date.now();
  } catch (error) {
    console.error('Error managing PDF pages:', error);
    throw error;
  }
};
