import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { NativePdf } from '../utils/nativeModules';
import { ensureFileUri } from '../utils/pdfUtils';
import { COLORS } from '../constants/theme';

export const PDFEditGrid = ({ pdfItem, pdfVersion, pageCount, onCancel, onApply }) => {
  // We track selections: Array of page indexes (0-based)
  const [selectedPages, setSelectedPages] = useState([]);
  
  // Track changes to be applied. Map of pageIndex -> edit data (e.g. { deleted: true, rotation: 90 })
  const [changes, setChanges] = useState({});

  const toggleSelection = useCallback((index) => {
    setSelectedPages(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  }, []);

  const handleRotate = useCallback(() => {
    if (selectedPages.length === 0) return;
    setChanges(prev => {
      const next = { ...prev };
      selectedPages.forEach(idx => {
        const current = next[idx] || { deleted: false, rotation: 0 };
        next[idx] = { ...current, rotation: (current.rotation + 90) % 360 };
      });
      return next;
    });
  }, [selectedPages]);

  const handleDelete = useCallback(() => {
    if (selectedPages.length === 0) return;
    setChanges(prev => {
      const next = { ...prev };
      selectedPages.forEach(idx => {
        const current = next[idx] || { deleted: false, rotation: 0 };
        next[idx] = { ...current, deleted: !current.deleted }; // toggle deletion
      });
      return next;
    });
    // optionally clear selection after delete
    setSelectedPages([]);
  }, [selectedPages]);

  const handleSplit = useCallback(() => {
    if (selectedPages.length === 0) return;
    Alert.alert(
      'Split PDF', 
      `Extract these ${selectedPages.length} pages to a new PDF and remove them from here?`,
      [
        { text: 'Cancel' },
        {
          text: 'Split',
          style: 'destructive',
          onPress: () => {
            onApply(pdfItem.uri, [{ action: 'SPLIT', pages: selectedPages }]);
          }
        }
      ]
    );
  }, [selectedPages, pdfItem.uri, onApply]);

  const commitChanges = useCallback(() => {
    // Generate changesList array
    const changesList = [];
    Object.keys(changes).forEach(pageIdxStr => {
      const pageIndex = parseInt(pageIdxStr, 10);
      const change = changes[pageIdxStr];
      if (change.deleted) {
        changesList.push({ action: 'DELETE', pageIndex });
      } else if (change.rotation > 0) {
        // e.g. rotation of 90, 180, 270
        // We can just pass the final rotation angle to apply
        changesList.push({ action: 'ROTATE', pageIndex, angle: change.rotation });
      }
    });

    if (changesList.length === 0) {
      onCancel();
      return;
    }

    onApply(pdfItem.uri, changesList);
  }, [changes, pdfItem.uri, onApply, onCancel]);

  const renderItem = useCallback(({ item: pageNumber, index }) => {
    const isSelected = selectedPages.includes(index);
    const changeParams = changes[index] || {};
    const isDeleted = changeParams.deleted;
    const rotation = changeParams.rotation || 0;

    return (
      <TouchableOpacity 
        style={[styles.pageContainer, isSelected && styles.selectedContainer]}
        onPress={() => toggleSelection(index)}
        activeOpacity={0.8}
      >
        <View style={styles.thumbnailWrapper}>
          <NativePdf
            style={[
              styles.thumbnail, 
              isDeleted && styles.thumbnailDeleted,
              { transform: [{ rotate: `${rotation}deg` }] }
            ]}
            source={{ uri: ensureFileUri(pdfItem.uri) }}
            page={pageNumber}
            singlePage={true}
            trustAllCerts={false}
          />
          {isDeleted && (
            <View style={styles.deletedOverlay}>
              <Text style={styles.deletedText}>Deleted</Text>
            </View>
          )}
        </View>
        <View style={styles.pageNumberBadge}>
          <Text style={styles.pageNumberText}>{pageNumber}</Text>
        </View>
        {isSelected && (
          <View style={styles.checkbox}>
            <Text style={styles.checkIcon}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [selectedPages, changes, toggleSelection, pdfItem]);

  const data = useMemo(() => Array.from({ length: pageCount }, (_, i) => i + 1), [pageCount]);

  return (
    <View style={styles.container}>
      {/* Top Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolBtn} onPress={onCancel}>
          <Text style={styles.toolBtnText}>Cancel</Text>
        </TouchableOpacity>
        
        <Text style={styles.title}>
          {selectedPages.length > 0 ? `${selectedPages.length} Selected` : 'Select Pages'}
        </Text>

        <TouchableOpacity 
          style={[styles.toolBtn, styles.applyBtn]} 
          onPress={commitChanges}
        >
          <Text style={styles.applyBtnText}>Apply</Text>
        </TouchableOpacity>
      </View>

      {/* Grid */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.toString()}
        numColumns={2}
        renderItem={renderItem}
        contentContainerStyle={styles.gridContent}
      />

      {/* Bottom Action Bar */}
      {selectedPages.length > 0 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomBtn} onPress={handleRotate}>
            <Text style={styles.bottomBtnText}>🔄 Rotate</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomBtn} onPress={handleSplit}>
            <Text style={styles.bottomBtnText}>✂️ Split</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.bottomBtn, styles.deleteBtn]} onPress={handleDelete}>
            <Text style={[styles.bottomBtnText, styles.deleteBtnText]}>🗑️ Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  toolBtn: {
    padding: 8,
  },
  toolBtnText: {
    color: '#8ab4f8',
    fontSize: 15,
  },
  applyBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  applyBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  gridContent: {
    padding: 12,
  },
  pageContainer: {
    flex: 1,
    margin: 8,
    aspectRatio: 0.7,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  selectedContainer: {
    borderColor: COLORS.accent,
  },
  thumbnailWrapper: {
    flex: 1,
    backgroundColor: '#eee',
  },
  thumbnail: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  thumbnailDeleted: {
    opacity: 0.2,
  },
  deletedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(50, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletedText: {
    color: '#ff6b6b',
    fontWeight: 'bold',
    fontSize: 16,
    transform: [{ rotate: '-45deg' }],
  },
  pageNumberBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pageNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkbox: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: COLORS.accent,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 24,
    left: '10%',
    right: '10%',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 30, 0.9)',
    borderRadius: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bottomBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bottomBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteBtnText: {
    color: '#ff6b6b',
  },
});
