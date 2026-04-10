import React from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { PDFCard } from './PDFCard';
import { COLORS, STYLES } from '../constants/theme';

/**
 * PDFList Component
 * Displays list of PDFs or empty state
 */
export const PDFList = ({
  pdfItems,
  onView,
  onRename,
  onDelete,
  isSelectionMode,
  selectedPDFs = [],
  onToggleSelect,
  showActions = true,
  emptyTitle = 'No PDFs Yet',
  emptySubtitle = 'Select images and create your first PDF',
}) => {
  if (pdfItems.length === 0) {
    return (
      <View style={STYLES.emptyState}>
        <Text style={STYLES.emptyTitle}>{emptyTitle}</Text>
        <Text style={STYLES.emptySubtitle}>{emptySubtitle}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={pdfItems}
      renderItem={({ item }) => (
        <PDFCard
          item={item}
          onView={onView}
          onRename={onRename}
          onDelete={onDelete}
          isSelected={selectedPDFs.some(p => p.uri === item.uri)}
          isSelectionMode={isSelectionMode}
          onToggleSelect={onToggleSelect}
          showActions={showActions}
        />
      )}
      keyExtractor={(item) => item.id}
      contentContainerStyle={STYLES.listContent}
    />
  );
};
