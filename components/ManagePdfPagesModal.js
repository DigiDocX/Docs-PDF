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
  Alert,
} from 'react-native';
import { usePdfPageManager } from '../hooks/usePdfPageManager';
import { COLORS } from '../constants/theme';

const POSITION_OPTIONS = [
  { key: 'BOTTOM_LEFT', label: 'Bottom Left' },
  { key: 'BOTTOM_CENTER', label: 'Bottom Center' },
  { key: 'BOTTOM_RIGHT', label: 'Bottom Right' },
  { key: 'TOP_LEFT', label: 'Top Left' },
  { key: 'TOP_CENTER', label: 'Top Center' },
  { key: 'TOP_RIGHT', label: 'Top Right' },
];

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
  initialMode = 'ADD_END',
  onCancel,
  onSuccess,
}) => {
  const { isProcessing, addPageAtEnd, insertPageAt, applyPageNumbers, error, clearError } =
    usePdfPageManager();

  const [pageIndex, setPageIndex] = useState('');
  const [mode, setMode] = useState(initialMode); // 'ADD_END' | 'INSERT_AT' | 'APPLY_NUMBERS'
  const [startNumber, setStartNumber] = useState('1');
  const [includeTotal, setIncludeTotal] = useState(false);
  const [numberPosition, setNumberPosition] = useState('BOTTOM_CENTER');

  useEffect(() => {
    if (!visible) {
      setPageIndex('');
      setMode(initialMode);
      setStartNumber('1');
      setIncludeTotal(false);
      setNumberPosition('BOTTOM_CENTER');
      clearError();
    }
  }, [visible, clearError, initialMode]);

  useEffect(() => {
    if (visible) {
      setMode(initialMode);
    }
  }, [visible, initialMode]);

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

  const handleApplyNumbers = async () => {
    if (!pdfPath) return;

    const parsedStart = parseInt(startNumber, 10);
    if (isNaN(parsedStart) || parsedStart < 1) {
      Alert.alert('Invalid Input', 'Start number must be 1 or greater.');
      return;
    }

    const version = await applyPageNumbers(
      pdfPath,
      {
        startNumber: parsedStart,
        includeTotal,
        position: numberPosition,
        fontSize: 11,
        margin: 28,
        color: '#333333',
      },
      onSuccess
    );

    if (version) {
      setStartNumber('1');
      setIncludeTotal(false);
      setNumberPosition('BOTTOM_CENTER');
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
          <Text style={styles.subtitle}>Add pages or apply page numbers</Text>

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

                <TouchableOpacity
                  style={styles.radioOption}
                  onPress={() => setMode('APPLY_NUMBERS')}
                  disabled={isProcessing}
                >
                  <View style={styles.radio}>
                    {mode === 'APPLY_NUMBERS' ? (
                      <View style={styles.radioInner} />
                    ) : null}
                  </View>
                  <Text style={styles.radioLabel}>Apply Page Numbers</Text>
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

          {/* Page Numbering Options */}
          {mode === 'APPLY_NUMBERS' && (
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Start Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter start number (e.g., 1)"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                value={startNumber}
                onChangeText={setStartNumber}
                editable={!isProcessing}
              />

              <Text style={styles.inputLabel}>Position</Text>
              <View style={styles.positionGrid}>
                {POSITION_OPTIONS.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      styles.positionBtn,
                      numberPosition === item.key && styles.positionBtnActive,
                    ]}
                    onPress={() => setNumberPosition(item.key)}
                    disabled={isProcessing}
                  >
                    <Text
                      style={[
                        styles.positionBtnText,
                        numberPosition === item.key && styles.positionBtnTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Show total pages (e.g., 3 / 12)</Text>
                <Switch
                  value={includeTotal}
                  onValueChange={setIncludeTotal}
                  disabled={isProcessing}
                  trackColor={{ false: COLORS.bgLight, true: COLORS.primary }}
                  thumbColor={includeTotal ? '#e9f2ff' : '#c8cde2'}
                />
              </View>
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
              onPress={
                mode === 'ADD_END'
                  ? handleAddEnd
                  : mode === 'INSERT_AT'
                    ? handleInsertAt
                    : handleApplyNumbers
              }
              disabled={
                isProcessing
                || (mode === 'INSERT_AT' && !pageIndex)
                || (mode === 'APPLY_NUMBERS' && !startNumber)
              }
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>
                  {mode === 'ADD_END'
                    ? 'Add Page'
                    : mode === 'INSERT_AT'
                      ? 'Insert Page'
                      : 'Apply Numbers'}
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
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    padding: 20,
    maxWidth: 400,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
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
    borderColor: COLORS.accentLight,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accentLight,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
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
  positionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  positionBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: COLORS.bg,
  },
  positionBtnActive: {
    borderColor: COLORS.accentLight,
    backgroundColor: 'rgba(138, 180, 248, 0.18)',
  },
  positionBtnText: {
    fontSize: 12,
    color: COLORS.text,
  },
  positionBtnTextActive: {
    color: COLORS.accentLight,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#ff8c8c',
  },
  infoBox: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accentLight,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    backgroundColor: 'rgba(95, 58, 58, 0.45)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ff7b7b',
    borderWidth: 1,
    borderColor: '#7a4343',
  },
  errorBoxText: {
    fontSize: 12,
    color: '#ffb2b2',
    lineHeight: 16,
  },
  processingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.bgTertiary,
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
