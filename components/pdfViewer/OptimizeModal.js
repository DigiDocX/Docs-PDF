import React from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/theme';
import { formatFileSize } from '../../utils/pdfUtils';

export const OptimizeModal = ({
  visible,
  isOptimizing,
  optimizeProfiles,
  selectedOptimizeKey,
  onSelectProfile,
  sizeEstimate,
  minimumSizeMb,
  onChangeMinimumSize,
  onCancel,
  onApply,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isOptimizing) onCancel();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Optimize PDF</Text>
          <Text style={styles.text}>
            Choose one output profile and rebuild this file with adjusted image quality.
          </Text>

          {Object.values(optimizeProfiles).map((profile) => {
            const isSelected = selectedOptimizeKey === profile.key;
            return (
              <TouchableOpacity
                key={profile.key}
                style={[styles.option, isSelected && styles.optionActive]}
                onPress={() => onSelectProfile(profile.key)}
                disabled={isOptimizing}
              >
                <View style={styles.radio}>
                  {isSelected ? <View style={styles.radioInner} /> : null}
                </View>
                <Text style={styles.optionText}>{profile.label}</Text>
              </TouchableOpacity>
            );
          })}

          <View style={styles.estimateBox}>
            <Text style={styles.estimateText}>Estimated Size</Text>
            <Text style={styles.estimateText}>Before: {formatFileSize(sizeEstimate.beforeSize)}</Text>
            <Text style={styles.estimateText}>After: {formatFileSize(sizeEstimate.estimatedAfterSize)}</Text>
          </View>

          {selectedOptimizeKey === 'original' ? (
            <View style={styles.minimumSizeWrap}>
              <Text style={styles.minimumSizeLabel}>Minimum Size (MB, optional)</Text>
              <TextInput
                value={minimumSizeMb}
                onChangeText={onChangeMinimumSize}
                keyboardType="decimal-pad"
                placeholder="e.g. 2.5"
                placeholderTextColor={COLORS.textMuted}
                style={styles.minimumSizeInput}
                editable={!isOptimizing}
              />
              <Text style={styles.minimumSizeHint}>
                Use this when submissions require files larger than a threshold.
              </Text>
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={isOptimizing}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={onApply}
              disabled={isOptimizing}
            >
              {isOptimizing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmText}>Apply</Text>
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
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  text: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  option: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionActive: {
    borderColor: COLORS.primary,
  },
  optionText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  estimateBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.bg,
  },
  estimateText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  minimumSizeWrap: {
    gap: 6,
  },
  minimumSizeLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  minimumSizeInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  minimumSizeHint: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  cancelText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  confirmText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
