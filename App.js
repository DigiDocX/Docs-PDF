import React, { useEffect } from 'react';
// Polyfill Buffer globally for pdf-lib compatibility
global.Buffer = global.Buffer || require('buffer').Buffer;

import { SafeAreaView } from 'react-native-safe-area-context';

// Import native modules (with Buffer polyfill at top)
import './utils/nativeModules';

// Import custom hooks
import { usePDFManager } from './hooks/usePDFManager';

// Import components
import { Header } from './components/Header';
import { PDFList } from './components/PDFList';
import { RenameModal } from './components/RenameModal';
import { PDFViewerModal } from './components/PDFViewerModal';

// Import styles
import { STYLES } from './constants/theme';

/**
 * Main App Component
 * Orchestrates all modules and components for PDF management
 */
export default function App() {
  const {
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
  } = usePDFManager();

  // Load PDFs on mount
  useEffect(() => {
    loadSavedPDFs();
  }, [loadSavedPDFs]);

  return (
    <SafeAreaView style={STYLES.container}>
      {/* Rename Modal */}
      <RenameModal
        visible={renameModal}
        fileName={renamingFile?.name}
        newFileName={newFileName}
        onChangeText={setNewFileName}
        onCancel={() => setRenameModal(false)}
        onConfirm={confirmRename}
      />

      {/* PDF Viewer Modal */}
      <PDFViewerModal
        visible={viewerModalVisible}
        pdfItem={activePdf}
        isLoading={viewerLoading}
        onLoadComplete={() => setViewerLoading(false)}
        onClose={closePDFViewer}
        onModify={modifyPdf}
        pdfVersion={pdfVersion}
      />

      {/* Header with action buttons */}
      <Header
        pdfCount={savedPDFs.length}
        selectedImagesCount={selectedImages.length}
        onSelectImages={pickImages}
        onCreatePDF={createPDF}
        isLoading={loading}
      />

      {/* PDF List or Empty State */}
      <PDFList
        pdfItems={savedPDFs}
        onView={openPDF}
        onRename={startRename}
        onDelete={deletePDF}
      />
    </SafeAreaView>
  );
}
