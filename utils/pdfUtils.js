import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import { Buffer } from 'buffer';

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

const PAGE_NUMBER_POSITIONS = {
  TOP_LEFT: 'TOP_LEFT',
  TOP_CENTER: 'TOP_CENTER',
  TOP_RIGHT: 'TOP_RIGHT',
  BOTTOM_LEFT: 'BOTTOM_LEFT',
  BOTTOM_CENTER: 'BOTTOM_CENTER',
  BOTTOM_RIGHT: 'BOTTOM_RIGHT',
};

const parseHexColor = (hex) => {
  const normalized = String(hex || '').trim().replace('#', '');
  const fallback = rgb(0.2, 0.2, 0.2);

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback;
  }

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const applyPageNumbersToPdfDocument = async (pdfDoc, options = {}) => {
  const pageCount = pdfDoc.getPageCount();
  if (pageCount <= 0) {
    return;
  }

  const {
    startNumber = 1,
    includeTotal = false,
    position = PAGE_NUMBER_POSITIONS.BOTTOM_CENTER,
    fontSize = 11,
    margin = 28,
    color = '#333333',
  } = options;

  const safeStartNumber = Number.isFinite(startNumber)
    ? Math.max(1, Math.floor(startNumber))
    : 1;
  const safeFontSize = Number.isFinite(fontSize)
    ? clamp(fontSize, 8, 32)
    : 11;
  const safeMargin = Number.isFinite(margin)
    ? clamp(margin, 8, 120)
    : 28;
  const safePosition = Object.values(PAGE_NUMBER_POSITIONS).includes(position)
    ? position
    : PAGE_NUMBER_POSITIONS.BOTTOM_CENTER;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const textColor = parseHexColor(color);

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdfDoc.getPage(pageIndex);
    const { width, height } = page.getSize();

    const pageNumberValue = safeStartNumber + pageIndex;
    const label = includeTotal
      ? `${pageNumberValue} / ${safeStartNumber + pageCount - 1}`
      : String(pageNumberValue);

    const textWidth = font.widthOfTextAtSize(label, safeFontSize);
    const textHeight = safeFontSize;

    let x = safeMargin;
    let y = safeMargin;

    if (safePosition.endsWith('CENTER')) {
      x = (width - textWidth) / 2;
    } else if (safePosition.endsWith('RIGHT')) {
      x = width - safeMargin - textWidth;
    }

    if (safePosition.startsWith('TOP')) {
      y = height - safeMargin - textHeight;
    }

    page.drawText(label, {
      x: clamp(x, 0, Math.max(0, width - textWidth)),
      y: clamp(y, 0, Math.max(0, height - textHeight)),
      size: safeFontSize,
      font,
      color: textColor,
    });
  }
};

/**
 * Apply a subtle text watermark to each page.
 * This is used for PDFs created or modified within the app.
 */
export const applyWatermark = async (pdfDoc, options = {}) => {
  if (!pdfDoc || typeof pdfDoc.getPages !== 'function') return;

  const pages = pdfDoc.getPages();
  if (!pages?.length) return;

  const {
    text = 'PDF LIBRARY',
    footerText = 'Created with PDF Library',
    fontSize,
    margin = 18,
    color = rgb(0.12, 0.12, 0.12),
    footerColor = rgb(0.55, 0.58, 0.66),
  } = options;

  let font;
  try {
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  } catch {
    // If font embedding fails for any reason, skip watermark instead of breaking PDF generation.
    return;
  }

  const safeFontSize = Number.isFinite(fontSize) ? clamp(fontSize, 12, 72) : null;
  const safeMargin = clamp(Number.isFinite(margin) ? margin : 18, 8, 80);

  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const watermarkText = String(text || '').trim();
    const footer = String(footerText || '').trim();

    if (watermarkText) {
      const autoSize = clamp(Math.min(width, height) * 0.11, 22, 54);
      const diagonalSize = safeFontSize || autoSize;
      const textWidth = font.widthOfTextAtSize(watermarkText, diagonalSize);

      // Two-pass draw (light + dark) improves contrast across light and dark images.
      page.drawText(watermarkText, {
        x: (width - textWidth) / 2 + 1,
        y: height * 0.48 + 1,
        size: diagonalSize,
        font,
        color: rgb(1, 1, 1),
        rotate: degrees(32),
        opacity: 0.24,
      });

      page.drawText(watermarkText, {
        x: (width - textWidth) / 2,
        y: height * 0.48,
        size: diagonalSize,
        font,
        color,
        rotate: degrees(32),
        opacity: 0.2,
      });
    }

    if (footer) {
      const footerSize = clamp((safeFontSize || 16) * 0.55, 9, 16);
      const footerWidth = font.widthOfTextAtSize(footer, footerSize);
      const footerX = clamp(width - footerWidth - safeMargin, 0, Math.max(0, width - footerWidth));

      page.drawText(footer, {
        x: footerX,
        y: safeMargin,
        size: footerSize,
        font,
        color: footerColor,
        opacity: 0.9,
      });
    }
  });
};

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
 * @param {string} action - 'ADD_END', 'INSERT_AT', or 'APPLY_PAGE_NUMBERS'
 * @param {number|Object} payload - page index for 'INSERT_AT' OR options object for 'APPLY_PAGE_NUMBERS'
 * @returns {Promise<number>} Timestamp (version key) to trigger re-render, or 0 on error
 *
 * @example
 * // Add a blank page to the end
 * const version = await managePdfPages(pdfPath, 'ADD_END');
 *
 * // Insert a blank page at index 1 (between page 1 and 2)
 * const version = await managePdfPages(pdfPath, 'INSERT_AT', 1);
 */
export const managePdfPages = async (existingPath, action, payload = 0) => {
  try {
    if (!existingPath) {
      throw new Error('PDF path is required');
    }

    if (!['ADD_END', 'INSERT_AT', 'APPLY_PAGE_NUMBERS'].includes(action)) {
      throw new Error("Action must be 'ADD_END', 'INSERT_AT', or 'APPLY_PAGE_NUMBERS'");
    }

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
      const requestedIndex = Number.isFinite(payload) ? Math.floor(payload) : 0;
      const safeIndex = Math.max(0, Math.min(requestedIndex, pageCount));
      pdfDoc.insertPage(safeIndex, [A4_WIDTH, A4_HEIGHT]);
    } else if (action === 'APPLY_PAGE_NUMBERS') {
      const options = payload && typeof payload === 'object' ? payload : {};
      await applyPageNumbersToPdfDocument(pdfDoc, options);
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
