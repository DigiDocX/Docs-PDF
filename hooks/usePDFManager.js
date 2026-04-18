import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { PDFDocument, degrees } from 'pdf-lib';
import { PDFDocument as SecurePDFDocument } from 'pdf-lib-plus-encrypt';
import { Buffer } from 'buffer';
import JSZip from 'jszip';
import ExpoPdfToImageModule from 'expo-pdf-to-image';
import { applyWatermark, applyPageNumbersToPdfDocument, managePdfPages } from '../utils/pdfUtils';

const OPTIMIZE_SOURCE_MAP = `${FileSystem.documentDirectory}optimize-sources.json`;
const OPTIMIZE_SOURCE_DIR = `${FileSystem.documentDirectory}optimize-sources/`;

const clampQuality = (value) => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.1, Math.min(1, value));
};

const clampScale = (value) => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.4, Math.min(1, value));
};

const toPositiveInt = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const buildNoiseBytes = (size, seedBase = Date.now()) => {
  const total = toPositiveInt(size);
  const bytes = new Uint8Array(total);
  let seed = (seedBase % 2147483647) || 1;

  for (let i = 0; i < total; i += 1) {
    seed = (seed * 48271) % 2147483647;
    bytes[i] = seed & 255;
  }

  return bytes;
};

/**
 * Custom hook for PDF management (CRUD operations)
 * Handles: loading, creating, opening, deleting, renaming PDFs
 */
