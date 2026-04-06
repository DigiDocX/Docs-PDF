import React, { useEffect, useState } from 'react';
// Polyfill Buffer globally for pdf-lib compatibility
global.Buffer = global.Buffer || require('buffer').Buffer;

import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, Alert, TouchableOpacity } from 'react-native';

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
import { STYLES, COLORS } from './constants/theme';

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
  } = usePDFManager();

  const [activeTab, setActiveTab] = useState('pdfs');
  const [selectedPDFsState, setSelectedPDFsState] = useState([]);
  const isSelectionMode = selectedPDFsState.length > 0 && activeTab === 'pdfs';

  const handleToggleSelect = (item) => {
    if (activeTab !== 'pdfs') return;
    setSelectedPDFsState(prev => {
      const exists = prev.some(p => p.uri === item.uri);
      if (exists) {
        return prev.filter(p => p.uri !== item.uri);
      } else {
        return [...prev, item];
      }
    });
  };

  const handleMerge = async () => {
    const success = await mergePDFs(selectedPDFsState);
    if (success) {
      setSelectedPDFsState([]);
    }
  };

  // Load PDFs and ZIPs on mount
  useEffect(() => {
    loadSavedPDFs();
    loadSavedZIPs();
  }, [loadSavedPDFs, loadSavedZIPs]);

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

      {/* Tab Switcher */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 12, gap: 24 }}>
        <Text
          onPress={() => setActiveTab('pdfs')}
          style={{ 
            fontSize: 16, 
            fontWeight: activeTab === 'pdfs' ? 'bold' : 'normal', 
            color: activeTab === 'pdfs' ? STYLES.colors?.primary || '#fff' : '#888',
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderRadius: 8,
            backgroundColor: activeTab === 'pdfs' ? 'rgba(255,255,255,0.1)' : 'transparent'
          }}
        >
          PDFs
        </Text>
        <Text
          onPress={() => setActiveTab('zips')}
          style={{ 
            fontSize: 16, 
            fontWeight: activeTab === 'zips' ? 'bold' : 'normal', 
            color: activeTab === 'zips' ? STYLES.colors?.primary || '#fff' : '#888',
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderRadius: 8,
            backgroundColor: activeTab === 'zips' ? 'rgba(255,255,255,0.1)' : 'transparent'
          }}
        >
          ZIPs
        </Text>
      </View>

      {/* PDF or ZIP List Window */}
      <PDFList
        pdfItems={activeTab === 'pdfs' ? savedPDFs : savedZIPs}
        onView={activeTab === 'pdfs' ? openPDF : openZIP}
        onRename={activeTab === 'pdfs' ? startRename : () => Alert.alert('Notice', 'Renaming disabled for zip files.')}
        onDelete={deleteItem}
        isSelectionMode={isSelectionMode}
        selectedPDFs={selectedPDFsState}
        onToggleSelect={handleToggleSelect}
      />

      {/* Floating Merge Button */}
      {isSelectionMode && selectedPDFsState.length >= 2 && (
        <TouchableOpacity 
          style={{
            position: 'absolute',
            bottom: 32,
            alignSelf: 'center',
            backgroundColor: STYLES.colors?.primary || COLORS.primary || '#3b82f6',
            paddingVertical: 14,
            paddingHorizontal: 24,
            borderRadius: 30,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 5,
            zIndex: 100
          }}
          onPress={handleMerge}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
            Merge {selectedPDFsState.length} PDFs
          </Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}
