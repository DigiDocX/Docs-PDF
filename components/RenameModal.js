import React from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';

/**
 * RenameModal Component
 * Modal dialog for renaming PDFs
 */
export const RenameModal = ({
  visible,
  fileName,
  newFileName,
  onChangeText,
  onCancel,
  onConfirm,
}) => {
  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onCancel}
      animationType="fade"
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>Rename PDF</Text>
          <Text style={styles.subtitle}>{fileName}</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter new name (without .pdf)"
            placeholderTextColor="#666"
            value={newFileName}
            onChangeText={onChangeText}
            maxLength={50}
          />

          <View style={styles.buttons}>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.confirmBtn]} onPress={onConfirm}>
              <Text style={styles.confirmBtnText}>Rename</Text>
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
  },
  content: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  input: {
    backgroundColor: COLORS.bgTertiary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.bgLight,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontSize: 15,
    marginBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: COLORS.bgTertiary,
  },
  cancelBtnText: {
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  confirmBtn: {
    backgroundColor: COLORS.accent,
  },
  confirmBtnText: {
    color: COLORS.text,
    fontWeight: '600',
  },
});