export const usePDFManager = () => {
  const [selectedImages, setSelectedImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savedPDFs, setSavedPDFs] = useState([]);
  const [renameModal, setRenameModal] = useState(false);
  const [renamingFile, setRenamingFile] = useState(null);
  const [newFileName, setNewFileName] = useState('');
  const [viewerModalVisible, setViewerModalVisible] = useState(false);
  const [activePdf, setActivePdf] = useState(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [pdfVersion, setPdfVersion] = useState(1);
  const [savedZIPs, setSavedZIPs] = useState([]);

  const defaultPageNumberOptions = {
    startNumber: 1,
    includeTotal: false,
    position: 'BOTTOM_CENTER',
    fontSize: 11,
    margin: 28,
    color: '#333333',
  };

  const getOptimizeSourceMap = useCallback(async () => {
    try {
      const info = await FileSystem.getInfoAsync(OPTIMIZE_SOURCE_MAP);
      if (!info.exists) return {};
      const payload = await FileSystem.readAsStringAsync(OPTIMIZE_SOURCE_MAP, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, []);

  const setOptimizeSourceMap = useCallback(async (nextMap) => {
    await FileSystem.writeAsStringAsync(
      OPTIMIZE_SOURCE_MAP,
      JSON.stringify(nextMap),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
  }, []);

  const ensureBackupSource = useCallback(async (pdfItem) => {
    if (!pdfItem?.uri) return null;

    const map = await getOptimizeSourceMap();
    const key = pdfItem.id || pdfItem.name || pdfItem.uri;
    const existingBackup = map[key];

    if (existingBackup) {
      const existingInfo = await FileSystem.getInfoAsync(existingBackup);
      if (existingInfo.exists) {
        return existingBackup;
      }
    }

    const dirInfo = await FileSystem.getInfoAsync(OPTIMIZE_SOURCE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(OPTIMIZE_SOURCE_DIR, { intermediates: true });
    }

    const safeName = (pdfItem.name || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const backupPath = `${OPTIMIZE_SOURCE_DIR}${Date.now()}_${safeName}`;
    await FileSystem.copyAsync({ from: pdfItem.uri, to: backupPath });

    const nextMap = { ...map, [key]: backupPath };
    await setOptimizeSourceMap(nextMap);
    return backupPath;
  }, [getOptimizeSourceMap, setOptimizeSourceMap]);

  const estimateOptimizedPdfSize = useCallback(async (pdfItem, profile = {}) => {
    if (!pdfItem?.uri) {
      return { beforeSize: 0, estimatedAfterSize: 0 };
    }

    const quality = clampQuality(profile.quality ?? 1);
    const scale = clampScale(profile.scale ?? 1);
    const info = await FileSystem.getInfoAsync(pdfItem.uri);
    const beforeSize = info.size || pdfItem.size || 0;
    const compressionFactor = quality * Math.pow(scale, 2);
    const normalizedFactor = Math.max(0.18, Math.min(1, 0.2 + compressionFactor * 0.8));
    const minimumSizeBytes = toPositiveInt(profile.minimumSizeBytes ?? 0);
    const estimatedAfterSize = Math.max(
      1,
      Math.max(Math.round(beforeSize * normalizedFactor), minimumSizeBytes)
    );

    return {
      beforeSize,
      estimatedAfterSize,
    };
  }, []);

  const inflatePdfToMinimumSize = useCallback(async (fileUri, minimumSizeBytes) => {
    const targetBytes = toPositiveInt(minimumSizeBytes);
    if (!fileUri || targetBytes <= 0) return null;

    const initialInfo = await FileSystem.getInfoAsync(fileUri);
    const currentSize = initialInfo.size || 0;
    if (currentSize >= targetBytes) {
      return currentSize;
    }

    let finalSize = currentSize;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const rawBase64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const pdfBytes = Uint8Array.from(Buffer.from(rawBase64, 'base64'));
      const pdfDoc = await PDFDocument.load(pdfBytes);

      const gap = Math.max(0, targetBytes - finalSize);
      if (gap <= 0) break;

      // Add a slightly larger attachment each round to account for PDF object overhead.
      const attachBytes = Math.max(24 * 1024, Math.floor(gap * 1.2) + 8 * 1024);
      const noise = buildNoiseBytes(attachBytes, Date.now() + attempt);

      await pdfDoc.attach(noise, `submission_padding_${Date.now()}_${attempt}.bin`, {
        mimeType: 'application/octet-stream',
        description: 'Submission minimum-size padding',
      });

      const updatedBase64 = await pdfDoc.saveAsBase64();
      await FileSystem.writeAsStringAsync(fileUri, updatedBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const updatedInfo = await FileSystem.getInfoAsync(fileUri);
      finalSize = updatedInfo.size || 0;
      if (finalSize >= targetBytes) break;
    }

    return finalSize;
  }, []);

  // Load all saved PDFs from documentDirectory
  const loadSavedPDFs = useCallback(async () => {
    try {
      const files = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
      const pdfFiles = files.filter((file) => file.endsWith('.pdf'));

      const enrichedFiles = await Promise.all(
        pdfFiles.map(async (fileName) => {
          try {
            const fileUri = FileSystem.documentDirectory + fileName;
            const fileInfo = await FileSystem.getInfoAsync(fileUri);
            const match = fileName.match(/(\d{10,})/);
            const timestamp = match ? Number(match[1]) : Date.now();

            return {
              id: fileName,
              name: fileName,
              size: fileInfo.size || 0,
              createdAt: new Date(timestamp),
              uri: fileUri,
            };
          } catch {
            return null;
          }
        })
      );

      const validFiles = enrichedFiles
        .filter((item) => item !== null)
        .sort((a, b) => b.createdAt - a.createdAt);

      setSavedPDFs(validFiles);
    } catch (error) {
      console.error('Failed to load PDFs:', error);
    }
  }, []);

  // Load all saved ZIPs from documentDirectory/zips
  const loadSavedZIPs = useCallback(async () => {
    try {
      const zipsPath = FileSystem.documentDirectory + 'zips/';
      const dirInfo = await FileSystem.getInfoAsync(zipsPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(zipsPath, { intermediates: true });
      }

      // Migrate older ZIP files that may exist in root documentDirectory.
      const rootFiles = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
      const misplacedZipFiles = rootFiles.filter((file) => file.toLowerCase().endsWith('.zip'));
      await Promise.all(
        misplacedZipFiles.map(async (fileName) => {
          const from = FileSystem.documentDirectory + fileName;
          const to = zipsPath + fileName;
          const targetInfo = await FileSystem.getInfoAsync(to);
          if (!targetInfo.exists) {
            await FileSystem.moveAsync({ from, to });
          } else {
            await FileSystem.deleteAsync(from, { idempotent: true });
          }
        })
      );

      const files = await FileSystem.readDirectoryAsync(zipsPath);
      const zipFiles = files.filter((file) => file.toLowerCase().endsWith('.zip'));

      const enrichedFiles = await Promise.all(
        zipFiles.map(async (fileName) => {
          try {
            const fileUri = zipsPath + fileName;
            const fileInfo = await FileSystem.getInfoAsync(fileUri);
            const match = fileName.match(/(\d{10,})/);
            const fallbackTimestamp = fileInfo.modificationTime
              ? Number(fileInfo.modificationTime) * 1000
              : Date.now();
            const timestamp = match ? Number(match[1]) : fallbackTimestamp;

            return {
              id: fileName,
              name: fileName,
              size: fileInfo.size || 0,
              createdAt: new Date(timestamp),
              uri: fileUri,
            };
          } catch {
            return null;
          }
        })
      );

      const validFiles = enrichedFiles
        .filter((item) => item !== null)
        .sort((a, b) => b.createdAt - a.createdAt);

      setSavedZIPs(validFiles);
    } catch (error) {
      console.error('Failed to load ZIPs:', error);
    }
  }, []);

  const optimizePdf = useCallback(async (pdfItem, targetQuality = 0.6, options = {}) => {
    if (!pdfItem?.uri) {
      Alert.alert('Error', 'Invalid PDF file.');
      return { success: false };
    }

    const quality = clampQuality(targetQuality);
    const scale = clampScale(options.scale ?? 1);
    const preferOriginal = !!options.useOriginalSource;

    setLoading(true);
    try {
      const sourceBackupUri = await ensureBackupSource(pdfItem);
      let workingSourceUri = pdfItem.uri;

      if ((preferOriginal || sourceBackupUri) && sourceBackupUri) {
        const backupInfo = await FileSystem.getInfoAsync(sourceBackupUri);
        if (backupInfo.exists) {
          workingSourceUri = sourceBackupUri;
        }
      }

      const pageImageUris = await ExpoPdfToImageModule.convertPdfToImages(workingSourceUri);
      if (!Array.isArray(pageImageUris) || pageImageUris.length === 0) {
        throw new Error('No pages were rendered for optimization.');
      }

      const sourceInfo = await FileSystem.getInfoAsync(pdfItem.uri);
      const beforeSize = sourceInfo.size || 0;
      const optimizedPdf = await PDFDocument.create();

      for (const pageImageUri of pageImageUris) {
        const imageMeta = await ImageManipulator.manipulateAsync(pageImageUri, []);
        const targetWidth = Math.max(120, Math.round(imageMeta.width * scale));

        const processedImage = await ImageManipulator.manipulateAsync(
          pageImageUri,
          [{ resize: { width: targetWidth } }],
          {
            compress: quality,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          }
        );

        if (!processedImage.base64) {
          throw new Error('Image conversion failed while optimizing PDF.');
        }

        const imageBytes = Buffer.from(processedImage.base64, 'base64');
        const embeddedImage = await optimizedPdf.embedJpg(imageBytes);
        const page = optimizedPdf.addPage([embeddedImage.width, embeddedImage.height]);
        page.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: embeddedImage.width,
          height: embeddedImage.height,
        });
      }

      await applyPageNumbersToPdfDocument(optimizedPdf, defaultPageNumberOptions);
      await applyWatermark(optimizedPdf);
      const optimizedBase64 = await optimizedPdf.saveAsBase64();
      await FileSystem.writeAsStringAsync(pdfItem.uri, optimizedBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const updatedInfo = await FileSystem.getInfoAsync(pdfItem.uri);
      const afterSize = updatedInfo.size || 0;

      setPdfVersion((value) => value + 1);
      await loadSavedPDFs();

      return {
        success: true,
        beforeSize,
        afterSize,
        uri: pdfItem.uri,
      };
    } catch (error) {
      Alert.alert('Optimize Error', error.message || 'Failed to optimize PDF.');
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  }, [ensureBackupSource, loadSavedPDFs]);

  const upscalePdf = useCallback(async (pdfItem, options = {}) => {
    const minimumSizeBytes = toPositiveInt(options.minimumSizeBytes ?? 0);
    const baseResult = await optimizePdf(pdfItem, 1, {
      scale: 1,
      useOriginalSource: true,
    });

    if (!baseResult?.success || minimumSizeBytes <= 0 || !pdfItem?.uri) {
      return baseResult;
    }

    setLoading(true);
    try {
      const paddedSize = await inflatePdfToMinimumSize(pdfItem.uri, minimumSizeBytes);
      await loadSavedPDFs();
      setPdfVersion((value) => value + 1);

      return {
        ...baseResult,
        afterSize: paddedSize || baseResult.afterSize,
      };
    } catch (error) {
      Alert.alert('Upscale Error', error.message || 'Failed to enforce minimum PDF size.');
      return { ...baseResult, success: false, error };
    } finally {
      setLoading(false);
    }
  }, [inflatePdfToMinimumSize, loadSavedPDFs, optimizePdf]);

  // Pick multiple images from library
  const pickImages = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });

    if (!result.canceled) {
      setSelectedImages(result.assets || []);
    }
  }, []);

  // Import a single PDF from device storage into the app library
  const importPDF = useCallback(async () => {
    try {
      setLoading(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return false;
      }

      const picked = result.assets?.[0];
      if (!picked?.uri) {
        Alert.alert('Upload Error', 'No PDF file was selected.');
        return false;
      }

      const originalName = (picked.name || 'Imported.pdf').replace(/[/\\]/g, '_');
      const normalizedName = originalName.toLowerCase().endsWith('.pdf')
        ? originalName
        : `${originalName}.pdf`;
      const safeName = normalizedName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `Uploaded_${Date.now()}_${safeName}`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.copyAsync({
        from: picked.uri,
        to: fileUri,
      });

      await managePdfPages(fileUri, 'APPLY_PAGE_NUMBERS', defaultPageNumberOptions);

      await loadSavedPDFs();
      Alert.alert('Success', 'PDF imported to your library.');
      return true;
    } catch (error) {
      Alert.alert('Upload Error', error.message || 'Failed to upload PDF');
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadSavedPDFs]);

  // Create PDF from selected images
  const createPDF = useCallback(async () => {
    if (selectedImages.length === 0) {
      Alert.alert('Info', 'Please select at least one image');
      return;
    }

    setLoading(true);

    try {
      const pdfDoc = await PDFDocument.create();

      for (const asset of selectedImages) {
        const response = await fetch(asset.uri);
        const blob = await response.blob();

        const base64Data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        });

        const imageBytes = Buffer.from(base64Data, 'base64');
        let embeddedImage;
        const isPng =
          asset?.mimeType?.includes('png') || asset?.uri?.toLowerCase().endsWith('.png');

        if (isPng) {
          embeddedImage = await pdfDoc.embedPng(imageBytes);
        } else {
          embeddedImage = await pdfDoc.embedJpg(imageBytes);
        }

        const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
        page.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: embeddedImage.width,
          height: embeddedImage.height,
        });
      }

      await applyPageNumbersToPdfDocument(pdfDoc, defaultPageNumberOptions);
      await applyWatermark(pdfDoc);
      const pdfBase64 = await pdfDoc.saveAsBase64();
      const timestamp = Date.now();
      const fileName = `Report_${timestamp}.pdf`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, pdfBase64, { encoding: 'base64' });

      Alert.alert('Success', 'PDF saved to your library');
      setSelectedImages([]);
      await loadSavedPDFs();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to create PDF');
    } finally {
      setLoading(false);
    }
  }, [selectedImages, loadSavedPDFs]);

  // Open PDF in viewer or fallback
  const openPDF = useCallback((pdfItem) => {
    if (!pdfItem?.uri) {
      Alert.alert('Error', 'Invalid PDF item');
      return;
    }

    setActivePdf(pdfItem);
    setViewerLoading(true);
    setViewerModalVisible(true);
  }, []);

  // Close PDF viewer
  const closePDFViewer = useCallback(() => {
    setViewerModalVisible(false);
    setActivePdf(null);
    setViewerLoading(false);
  }, []);

  // Start rename operation
  const startRename = useCallback((pdfItem) => {
    setRenamingFile(pdfItem);
    setNewFileName(pdfItem.name.replace('.pdf', ''));
    setRenameModal(true);
  }, []);

  // Confirm rename and save
  const confirmRename = useCallback(async () => {
    if (!newFileName.trim()) {
      Alert.alert('Error', 'File name cannot be empty');
      return;
    }

    if (newFileName === renamingFile.name.replace('.pdf', '')) {
      setRenameModal(false);
      return;
    }

    try {
      const newNameWithExt = `${newFileName.trim()}.pdf`;
      const newFileUri = FileSystem.documentDirectory + newNameWithExt;

      const fileInfo = await FileSystem.getInfoAsync(newFileUri);
      if (fileInfo.exists) {
        Alert.alert('Error', 'A file with this name already exists');
        return;
      }

      await FileSystem.moveAsync({
        from: renamingFile.uri,
        to: newFileUri,
      });

      setRenameModal(false);
      setRenamingFile(null);
      setNewFileName('');
      await loadSavedPDFs();
      Alert.alert('Success', 'File renamed successfully');
    } catch (error) {
      Alert.alert('Error', `Failed to rename: ${error.message}`);
    }
  }, [newFileName, renamingFile, loadSavedPDFs]);

  // Extract ZIP using JSZip (pure JS – works in Expo Go)
  const openZIP = useCallback(async (zipItem) => {
    try {
      setLoading(true);

      // Read the zip file as base64
      const zipBase64 = await FileSystem.readAsStringAsync(zipItem.uri, {
        encoding: 'base64',
      });

      // Parse the zip with JSZip
      const zip = await JSZip.loadAsync(zipBase64, { base64: true });

      let extractedCount = 0;

      // Iterate over every file inside the zip
      const fileNames = Object.keys(zip.files);
      for (const fileName of fileNames) {
        const entry = zip.files[fileName];

        // Skip directories and macOS resource-fork junk files
        if (entry.dir || fileName.startsWith('__MACOSX')) continue;

        const lowerName = fileName.toLowerCase();
        const baseName = fileName.split('/').pop(); // strip folder path

        if (lowerName.endsWith('.pdf')) {
          // ---- PDF file: save directly ----
          const pdfBase64 = await entry.async('base64');
          const timestamp = Date.now();
          const destUri =
            FileSystem.documentDirectory + `Unzipped_${timestamp}_${baseName}`;
          await FileSystem.writeAsStringAsync(destUri, pdfBase64, {
            encoding: 'base64',
          });

          await managePdfPages(destUri, 'APPLY_PAGE_NUMBERS', defaultPageNumberOptions);
          extractedCount++;
        } else if (
          lowerName.endsWith('.jpg') ||
          lowerName.endsWith('.jpeg') ||
          lowerName.endsWith('.png')
        ) {
          // ---- Image file: wrap in a single-page PDF ----
          const imgBase64 = await entry.async('base64');
          const imgBytes = Buffer.from(imgBase64, 'base64');

          const pdfDoc = await PDFDocument.create();
          let embeddedImage;
          if (lowerName.endsWith('.png')) {
            embeddedImage = await pdfDoc.embedPng(imgBytes);
          } else {
            embeddedImage = await pdfDoc.embedJpg(imgBytes);
          }

          const page = pdfDoc.addPage([
            embeddedImage.width,
            embeddedImage.height,
          ]);
          page.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width: embeddedImage.width,
            height: embeddedImage.height,
          });

          await applyPageNumbersToPdfDocument(pdfDoc, defaultPageNumberOptions);
          await applyWatermark(pdfDoc);
          const pdfBase64 = await pdfDoc.saveAsBase64();
          const timestamp = Date.now();
          const pdfName = baseName.replace(/\.[^.]+$/, '.pdf');
          const destUri =
            FileSystem.documentDirectory + `Unzipped_${timestamp}_${pdfName}`;
          await FileSystem.writeAsStringAsync(destUri, pdfBase64, {
            encoding: 'base64',
          });
          extractedCount++;
        }
        // other file types are silently skipped
      }

      if (extractedCount > 0) {
        Alert.alert(
          'Success',
          `Extracted ${extractedCount} file(s) into your PDF library.`
        );
      } else {
        Alert.alert(
          'Notice',
          'No PDF or image files were found inside the ZIP.'
        );
      }

      await loadSavedPDFs();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to extract ZIP');
    } finally {
      setLoading(false);
    }
  }, [loadSavedPDFs]);

  // Delete Item (PDF or ZIP)
  const deleteItem = useCallback((item) => {
    Alert.alert('Delete File', `Delete "${item.name}"?`, [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await FileSystem.deleteAsync(item.uri);
            if (item.name.toLowerCase().endsWith('.zip')) {
              await loadSavedZIPs();
            } else {
              await loadSavedPDFs();
            }
          } catch (error) {
            Alert.alert('Error', `Failed to delete: ${error.message}`);
          }
        },
      },
    ]);
  }, [loadSavedPDFs, loadSavedZIPs]);

  // Apply page numbers to all PDFs currently in the library
  const applyPageNumbersToAllPDFs = useCallback(async () => {
    setLoading(true);
    try {
      const files = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
      const pdfFiles = files.filter((file) => file.toLowerCase().endsWith('.pdf'));

      if (pdfFiles.length === 0) {
        Alert.alert('Notice', 'No PDFs found in your library.');
        return { success: true, processed: 0, failed: 0 };
      }

      let processed = 0;
      let failed = 0;

      for (const fileName of pdfFiles) {
        const fileUri = FileSystem.documentDirectory + fileName;
        try {
          await managePdfPages(fileUri, 'APPLY_PAGE_NUMBERS', defaultPageNumberOptions);
          processed += 1;
        } catch (error) {
          console.error(`Failed numbering for ${fileName}:`, error);
          failed += 1;
        }
      }

      setPdfVersion((value) => value + 1);
      await loadSavedPDFs();

      if (failed === 0) {
        Alert.alert('Success', `Applied page numbers to ${processed} PDF(s).`);
      } else {
        Alert.alert(
          'Completed with Errors',
          `Applied page numbers to ${processed} PDF(s). Failed: ${failed}.`
        );
      }

      return { success: failed === 0, processed, failed };
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to apply page numbers in bulk.');
      return { success: false, processed: 0, failed: 0, error };
    } finally {
      setLoading(false);
    }
  }, [loadSavedPDFs]);

