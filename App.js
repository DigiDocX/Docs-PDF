import React, { useEffect, useState } from 'react';
// Polyfill Buffer globally for pdf-lib compatibility
global.Buffer = global.Buffer || require('buffer').Buffer;

import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, Alert, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Import native modules (with Buffer polyfill at top)
import './utils/nativeModules';

// Import custom hooks
import { usePDFManager } from './hooks/usePDFManager';

// Import components
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
    pdfVersion,
  } = usePDFManager();

  const [activeTab, setActiveTab] = useState('pdfs');
  const [createModeTab, setCreateModeTab] = useState('create');
  const [selectedPDFsState, setSelectedPDFsState] = useState([]);
  const [activeFeature, setActiveFeature] = useState(null);
  const [viewMode, setViewMode] = useState('landing');

  const isMergeMode = activeFeature === 'merge';
  const isSelectionMode = isMergeMode && selectedPDFsState.length > 0 && activeTab === 'pdfs';

  const featureCards = [
    {
      key: 'merge',
      title: 'Merge PDF',
      subtitle: 'Combine multiple PDFs into one file',
      icon: 'file-document-multiple-outline',
      color: '#3a5f8f',
    },
    {
      key: 'split',
      title: 'Split PDF',
      subtitle: 'Extract pages into a new document',
      icon: 'content-cut',
      color: '#7b4f35',
    },
    {
      key: 'rearrange',
      title: 'Rearrange PDF',
      subtitle: 'Change page order interactively',
      icon: 'sort-variant',
      color: '#3f6a47',
    },
    {
      key: 'edit',
      title: 'Edit Pages',
      subtitle: 'Rotate, delete, and refine pages',
      icon: 'file-document-edit-outline',
      color: '#5c4a8d',
    },
    {
      key: 'annotate',
      title: 'Annotate PDF',
      subtitle: 'Draw, highlight, add text, and mark up pages',
      icon: 'draw',
      color: '#b45f06',
    },
    {
      key: 'optimize',
      title: 'Optimize PDF',
      subtitle: 'Compress or restore image quality',
      icon: 'tune-variant',
      color: '#2f5f6f',
    },
    {
      key: 'lock',
      title: 'Lock PDF',
      subtitle: 'Protect a PDF with a password',
      icon: 'lock-outline',
      color: '#8a3b50',
    },
    {
      key: 'zip',
      title: 'Zip PDF',
      subtitle: 'Bundle a PDF as a ZIP archive',
      icon: 'zip-box',
      color: '#5f6474',
    },
    {
      key: 'extractZip',
      title: 'Extract ZIP',
      subtitle: 'Unzip and import PDF/image files',
      icon: 'folder-zip-outline',
      color: '#2f6f7f',
    },
    {
      key: 'create',
      title: 'Create PDF',
      subtitle: 'Build a PDF from selected images',
      icon: 'image-plus',
      color: '#5f7a32',
    },
    {
      key: 'upload',
      title: 'Upload PDF',
      subtitle: 'Import an existing PDF from your device',
      icon: 'upload-box-outline',
      color: '#2f6672',
    },
    {
      key: 'library',
      title: 'Browse Library',
      subtitle: 'View, rename, delete PDFs and ZIPs',
      icon: 'folder-multiple-outline',
      color: '#4c525e',
    },
  ];

  const pickerCopy = {
    merge: {
      title: 'Select PDFs to merge',
      subtitle: 'Choose at least 2 files, then merge them.',
      itemType: 'pdf',
    },
    split: {
      title: 'Pick a PDF to split',
      subtitle: 'After opening, page edit mode starts automatically.',
      itemType: 'pdf',
    },
    rearrange: {
      title: 'Pick a PDF to rearrange',
      subtitle: 'After opening, rearrange mode starts automatically.',
      itemType: 'pdf',
    },
    edit: {
      title: 'Pick a PDF to edit',
      subtitle: 'Rotate, delete, or split pages in edit mode.',
      itemType: 'pdf',
    },
    annotate: {
      title: 'Pick a PDF to annotate',
      subtitle: 'Open the viewer in annotation mode to draw and add text.',
      itemType: 'pdf',
    },
    optimize: {
      title: 'Pick a PDF to optimize',
      subtitle: 'Open the viewer and choose Small, Balanced, or Original.',
      itemType: 'pdf',
    },
    lock: {
      title: 'Pick a PDF to lock',
      subtitle: 'Open the viewer, then use the lock action.',
      itemType: 'pdf',
    },
    zip: {
      title: 'Pick a PDF to zip',
      subtitle: 'Open the viewer, then use the zip action.',
      itemType: 'pdf',
    },
    extractZip: {
      title: 'Pick a ZIP to extract',
      subtitle: 'Imported PDFs are added to your library.',
      itemType: 'zip',
    },
    library: {
      title: 'Your library',
      subtitle: 'Manage and open your saved files.',
      itemType: 'all',
    },
  };

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
      setViewMode('landing');
      setActiveFeature(null);
    }
  };

  const handleOpenFeature = (featureKey) => {
    setActiveFeature(featureKey);
    setSelectedPDFsState([]);

    if (featureKey === 'create' || featureKey === 'upload') {
      setCreateModeTab(featureKey === 'upload' ? 'upload' : 'create');
      setViewMode('create');
      return;
    }

    if (featureKey === 'library') {
      setActiveTab('pdfs');
    }

    if (featureKey === 'extractZip') {
      setActiveTab('zips');
    } else if (featureKey !== 'library') {
      setActiveTab('pdfs');
    }

    setViewMode('picker');
  };

  const handleBackToHome = () => {
    setActiveFeature(null);
    setViewMode('landing');
    setSelectedPDFsState([]);
  };

  const openForSingleFeature = (pdfItem) => {
    if (activeFeature === 'extractZip') {
      openZIP(pdfItem);
      return;
    }
    openPDF(pdfItem);
  };

  const renderFeatureLanding = () => (
    <ScrollView contentContainerStyle={styles.featureScreenContent}>
      <View style={styles.heroSection}>
        <Text style={styles.heroTitle}>Choose a PDF feature</Text>
        <Text style={styles.heroSubtitle}>
          Start with what you want to do, then pick files for that workflow.
        </Text>
      </View>

      <View style={styles.gridWrap}>
        {featureCards.map((feature) => (
          <TouchableOpacity
            key={feature.key}
            activeOpacity={0.85}
            style={[styles.featureCard, { borderColor: feature.color }]}
            onPress={() => handleOpenFeature(feature.key)}
          >
            <View style={[styles.featureIconWrap, { backgroundColor: feature.color }]}>
              <MaterialCommunityIcons name={feature.icon} size={20} color="#fff" />
            </View>
            <Text style={styles.featureTitle}>{feature.title}</Text>
            <Text style={styles.featureSubtitle}>{feature.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const renderCreateFlow = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.flowHeader}>
        <TouchableOpacity onPress={handleBackToHome} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={18} color="#fff" />
          <Text style={styles.backButtonText}>Features</Text>
        </TouchableOpacity>
        <Text style={styles.flowTitle}>Create or Upload PDF</Text>
        <Text style={styles.flowSubtitle}>
          {createModeTab === 'create'
            ? 'Select images and generate a new PDF file.'
            : 'Pick a PDF from device storage and add it to your library.'}
        </Text>

        <View style={styles.createModeTabRow}>
          <TouchableOpacity
            onPress={() => setCreateModeTab('create')}
            style={[styles.tabBtn, createModeTab === 'create' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, createModeTab === 'create' && styles.tabTextActive]}>Create</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCreateModeTab('upload')}
            style={[styles.tabBtn, createModeTab === 'upload' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, createModeTab === 'upload' && styles.tabTextActive]}>Upload</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.createPanel}>
        {createModeTab === 'create' ? (
          <>
            <TouchableOpacity style={styles.primaryCta} onPress={pickImages}>
              <MaterialCommunityIcons name="image-multiple" size={18} color="#fff" />
              <Text style={styles.primaryCtaText}>Select Images</Text>
            </TouchableOpacity>

            <Text style={styles.selectionHint}>
              {selectedImages.length} image{selectedImages.length !== 1 ? 's' : ''} selected
            </Text>

            <TouchableOpacity
              style={[styles.secondaryCta, (loading || selectedImages.length === 0) && styles.disabledCta]}
              onPress={createPDF}
              disabled={loading || selectedImages.length === 0}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="file-pdf-box" size={18} color="#fff" />
                  <Text style={styles.secondaryCtaText}>Create and Save PDF</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.primaryCta, loading && styles.disabledCta]}
              onPress={importPDF}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="upload" size={18} color="#fff" />
                  <Text style={styles.primaryCtaText}>Select PDF From Device</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.selectionHint}>
              Imported PDFs appear below and in your library feature.
            </Text>
          </>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <PDFList
          pdfItems={savedPDFs}
          onView={openPDF}
          onRename={startRename}
          onDelete={deleteItem}
          emptyTitle="No PDFs yet"
          emptySubtitle="Your generated PDFs will appear here"
        />
      </View>
    </View>
  );

  const renderPickerFlow = () => {
    const pickerConfig = pickerCopy[activeFeature] || pickerCopy.library;
    const isZipFeature = activeFeature === 'extractZip';
    const isLibrary = activeFeature === 'library';
    const items = isZipFeature ? savedZIPs : (activeTab === 'pdfs' ? savedPDFs : savedZIPs);
    const emptyTitle = isZipFeature ? 'No ZIP files yet' : 'No PDFs yet';
    const emptySubtitle = isZipFeature
      ? 'Save ZIP archives first, then extract them here.'
      : 'Import or create a PDF, then return to this feature.';

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.flowHeader}>
          <TouchableOpacity onPress={handleBackToHome} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={18} color="#fff" />
            <Text style={styles.backButtonText}>Features</Text>
          </TouchableOpacity>

          <Text style={styles.flowTitle}>{pickerConfig.title}</Text>
          <Text style={styles.flowSubtitle}>{pickerConfig.subtitle}</Text>

          {isLibrary && (
            <View style={styles.tabRow}>
              <TouchableOpacity
                onPress={() => setActiveTab('pdfs')}
                style={[styles.tabBtn, activeTab === 'pdfs' && styles.tabBtnActive]}
              >
                <Text style={[styles.tabText, activeTab === 'pdfs' && styles.tabTextActive]}>PDFs</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab('zips')}
                style={[styles.tabBtn, activeTab === 'zips' && styles.tabBtnActive]}
              >
                <Text style={[styles.tabText, activeTab === 'zips' && styles.tabTextActive]}>ZIPs</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <PDFList
            pdfItems={items}
            onView={activeFeature === 'merge' ? handleToggleSelect : openForSingleFeature}
            onRename={isLibrary && activeTab === 'pdfs' ? startRename : () => Alert.alert('Notice', 'Rename is available in library mode for PDFs only.')}
            onDelete={isLibrary ? deleteItem : () => {}}
            isSelectionMode={isMergeMode}
            selectedPDFs={selectedPDFsState}
            onToggleSelect={handleToggleSelect}
            showActions={isLibrary}
            emptyTitle={emptyTitle}
            emptySubtitle={emptySubtitle}
          />
        </View>

        {isMergeMode && selectedPDFsState.length >= 2 && (
          <TouchableOpacity style={styles.mergeCta} onPress={handleMerge}>
            <Text style={styles.mergeCtaText}>Merge {selectedPDFsState.length} PDFs</Text>
          </TouchableOpacity>
        )}
      </View>
    );
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
        onZipSaved={loadSavedZIPs}
        onLockPDF={lockPDF}
        onOptimizePDF={optimizePdf}
        onUpscalePDF={upscalePdf}
        onEstimateOptimization={estimateOptimizedPdfSize}
        pdfVersion={pdfVersion}
        requestedAction={activeFeature}
      />

      {viewMode === 'landing' && renderFeatureLanding()}
      {viewMode === 'picker' && renderPickerFlow()}
      {viewMode === 'create' && renderCreateFlow()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  featureScreenContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  heroSection: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  gridWrap: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  featureCard: {
    width: '48.5%',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 10,
  },
  featureIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  featureTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 5,
  },
  featureSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  flowHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgSecondary,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 8,
    gap: 6,
  },
  backButtonText: {
    color: COLORS.accentLight,
    fontSize: 13,
    fontWeight: '700',
  },
  flowTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 5,
  },
  flowSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  createPanel: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
    backgroundColor: COLORS.bg,
  },
  primaryCta: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryCtaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryCta: {
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryCtaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  disabledCta: {
    opacity: 0.5,
  },
  selectionHint: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  mergeCta: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  mergeCtaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  tabRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  createModeTabRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  tabBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  tabTextActive: {
    color: '#fff',
  },
});
