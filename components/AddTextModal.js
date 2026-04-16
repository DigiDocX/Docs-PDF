import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Buffer } from 'buffer';

/**
 * Modal for adding text to PDF
 * Allows users to select page, position, and customize text properties
 */
export const AddTextModal = ({
  visible,
  pdfPath,
  pageCount = 1,
  onCancel,
  onSuccess,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [textContent, setTextContent] = useState('');
  const [fontSize, setFontSize] = useState('12');
  const [xPosition, setXPosition] = useState('50');
  const [yPosition, setYPosition] = useState('50');
  const [textColor, setTextColor] = useState('black');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible) {
      setTextContent('');
      setFontSize('12');
      setXPosition('50');
      setYPosition('50');
      setCurrentPage(1);
      setTextColor('black');
      setError(null);
    }
  }, [visible]);

  const colorOptions = [
    { name: 'black', value: 'black', display: '⚫ Black' },
    { name: 'red', value: 'red', display: '🔴 Red' },
    { name: 'blue', value: 'blue', display: '🔵 Blue' },
    { name: 'green', value: 'green', display: '🟢 Green' },
  ];

  const addTextToPdf = async () => {
    if (!pdfPath) {
      setError('PDF path is required');
      return;
    }

    if (!textContent.trim()) {
      setError('Text content cannot be empty');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Read PDF as Base64
      const base64Data = await FileSystem.readAsStringAsync(pdfPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert Base64 to Uint8Array for pdf-lib
      const binaryString = Buffer.from(base64Data, 'base64').toString('binary');
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Load PDF
      const pdfDoc = await PDFDocument.load(bytes);
      const pages = pdfDoc.getPages();

      // Get the target page (convert 1-based to 0-based)
      const pageIndex = Math.max(0, Math.min(currentPage - 1, pages.length - 1));
      const page = pages[pageIndex];
      const { width, height } = page.getSize();

      // Parse and validate coordinates
      const x = Math.max(0, Math.min(parseFloat(xPosition), width));
      const y = Math.max(0, Math.min(parseFloat(yPosition), height));
      const size = Math.max(6, Math.min(72, parseFloat(fontSize)));

      // Get color
      const colorMap = {
        black: rgb(0, 0, 0),
        red: rgb(1, 0, 0),
        blue: rgb(0, 0, 1),
        green: rgb(0, 0.5, 0),
      };
      const drawColor = colorMap[textColor] || rgb(0, 0, 0);

      // Add embedded font
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Draw text on the page
      page.drawText(textContent, {
        x,
        y: height - y, // PDF coordinates start from bottom
        size,
        font,
        color: drawColor,
      });

      // Save modified PDF
      const pdfBytes = await pdfDoc.save();
      const modifiedBase64 = Buffer.from(pdfBytes).toString('base64');

      await FileSystem.writeAsStringAsync(pdfPath, modifiedBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      Alert.alert('Success', 'Text has been added to the PDF.');
      if (onSuccess) {
        onSuccess(Date.now()); // Return timestamp for re-render
      }

      // Reset form
      setTextContent('');
      setCurrentPage(1);
    } catch (err) {
      const errorMsg = err?.message || 'Failed to add text to PDF';
      setError(errorMsg);
      Alert.alert('Error', errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!isProcessing) onCancel();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onCancel}
              disabled={isProcessing}
              style={styles.closeButton}
            >
              <MaterialCommunityIcons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Add Text to PDF</Text>
              <Text style={styles.subtitle}>Customize and place text on your PDF</Text>
            </View>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!isProcessing}
          >
            {/* Page Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Page Number</Text>
              <View style={styles.pageControls}>
                <TouchableOpacity
                  style={styles.pageButton}
                  onPress={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1 || isProcessing}
                >
                  <MaterialCommunityIcons name="minus" size={18} color={COLORS.primary} />
                </TouchableOpacity>
                <TextInput
                  style={styles.pageInput}
                  value={String(currentPage)}
                  onChangeText={(val) => {
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) {
                      setCurrentPage(Math.max(1, Math.min(pageCount, num)));
                    }
                  }}
                  keyboardType="number-pad"
                  editable={!isProcessing}
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={styles.pageButton}
                  onPress={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
                  disabled={currentPage >= pageCount || isProcessing}
                >
                  <MaterialCommunityIcons name="plus" size={18} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>Total pages: {pageCount}</Text>
            </View>

            {/* Text Content */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Text Content</Text>
              <TextInput
                style={[styles.textInput, { height: 80 }]}
                placeholder="Enter text to add to PDF..."
                placeholderTextColor={COLORS.textMuted}
                value={textContent}
                onChangeText={setTextContent}
                multiline
                editable={!isProcessing}
              />
            </View>

            {/* Font Size */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Font Size: {fontSize}pt</Text>
              <View style={styles.sliderContainer}>
                <MaterialCommunityIcons name="format-text-height" size={16} color={COLORS.textMuted} />
                <TextInput
                  style={styles.numberInput}
                  placeholder="6-72"
                  placeholderTextColor={COLORS.textMuted}
                  value={fontSize}
                  onChangeText={(val) => {
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) {
                      setFontSize(String(Math.max(6, Math.min(72, num))));
                    }
                  }}
                  keyboardType="number-pad"
                  editable={!isProcessing}
                />
                <Text style={styles.sliderLabel}>pt</Text>
              </View>
            </View>

            {/* Text Color */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Text Color</Text>
              <View style={styles.colorGrid}>
                {colorOptions.map((option) => (
                  <TouchableOpacity
                    key={option.name}
                    style={[
                      styles.colorOption,
                      textColor === option.name && styles.colorOptionActive,
                    ]}
                    onPress={() => setTextColor(option.name)}
                    disabled={isProcessing}
                  >
                    <Text style={styles.colorText}>{option.display}</Text>
                    {textColor === option.name && (
                      <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Position X */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Horizontal Position (mm)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Distance from left edge (0-210)"
                placeholderTextColor={COLORS.textMuted}
                value={xPosition}
                onChangeText={setXPosition}
                keyboardType="decimal-pad"
                editable={!isProcessing}
              />
              <Text style={styles.hint}>Default: 50mm from left. A4 width: 210mm</Text>
            </View>

            {/* Position Y */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Vertical Position (mm)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Distance from top edge (0-297)"
                placeholderTextColor={COLORS.textMuted}
                value={yPosition}
                onChangeText={setYPosition}
                keyboardType="decimal-pad"
                editable={!isProcessing}
              />
              <Text style={styles.hint}>Default: 50mm from top. A4 height: 297mm</Text>
            </View>

            {/* Info Box */}
            <View style={styles.infoBox}>
              <MaterialCommunityIcons
                name="information-outline"
                size={16}
                color={COLORS.primary}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.infoText}>
                Coordinates are in millimeters. Preview exact placement after adding.
              </Text>
            </View>

            {/* Error Display */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {isProcessing && (
              <View style={styles.processingBox}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.processingText}>Processing...</Text>
              </View>
            )}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onCancel}
                disabled={isProcessing}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, isProcessing && styles.confirmBtnDisabled]}
                onPress={addTextToPdf}
                disabled={!textContent.trim() || isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="text-box-plus" size={16} color="#fff" />
                    <Text style={styles.confirmBtnText}>Add Text</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    marginTop: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgSecondary,
    gap: 12,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.bgSecondary,
  },
  pageControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pageButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.bgSecondary,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 6,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  numberInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.bgSecondary,
  },
  sliderLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    minWidth: 20,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorOption: {
    flex: '50%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  colorOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  colorText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bgSecondary,
  },
  processingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom: 10,
    gap: 8,
  },
  processingText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
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
