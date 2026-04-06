import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { PDFDocument, degrees } from 'pdf-lib';
import { Buffer } from 'buffer';

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
        setSavedZIPs([]);
        return;
      }

      const files = await FileSystem.readDirectoryAsync(zipsPath);
      const zipFiles = files.filter((file) => file.endsWith('.zip'));

      const enrichedFiles = await Promise.all(
        zipFiles.map(async (fileName) => {
          try {
            const fileUri = zipsPath + fileName;
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

      setSavedZIPs(validFiles);
    } catch (error) {
      console.error('Failed to load ZIPs:', error);
    }
  }, []);

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

  // Open ZIP (Share fallback)
  const openZIP = useCallback(async (zipItem) => {
    try {
      const Sharing = require('expo-sharing');
      await Sharing.shareAsync(zipItem.uri);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to open ZIP');
    }
  }, []);

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

  // Modify PDF pages (batch rotate, delete, or SPLIT)
  const modifyPdf = useCallback(async (fileUri, changesList) => {
    try {
      if (!changesList || changesList.length === 0) return true;
      setLoading(true);
      const fileData = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
      const pdfDoc = await PDFDocument.load(fileData);
      const pages = pdfDoc.getPages();

      // Check for SPLIT action
      const splitAction = changesList.find(c => c.action === 'SPLIT');
      if (splitAction) {
        setLoading(true);
        const newPdf = await PDFDocument.create();
        const pagesToExtract = [...splitAction.pages].sort((a,b) => a - b);
        
        // Copy selected pages
        const copiedPages = await newPdf.copyPages(pdfDoc, pagesToExtract);
        copiedPages.forEach(p => newPdf.addPage(p));
        
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
    createPDF,
    openPDF,
    openZIP,
    closePDFViewer,
    startRename,
    confirmRename,
    deleteItem,
    modifyPdf,
    mergePDFs,
    pdfVersion,
  };
};
