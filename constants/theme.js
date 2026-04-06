import { StyleSheet } from 'react-native';

export const COLORS = {
  bg: '#0a0a14',
  bgSecondary: '#1a1a2e',
  bgTertiary: '#2a2a4e',
  bgLight: '#3a3a5f',
  border: '#2a2a4e',
  text: '#fff',
  textMuted: '#888',
  textDark: '#666',
  accent: '#5a4fcf',
  accentLight: '#8ab4f8',
  primary: '#3a5f8f',
  secondary: '#4a3f5f',
  danger: '#5f3a3a',
  dangerText: '#ff6b6b',
  overlay: 'rgba(0, 0, 0, 0.8)',
  overlayLight: 'rgba(10, 10, 20, 0.6)',
};

export const STYLES = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  actionSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  selectBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a5f8f',
  },
  selectBtnText: {
    color: COLORS.accentLight,
    fontWeight: '600',
    fontSize: 15,
  },
  selectedCount: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 8,
    marginLeft: 2,
  },
  createBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  createBtnText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
});
