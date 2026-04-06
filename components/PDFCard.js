import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatFileSize, formatDate } from '../utils/pdfUtils';
import { COLORS } from '../constants/theme';

/**
 * PDFCard Component
 * Individual PDF item in the FlatList
 */
export const PDFCard = ({ item, onView, onRename, onDelete, isSelected, isSelectionMode, onToggleSelect }) => {
  return (
    <TouchableOpacity 
      activeOpacity={0.8}
      onPress={() => isSelectionMode ? onToggleSelect?.(item) : onView(item)}
      onLongPress={() => onToggleSelect?.(item)}
      style={[
        styles.card, 
        isSelected && styles.cardSelected 
      ]}
    >
      <View style={styles.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {isSelectionMode && (
             <MaterialCommunityIcons 
               name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"} 
               size={20} 
               color={isSelected ? COLORS.primary : COLORS.textMuted}
               style={{ marginRight: 8, marginBottom: 6 }}
             />
          )}
          <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
          <Text style={styles.size}>{formatFileSize(item.size)}</Text>
        </View>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity style={[styles.btn, styles.viewBtn]} onPress={() => onView(item)}>
          <Text style={styles.btnText}>View</Text>
        </TouchableOpacity>



        <TouchableOpacity style={[styles.btn, styles.renameBtn]} onPress={() => onRename(item)}>
          <Text style={styles.btnText}>Rename</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.deleteBtn]} onPress={() => onDelete(item)}>
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    marginVertical: 8,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  cardSelected: {
    backgroundColor: '#1E2333',
    borderColor: COLORS.primary,
    borderWidth: 1,
  },
  info: {
    marginBottom: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginRight: 12,
  },
  size: {
    fontSize: 12,
    color: COLORS.textDark,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewBtn: {
    backgroundColor: COLORS.primary,
  },

  renameBtn: {
    backgroundColor: COLORS.secondary,
  },
  deleteBtn: {
    backgroundColor: COLORS.danger,
  },
  btnText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBtnText: {
    color: COLORS.dangerText,
    fontSize: 12,
    fontWeight: '600',
  },
});
