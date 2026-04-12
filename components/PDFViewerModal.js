import React from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { PDFViewer } from './PDFViewer';
import { PDFEditGrid } from './PDFEditGrid';
import { ensureFileUri } from '../utils/pdfUtils';
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
  onOptimizePDF,
  onUpscalePDF,
  onEstimateOptimization,
  pdfVersion,
  requestedAction,
}) => {
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [viewerPageCount, setViewerPageCount] = React.useState(1);
  const [isSending, setIsSending] = React.useState(false);
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

  const handleSendPdf = async () => {
    if (isSending || !pdfItem?.uri) return;

    setIsSending(true);
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        return;
      }

      await Sharing.shareAsync(ensureFileUri(pdfItem.uri), {
        mimeType: 'application/pdf',
        dialogTitle: 'Send PDF',
      });
    } finally {
      setIsSending(false);
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
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={handleSendPdf}
                disabled={!pdfItem?.uri || isSending}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
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
            onOptimizePDF={onOptimizePDF}
            onUpscalePDF={onUpscalePDF}
            onEstimateOptimization={onEstimateOptimization}
            requestedAction={requestedAction}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
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
