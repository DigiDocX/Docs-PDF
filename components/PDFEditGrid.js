import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, Image, ActivityIndicator } from 'react-native';
import { NativePdf } from '../utils/nativeModules';
import ExpoPdfToImageModule from 'expo-pdf-to-image';
import { ensureFileUri } from '../utils/pdfUtils';
import { COLORS } from '../constants/theme';

export const PDFEditGrid = ({ pdfItem, pdfVersion, pageCount, onCancel, onApply }) => {
  const [mode, setMode] = useState('batch');
  const [selectedPages, setSelectedPages] = useState([]);
  const [changes, setChanges] = useState({});
  const [selectedOrder, setSelectedOrder] = useState([]);
  const [thumbnailUris, setThumbnailUris] = useState([]);
  const [isLoadingThumbs, setIsLoadingThumbs] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplyingBatch, setIsApplyingBatch] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const generateThumbnails = async () => {
      if (!pdfItem?.uri) {
        setThumbnailUris([]);
        return;
      }

      setIsLoadingThumbs(true);
      try {
        const pageImages = await ExpoPdfToImageModule.convertPdfToImages(ensureFileUri(pdfItem.uri));
        if (!isMounted) return;
        setThumbnailUris(pageImages.map((uri) => ensureFileUri(uri)));
      } catch (error) {
        console.warn('Thumbnail generation failed:', error);
        if (!isMounted) return;
        // Keep placeholders so fallback page render can still be shown.
        setThumbnailUris(Array.from({ length: pageCount }, () => null));
      } finally {
        if (isMounted) {
          setIsLoadingThumbs(false);
        }
      }
    };

    setMode('batch');
    setSelectedPages([]);
    setChanges({});
    setSelectedOrder([]);
    generateThumbnails();

    return () => {
      isMounted = false;
    };
  }, [pdfItem?.uri, pdfVersion, pageCount]);

  const toggleBatchSelection = useCallback((index) => {
    setSelectedPages((prev) =>
      prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index]
    );
  }, []);

  const togglePageInSequence = useCallback((index) => {
    setSelectedOrder((prev) => {
      const currentPos = prev.indexOf(index);
      if (currentPos >= 0) {
        return prev.filter((item) => item !== index);
      }
      return [...prev, index];
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPages([]);
    setChanges({});
    setSelectedOrder([]);
  }, []);

  const handleRotate = useCallback(() => {
    if (selectedPages.length === 0) {
      Alert.alert('Select Pages', 'Pick one or more pages first.');
      return;
    }

    setChanges((prev) => {
      const next = { ...prev };
      selectedPages.forEach((idx) => {
        const current = next[idx] || { deleted: false, rotation: 0 };
        next[idx] = {
          ...current,
          rotation: (current.rotation + 90) % 360,
        };
      });
      return next;
    });
  }, [selectedPages]);

  const handleDeleteToggle = useCallback(() => {
    if (selectedPages.length === 0) {
      Alert.alert('Select Pages', 'Pick one or more pages first.');
      return;
    }

    setChanges((prev) => {
      const next = { ...prev };
      selectedPages.forEach((idx) => {
        const current = next[idx] || { deleted: false, rotation: 0 };
        next[idx] = {
          ...current,
          deleted: !current.deleted,
        };
      });
      return next;
    });
  }, [selectedPages]);

  const handleSplit = useCallback(() => {
    if (selectedPages.length === 0) {
      Alert.alert('Select Pages', 'Pick one or more pages first.');
      return;
    }

    Alert.alert(
      'Split PDF',
      `Create a new PDF from ${selectedPages.length} selected page(s) and remove them from the current PDF?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Split',
          style: 'destructive',
          onPress: () => {
            onApply(pdfItem.uri, [{ action: 'SPLIT', pages: [...selectedPages].sort((a, b) => a - b) }]);
          },
        },
      ]
    );
  }, [onApply, pdfItem?.uri, selectedPages]);

  const applyBatchChanges = useCallback(async () => {
    const changesList = [];

    Object.keys(changes).forEach((pageIdxStr) => {
      const pageIndex = parseInt(pageIdxStr, 10);
      const change = changes[pageIdxStr];
      if (change.deleted) {
        changesList.push({ action: 'DELETE', pageIndex });
      }
      if (!change.deleted && change.rotation > 0) {
        changesList.push({ action: 'ROTATE', pageIndex, angle: change.rotation });
      }
    });

    if (changesList.length === 0) {
      Alert.alert('No Changes', 'Use Rotate/Delete actions first, then apply.');
      return;
    }

    setIsApplyingBatch(true);
    try {
      await onApply(pdfItem.uri, changesList);
    } finally {
      setIsApplyingBatch(false);
    }
  }, [changes, onApply, pdfItem?.uri]);

  const generateRearrangedPdf = useCallback(async () => {
    if (selectedOrder.length === 0) {
      Alert.alert('Select Pages', 'Tap pages in the order you want them in the new PDF.');
      return;
    }

    setIsGenerating(true);
    try {
      await onApply(pdfItem.uri, [{ action: 'REARRANGE', pages: selectedOrder }]);
    } finally {
      setIsGenerating(false);
    }
  }, [onApply, pdfItem?.uri, selectedOrder]);

  const data = useMemo(() => {
    return Array.from({ length: pageCount }, (_, index) => ({
      originalIndex: index,
      pageNumber: index + 1,
      thumbnailUri: thumbnailUris[index] || null,
    }));
  }, [pageCount, thumbnailUris]);

  const renderItem = useCallback(({ item }) => {
    const sequenceNumber = selectedOrder.indexOf(item.originalIndex) + 1;
    const isSequenceSelected = sequenceNumber > 0;
    const isBatchSelected = selectedPages.includes(item.originalIndex);
    const changeParams = changes[item.originalIndex] || {};
    const rotation = changeParams.rotation || 0;
    const isDeleted = !!changeParams.deleted;
    const isSelected = mode === 'rearrange' ? isSequenceSelected : isBatchSelected;

    const onPress = () => {
      if (mode === 'rearrange') {
        togglePageInSequence(item.originalIndex);
      } else {
        toggleBatchSelection(item.originalIndex);
      }
    };

    return (
      <TouchableOpacity 
        style={[styles.pageContainer, isSelected && styles.selectedContainer]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View style={styles.thumbnailWrapper}>
          {item.thumbnailUri ? (
            <Image source={{ uri: item.thumbnailUri }} style={styles.thumbnailImage} resizeMode="cover" />
          ) : (
            <NativePdf
              style={styles.thumbnailFallback}
              source={{ uri: ensureFileUri(pdfItem.uri) }}
              page={item.pageNumber}
              singlePage={true}
              trustAllCerts={false}
            />
          )}
          {mode === 'batch' && isDeleted && (
            <View style={styles.deletedOverlay}>
              <Text style={styles.deletedText}>Deleted</Text>
            </View>
          )}
        </View>
        <View style={styles.pageNumberBadge}>
          <Text style={styles.pageNumberText}>Page {item.pageNumber}</Text>
        </View>
        {mode === 'rearrange' && sequenceNumber > 0 && (
          <View style={styles.sequenceBadge}>
            <Text style={styles.sequenceText}>{sequenceNumber}</Text>
          </View>
        )}
        {mode === 'batch' && isBatchSelected && (
          <View style={styles.checkBadge}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        )}
        {mode === 'batch' && rotation > 0 && !isDeleted && (
          <View style={styles.rotationBadge}>
            <Text style={styles.rotationText}>{rotation}deg</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [selectedOrder, selectedPages, changes, mode, togglePageInSequence, toggleBatchSelection, pdfItem]);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolBtn} onPress={onCancel}>
          <Text style={styles.toolBtnText}>Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          {mode === 'rearrange'
            ? (selectedOrder.length > 0 ? `${selectedOrder.length} In Sequence` : 'Tap Pages To Sequence')
            : (selectedPages.length > 0 ? `${selectedPages.length} Selected` : 'Select Pages To Edit')}
        </Text>

        <TouchableOpacity style={styles.toolBtn} onPress={clearSelection}>
          <Text style={styles.toolBtnText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {isLoadingThumbs && (
        <View style={styles.loadingArea}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.loadingText}>Generating page thumbnails...</Text>
        </View>
      )}

      <FlatList
        data={data}
        keyExtractor={(item) => item.pageNumber.toString()}
        numColumns={3}
        renderItem={renderItem}
        contentContainerStyle={styles.gridContent}
      />

      <View style={styles.generateBar}>
        <View style={styles.modeSwitcher}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'batch' && styles.modeBtnActive]}
            onPress={() => setMode('batch')}
          >
            <Text style={[styles.modeBtnText, mode === 'batch' && styles.modeBtnTextActive]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'rearrange' && styles.modeBtnActive]}
            onPress={() => setMode('rearrange')}
          >
            <Text style={[styles.modeBtnText, mode === 'rearrange' && styles.modeBtnTextActive]}>Rearrange</Text>
          </TouchableOpacity>
        </View>

        {mode === 'batch' ? (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleRotate}>
              <Text style={styles.actionBtnText}>Rotate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleDeleteToggle}>
              <Text style={styles.actionBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleSplit}>
              <Text style={styles.actionBtnText}>Split</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.generateBtn,
            mode === 'rearrange'
              ? (selectedOrder.length === 0 || isGenerating) && styles.generateBtnDisabled
              : (isApplyingBatch && styles.generateBtnDisabled),
          ]}
          onPress={mode === 'rearrange' ? generateRearrangedPdf : applyBatchChanges}
          disabled={mode === 'rearrange' ? (selectedOrder.length === 0 || isGenerating) : isApplyingBatch}
        >
          {mode === 'rearrange' ? (
            isGenerating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.generateBtnText}>Generate Rearranged PDF</Text>
            )
          ) : (
            isApplyingBatch ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.generateBtnText}>Apply Edits</Text>
            )
          )}
        </TouchableOpacity>
      </View>
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
    fontSize: 14,
    fontWeight: '600',
  },
  toolBtn: {
    padding: 8,
  },
  toolBtnText: {
    color: '#8ab4f8',
    fontSize: 14,
  },
  loadingArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: COLORS.bgSecondary,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  gridContent: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 120,
  },
  pageContainer: {
    flex: 1,
    margin: 6,
    aspectRatio: 0.78,
    backgroundColor: '#fff',
    borderRadius: 10,
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
  thumbnailImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    flex: 1,
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
    fontSize: 11,
    fontWeight: 'bold',
  },
  deletedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(120, 0, 0, 0.4)',
  },
  deletedText: {
    color: '#ffd4d4',
    fontSize: 14,
    fontWeight: '700',
  },
  sequenceBadge: {
    position: 'absolute',
    top: 7,
    right: 8,
    backgroundColor: '#1e6cff',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  sequenceText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  checkBadge: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  checkText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  rotationBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  rotationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  generateBar: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    right: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 30, 0.94)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 9,
  },
  modeSwitcher: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 8,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: COLORS.accent,
  },
  modeBtnText: {
    color: '#d0daff',
    fontWeight: '600',
    fontSize: 13,
  },
  modeBtnTextActive: {
    color: '#fff',
  },
  actionsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  generateBtn: {
    width: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateBtnDisabled: {
    opacity: 0.5,
  },
  generateBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