// Note: standalone Extract is removed, logic moved to modifyPdf

  // Merge multiple PDFs into one
  const mergePDFs = useCallback(async (selectedItems) => {
    if (selectedItems.length < 2) return false;
    setLoading(true);
    try {
      const mergedPdf = await PDFDocument.create();
      
      for (const item of selectedItems) {
        const fileData = await FileSystem.readAsStringAsync(item.uri, { encoding: 'base64' });
        const pdfDoc = await PDFDocument.load(fileData);
        const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }
      
      await applyPageNumbersToPdfDocument(mergedPdf, defaultPageNumberOptions);
      await applyWatermark(mergedPdf);
      const pdfBytes = await mergedPdf.saveAsBase64();
      const timestamp = Date.now();
      const fileName = `Merged_Report_${timestamp}.pdf`;
      const fileUri = FileSystem.documentDirectory + fileName;
      
      await FileSystem.writeAsStringAsync(fileUri, pdfBytes, { encoding: 'base64' });
      
      Alert.alert('Success', 'PDFs merged successfully!');
      await loadSavedPDFs();
      return true;
    } catch (error) {
      Alert.alert('Merge Error', error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadSavedPDFs]);

  // Lock PDF with password and save new encrypted copy locally
  const lockPDF = useCallback(async (pdfItem, userPassword) => {
    if (!pdfItem?.uri) {
      Alert.alert('Error', 'Invalid PDF file.');
      return false;
    }

    if (!userPassword || userPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return false;
    }

    setLoading(true);
    try {
      const randomApi = globalThis?.crypto?.getRandomValues || global?.crypto?.getRandomValues;
      if (typeof randomApi !== 'function') {
        throw new Error('Secure random API unavailable (crypto.getRandomValues is missing). Rebuild the app after dependency changes.');
      }

      // Preflight secure randomness because encryption key generation depends on it.
      const randomProbe = new Uint8Array(16);
      randomApi(randomProbe);

      const sourceUri = pdfItem.uri.startsWith('file://') ? pdfItem.uri : `file://${pdfItem.uri}`;

      let sourceBase64;
      try {
        sourceBase64 = await FileSystem.readAsStringAsync(sourceUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch {
        sourceBase64 = await FileSystem.readAsStringAsync(sourceUri.replace('file://', ''), {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      const sourceBytes = Uint8Array.from(Buffer.from(sourceBase64, 'base64'));
      const securePdf = await SecurePDFDocument.load(sourceBytes, { ignoreEncryption: true });

      await applyWatermark(securePdf);

      await securePdf.encrypt({
        userPassword,
        ownerPassword: userPassword,
        pdfVersion: '1.7ext3',
        permissions: {
          printing: 'highResolution',
          modifying: false,
          copying: false,
          annotating: false,
          fillingForms: false,
          contentAccessibility: true,
          documentAssembly: false,
        },
      });

      const encryptedBytes = await securePdf.save();
      const encryptedBase64 = Buffer.from(encryptedBytes).toString('base64');

      // Encrypt in-place: overwrite the original file with encrypted version
      const targetUri = pdfItem.uri.startsWith('file://') ? pdfItem.uri : `file://${pdfItem.uri}`;

      await FileSystem.writeAsStringAsync(targetUri, encryptedBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await loadSavedPDFs();

      const originalName = pdfItem.name || 'document.pdf';
      Alert.alert('Success', `"${originalName}" is now password-protected and encrypted.`, [
        { text: 'Done', style: 'default' },
      ]);

      return true;
    } catch (error) {
      console.error('Lock PDF error:', error);
      Alert.alert(
        'Lock Error',
        error.message || 'Failed to lock PDF. Ensure a development build is installed and app restarted after native dependency changes.'
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadSavedPDFs]);

  // Modify PDF pages (batch rotate, delete, or SPLIT)
  const modifyPdf = useCallback(async (fileUri, changesList) => {
    try {
      if (!changesList || changesList.length === 0) return true;
      setLoading(true);
      const fileData = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
      const pdfDoc = await PDFDocument.load(fileData);
      const pages = pdfDoc.getPages();

      // Check for REARRANGE action (tap-to-sequence flow)
      const rearrangeAction = changesList.find((c) => c.action === 'REARRANGE');
      if (rearrangeAction) {
        const orderedPages = Array.isArray(rearrangeAction.pages)
          ? rearrangeAction.pages.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < pages.length)
          : [];

        if (orderedPages.length === 0) {
          Alert.alert('Error', 'Please select at least one page for rearrangement.');
          return false;
        }

        const reorderedPdf = await PDFDocument.create();
        const copiedPages = await reorderedPdf.copyPages(pdfDoc, orderedPages);
        copiedPages.forEach((page) => reorderedPdf.addPage(page));

        await applyPageNumbersToPdfDocument(reorderedPdf, defaultPageNumberOptions);

        const outputBase64 = await reorderedPdf.saveAsBase64();
        const timestamp = Date.now();
        const fileName = `Rearranged_${timestamp}.pdf`;
        const outputUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(outputUri, outputBase64, { encoding: 'base64' });

        const createdItem = {
          id: fileName,
          name: fileName,
          uri: outputUri,
          createdAt: new Date(timestamp),
        };

        await loadSavedPDFs();

        Alert.alert('Success', 'Rearranged PDF generated.', [
          {
            text: 'View',
            onPress: () => {
              setViewerLoading(false);
              setActivePdf(createdItem);
              setViewerModalVisible(true);
            },
          },
          {
            text: 'Share',
            onPress: async () => {
              try {
                if (!(await Sharing.isAvailableAsync())) {
                  Alert.alert('Share Unavailable', 'Sharing is not available on this device.');
                  return;
                }
                await Sharing.shareAsync(outputUri);
              } catch (error) {
                Alert.alert('Share Error', error.message || 'Failed to share the generated PDF.');
              }
            },
          },
          { text: 'Done', style: 'cancel' },
        ]);

        return true;
      }

      // Check for SPLIT action
      const splitAction = changesList.find(c => c.action === 'SPLIT');
      if (splitAction) {
        setLoading(true);
        const newPdf = await PDFDocument.create();
        const pagesToExtract = [...splitAction.pages].sort((a,b) => a - b);
        
        // Copy selected pages
        const copiedPages = await newPdf.copyPages(pdfDoc, pagesToExtract);
        copiedPages.forEach(p => newPdf.addPage(p));

        await applyPageNumbersToPdfDocument(newPdf, defaultPageNumberOptions);
        
        // Save new split Document
        const newPdfBytes = await newPdf.saveAsBase64();
        const timestamp = Date.now();
        const fileName = `Split_Document_${timestamp}.pdf`;
        const newFileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(newFileUri, newPdfBytes, { encoding: 'base64' });

        // Remove from current document in descending order
        const sortedDesc = [...pagesToExtract].sort((a, b) => b - a);
        sortedDesc.forEach(idx => pdfDoc.removePage(idx));

        // Save modification changes on existing Document
        await applyPageNumbersToPdfDocument(pdfDoc, defaultPageNumberOptions);
        const pdfBytes = await pdfDoc.saveAsBase64();
        await FileSystem.writeAsStringAsync(fileUri, pdfBytes, { encoding: 'base64' });

        setPdfVersion(v => v + 1);
        await loadSavedPDFs();
        Alert.alert('Success', 'PDF successfully split into two records.');
        return true;
      }

      const deleteActions = changesList.filter(c => c.action === 'DELETE');
      if (deleteActions.length >= pages.length) {
        Alert.alert('Error', 'Cannot delete all pages in the document.');
        setLoading(false);
        return false;
      }

      // Execute all Rotations first
      changesList
        .filter(c => c.action === 'ROTATE')
        .forEach(change => {
          const page = pages[change.pageIndex];
          if (page) {
            const currentRotation = page.getRotation().angle;
            page.setRotation(degrees(currentRotation + change.angle));
          }
        });

      // Execute Deletions strictly in descending index order to prevent index shifting bugs
      deleteActions
        .sort((a, b) => b.pageIndex - a.pageIndex)
        .forEach(change => {
          pdfDoc.removePage(change.pageIndex);
        });

      await applyPageNumbersToPdfDocument(pdfDoc, defaultPageNumberOptions);
      const pdfBytes = await pdfDoc.saveAsBase64();
      await FileSystem.writeAsStringAsync(fileUri, pdfBytes, { encoding: 'base64' });

      // Trigger cache bust for viewer without unmounting
      setPdfVersion(v => v + 1);
      await loadSavedPDFs();
      return true;
    } catch (error) {
      Alert.alert('Error', `Failed to modify PDF: ${error.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadSavedPDFs]);

  return {
    selectedImages,
    setSelectedImages,
    loading,
    savedPDFs,
    savedZIPs,
    renameModal,
    setRenameModal,
    renamingFile,
    newFileName,
    setNewFileName,
    viewerModalVisible,
    activePdf,
    viewerLoading,
    setViewerLoading,
    loadSavedPDFs,
    loadSavedZIPs,
    pickImages,
    importPDF,
    createPDF,
    openPDF,
    openZIP,
    closePDFViewer,
    startRename,
    confirmRename,
    deleteItem,
    modifyPdf,
    mergePDFs,
    lockPDF,
    optimizePdf,
    upscalePdf,
    estimateOptimizedPdfSize,
    applyPageNumbersToAllPDFs,
    pdfVersion,
  };
};
