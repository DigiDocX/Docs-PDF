import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS, STYLES } from '../constants/theme';

/**
 * Header Component
 * Displays title, subtitle, and action buttons
 */
export const Header = ({
  pdfCount,
  selectedImagesCount,
  onSelectImages,
  onCreatePDF,
  isLoading,
}) => {
  return (
    <>
      <View style={STYLES.header}>
        <Text style={STYLES.headerTitle}>PDF Library</Text>
        <Text style={STYLES.headerSubtitle}>{pdfCount} files</Text>
      </View>

      <View style={STYLES.actionSection}>
        <TouchableOpacity style={STYLES.selectBtn} onPress={onSelectImages}>
          <Text style={STYLES.selectBtnText}>Select Images</Text>
        </TouchableOpacity>

        {selectedImagesCount > 0 && (
          <>
            <Text style={STYLES.selectedCount}>
              {selectedImagesCount} image{selectedImagesCount !== 1 ? 's' : ''} selected
            </Text>
            <TouchableOpacity
              style={STYLES.createBtn}
              onPress={onCreatePDF}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={STYLES.createBtnText}>Create & Save PDF</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </>
  );
};
