import React from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PDFViewer } from './PDFViewer';
import { PDFEditGrid } from './PDFEditGrid';
import { COLORS } from '../constants/theme';

/**
 * PDFViewerModal Component
 * Modal containing the PDF viewer with header and loading overlay
 */
export const PDFViewerModal = ({
  visible,
  pdfItem,
  isLoading,
  onLoadComplete,
  onClose,
  onModify,
  onZipSaved,
  onLockPDF,
  pdfVersion,
  requestedAction,
}) => {
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [viewerPageCount, setViewerPageCount] = React.useState(1);
  const autoEditActions = ['split', 'rearrange', 'edit'];
  const shouldAutoEnterEdit = autoEditActions.includes(requestedAction);

  React.useEffect(() => {
    if (visible) {
      setIsEditMode(false);
      setViewerPageCount(1);
    }
  }, [visible, pdfItem?.uri, requestedAction]);

  const handleClose = () => {
    setIsEditMode(false);
    onClose();
  };

  const handleApplyEdits = async (fileUri, changesList) => {
    setIsEditMode(false); // Optimistically close grid
    if (onModify) {
      await onModify(fileUri, changesList);
    }
  };

  return (
    <Modal visible={visible} onRequestClose={handleClose} animationType="slide">
      <SafeAreaView style={styles.container}>
        {!isEditMode && (
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {pdfItem?.name || 'PDF Viewer'}
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={COLORS.accentLight} size="large" />
            <Text style={styles.loadingText}>Loading PDF...</Text>
          </View>
        )}

        {pdfItem && !isEditMode && (
          <PDFViewer
            pdfItem={pdfItem}
            onLoadComplete={(count) => {
              setViewerPageCount(count || 1);
              onLoadComplete?.();
              if (shouldAutoEnterEdit) {
                setIsEditMode(true);
              }
            }}
            onClose={handleClose}
            onEnterEditMode={(count) => {
              setViewerPageCount(count);
              setIsEditMode(true);
            }}
            pdfVersion={pdfVersion}
            onZipSaved={onZipSaved}
            onLockPDF={onLockPDF}
          />
        )}
        
        {pdfItem && isEditMode && (
          <PDFEditGrid
            pdfItem={pdfItem}
            pdfVersion={pdfVersion}
            pageCount={viewerPageCount}
            initialMode={requestedAction === 'rearrange' ? 'rearrange' : 'batch'}
            onCancel={() => setIsEditMode(false)}
            onApply={handleApplyEdits}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    backgroundColor: COLORS.bgTertiary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeBtnText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.overlayLight,
    zIndex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#c9d7ff',
    fontSize: 13,
    fontWeight: '600',
  },
});
