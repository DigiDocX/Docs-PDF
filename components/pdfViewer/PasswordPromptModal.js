import React from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/theme';

export const PasswordPromptModal = ({
  visible,
  message,
  passwordInput,
  onChangePassword,
  onCancel,
  onSubmit,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Password Required</Text>
          <Text style={styles.text}>{message}</Text>
          <TextInput
            value={passwordInput}
            onChangeText={onChangePassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter PDF password"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
          />
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onSubmit}>
              <Text style={styles.confirmText}>Open</Text>
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
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
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
