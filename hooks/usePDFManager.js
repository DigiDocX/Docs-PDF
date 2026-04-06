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

  // Delete PDF
  const deletePDF = useCallback((pdfItem) => {
    Alert.alert('Delete PDF', `Delete "${pdfItem.name}"?`, [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await FileSystem.deleteAsync(pdfItem.uri);
            await loadSavedPDFs();
          } catch (error) {
            Alert.alert('Error', `Failed to delete: ${error.message}`);
          }
        },
      },
    ]);
  }, [loadSavedPDFs]);

  // Modify PDF pages (batch rotate or delete)
  const modifyPdf = useCallback(async (fileUri, changesList) => {
    try {
      if (!changesList || changesList.length === 0) return true;
      setLoading(true);
      const fileData = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
      const pdfDoc = await PDFDocument.load(fileData);
      const pages = pdfDoc.getPages();

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
    pickImages,
    createPDF,
    openPDF,
    closePDFViewer,
    startRename,
    confirmRename,
    deletePDF,
    modifyPdf,
    pdfVersion,
  };
};
