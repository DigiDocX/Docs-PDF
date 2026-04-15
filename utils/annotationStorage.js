/**
 * Annotation Storage Utility
 * 
 * Stores annotations as a JSON sidecar file alongside each PDF.
 * This keeps annotations as editable objects (like Samsung Notes / Apple Pencil)
 * so they can be erased/modified even after closing and reopening the PDF.
 * 
 * Storage location: {documentDirectory}annotations/{hash}.json
 * The hash is derived from the PDF URI to create a stable filename.
 */
import * as FileSystem from 'expo-file-system/legacy';

const ANNOTATIONS_DIR = `${FileSystem.documentDirectory}annotations/`;

/**
 * Create a stable hash key from a PDF URI.
 * We use the filename + a simple hash of the full path to avoid collisions.
 */
function getAnnotationKey(pdfUri) {
  if (!pdfUri) return null;
  // Strip file:// prefix and query params for a stable key
  const cleanUri = pdfUri.replace(/^file:\/\//, '').split('?')[0];
  // Simple hash: sum of char codes modulo a large prime
  let hash = 0;
  for (let i = 0; i < cleanUri.length; i++) {
    hash = ((hash << 5) - hash + cleanUri.charCodeAt(i)) | 0;
  }
  const hashStr = Math.abs(hash).toString(36);
  // Also use the base filename for readability
  const parts = cleanUri.split('/');
  const baseName = (parts[parts.length - 1] || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${baseName}_${hashStr}`;
}

/**
 * Get the path to the annotation JSON file for a given PDF.
 */
function getAnnotationPath(pdfUri) {
  const key = getAnnotationKey(pdfUri);
  if (!key) return null;
  return `${ANNOTATIONS_DIR}${key}.json`;
}

/**
 * Ensure the annotations directory exists.
 */
async function ensureDir() {
  const info = await FileSystem.getInfoAsync(ANNOTATIONS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ANNOTATIONS_DIR, { intermediates: true });
  }
}

/**
 * Load annotations for a given PDF URI.
 * Returns { paths: [], textAnnotations: [] } or null if no annotations exist.
 */
export async function loadAnnotations(pdfUri) {
  try {
    const filePath = getAnnotationPath(pdfUri);
    if (!filePath) return null;

    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) return null;

    const content = await FileSystem.readAsStringAsync(filePath);
    const data = JSON.parse(content);

    return {
      paths: Array.isArray(data.paths) ? data.paths : [],
      textAnnotations: Array.isArray(data.textAnnotations) ? data.textAnnotations : [],
    };
  } catch (err) {
    console.warn('Failed to load annotations:', err?.message);
    return null;
  }
}

/**
 * Save annotations for a given PDF URI.
 * Writes the full paths + textAnnotations arrays as JSON.
 */
export async function saveAnnotationData(pdfUri, paths, textAnnotations) {
  try {
    const filePath = getAnnotationPath(pdfUri);
    if (!filePath) return false;

    await ensureDir();

    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      pdfUri,
      paths: paths || [],
      textAnnotations: textAnnotations || [],
    };

    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('Failed to save annotations:', err?.message);
    return false;
  }
}

/**
 * Delete annotations for a given PDF URI.
 */
export async function deleteAnnotations(pdfUri) {
  try {
    const filePath = getAnnotationPath(pdfUri);
    if (!filePath) return;

    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists) {
      await FileSystem.deleteAsync(filePath, { idempotent: true });
    }
  } catch (err) {
    console.warn('Failed to delete annotations:', err?.message);
  }
}
