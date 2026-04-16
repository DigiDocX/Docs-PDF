import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { usePdfPageManager } from '../hooks/usePdfPageManager';
import { COLORS } from '../constants/theme';

/**
 * Modal for managing PDF pages (add/insert blank pages)
 * Integrates with usePdfPageManager hook for async operations
 *
 * @param {Object} props
 * @param {boolean} props.visible - Modal visibility
 * @param {string} props.pdfPath - Full file system path to the PDF
 * @param {number} props.currentPageCount - Current number of pages in the PDF
 * @param {function} props.onCancel - Callback when user cancels
 * @param {function} props.onSuccess - Callback when page operation succeeds (receives version)
 */
export const ManagePdfPagesModal = ({
  visible,
  pdfPath,
  currentPageCount = 0,
  onCancel,
  onSuccess,
}) => {
  const { isProcessing, addPageAtEnd, insertPageAt, error, clearError } =
    usePdfPageManager();

  const [pageIndex, setPageIndex] = useState('');
  const [mode, setMode] = useState('ADD_END'); // 'ADD_END' or 'INSERT_AT'

  useEffect(() => {
    if (!visible) {
      setPageIndex('');
      setMode('ADD_END');
      clearError();
    }
  }, [visible, clearError]);

  const handleAddEnd = async () => {
    if (!pdfPath) return;
    const version = await addPageAtEnd(pdfPath, onSuccess);
    if (version) {
      setPageIndex('');
      setMode('ADD_END');
    }
  };

  const handleInsertAt = async () => {
    if (!pdfPath) return;
    const index = parseInt(pageIndex, 10);

    if (isNaN(index)) {
      Alert.alert('Invalid Input', 'Please enter a valid page number.');
      return;
    }

    const version = await insertPageAt(pdfPath, index, onSuccess);
    if (version) {
      setPageIndex('');
      setMode('ADD_END');
    }
  };

  const maxPageIndex = currentPageCount; // Can insert at the end as well
  const pageIndexError =
    pageIndex &&
    (parseInt(pageIndex, 10) < 0 || parseInt(pageIndex, 10) > maxPageIndex);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isProcessing) onCancel();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Manage PDF Pages</Text>
          <Text style={styles.subtitle}>Add or insert blank A4 pages</Text>

          {/* Mode Selection */}
          <View style={styles.modeSection}>
            <View style={styles.modeOption}>
              <Text style={styles.modeLabel}>Mode</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={styles.radioOption}
                  onPress={() => setMode('ADD_END')}
                  disabled={isProcessing}
                >
                  <View style={styles.radio}>
                    {mode === 'ADD_END' ? (
                      <View style={styles.radioInner} />
                    ) : null}
                  </View>
                  <Text style={styles.radioLabel}>Add to End</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.radioOption}
                  onPress={() => setMode('INSERT_AT')}
                  disabled={isProcessing}
                >
                  <View style={styles.radio}>
                    {mode === 'INSERT_AT' ? (
                      <View style={styles.radioInner} />
                    ) : null}
                  </View>
                  <Text style={styles.radioLabel}>Insert at Position</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Insert Position Input */}
          {mode === 'INSERT_AT' && (
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Page Position (0-based index)</Text>
              <TextInput
                style={[styles.input, pageIndexError && styles.inputError]}
                placeholder="Enter position (e.g., 0, 1, 2...)"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                value={pageIndex}
                onChangeText={setPageIndex}
                editable={!isProcessing}
              />
              <Text style={styles.hint}>
                Current pages: {currentPageCount} (valid range: 0-{maxPageIndex})
              </Text>
              {pageIndexError && (
                <Text style={styles.errorText}>
                  Index must be between 0 and {maxPageIndex}
                </Text>
              )}
            </View>
          )}

          {/* Info Box */}
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Info</Text>
            <Text style={styles.infoText}>
              • A4 page size: 210 × 297 mm (595 × 842 pt)
            </Text>
            <Text style={styles.infoText}>
              • The PDF will be saved immediately after the operation
            </Text>
            <Text style={styles.infoText}>
              • You may need to close and reopen the PDF to see changes
            </Text>
          </View>

          {/* Error Display */}
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{error}</Text>
            </View>
          )}

          {/* Processing Indicator */}
          {isProcessing && (
            <View style={styles.processingBox}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.processingText}>Processing PDF...</Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={isProcessing}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmBtn, isProcessing && styles.confirmBtnDisabled]}
              onPress={mode === 'ADD_END' ? handleAddEnd : handleInsertAt}
              disabled={isProcessing || (mode === 'INSERT_AT' && !pageIndex)}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>
                  {mode === 'ADD_END' ? 'Add Page' : 'Insert Page'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    maxWidth: 400,
    width: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  modeSection: {
    marginBottom: 16,
  },
  modeOption: {
    marginBottom: 12,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 8,
  },
  radioGroup: {
    gap: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  radioLabel: {
    fontSize: 14,
    color: COLORS.text,
  },
  inputSection: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 8,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
  },
  infoBox: {
    backgroundColor: '#f0f4f8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorBoxText: {
    fontSize: 12,
    color: '#dc2626',
    lineHeight: 16,
  },
  processingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  processingText: {
    marginLeft: 12,
    fontSize: 14,
    color: COLORS.text,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
