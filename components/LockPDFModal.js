import React, { useMemo, useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS } from '../constants/theme';

const getPasswordStrength = (password) => {
  if (!password) return { score: 0, label: 'Empty', color: '#64748b' };

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score, label: 'Weak', color: '#ef4444' };
  if (score <= 3) return { score, label: 'Medium', color: '#f59e0b' };
  return { score, label: 'Strong', color: '#22c55e' };
};

export const LockPDFModal = ({ visible, fileName, onCancel, onConfirm, isLoading }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (!visible) {
      setPassword('');
      setConfirmPassword('');
      setErrorText('');
    }
  }, [visible]);

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const strengthBarWidth = `${Math.max(5, (strength.score / 5) * 100)}%`;

  const handleConfirm = async () => {
    if (password.length < 6) {
      setErrorText('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorText('Password and confirm password do not match.');
      return;
    }

    setErrorText('');
    await onConfirm(password);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Lock PDF</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {fileName || 'Selected PDF'}
          </Text>

          <Text style={styles.label}>Password</Text>
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!isLoading}
            placeholder="Enter password"
            placeholderTextColor="#8090b0"
            style={styles.input}
          />

          <View style={styles.meterRow}>
            <Text style={styles.meterLabel}>Strength: {strength.label}</Text>
            <View style={styles.meterTrack}>
              <View style={[styles.meterFill, { width: strengthBarWidth, backgroundColor: strength.color }]} />
            </View>
          </View>

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!isLoading}
            placeholder="Confirm password"
            placeholderTextColor="#8090b0"
            style={styles.input}
          />

          <Text style={styles.warningText}>
            Warning: this password cannot be recovered if forgotten.
          </Text>

          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel} disabled={isLoading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton, isLoading && styles.disabledButton]}
              onPress={handleConfirm}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmText}>Encrypt PDF</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  label: {
    color: COLORS.text,
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
    marginBottom: 10,
  },
  meterRow: {
    marginBottom: 10,
  },
  meterLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginBottom: 4,
  },
  meterTrack: {
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  meterFill: {
    height: 8,
    borderRadius: 8,
  },
  warningText: {
    color: '#fca5a5',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 8,
    lineHeight: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmButton: {
    backgroundColor: '#2563eb',
  },
  disabledButton: {
    opacity: 0.65,
  },
  cancelText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  confirmText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});