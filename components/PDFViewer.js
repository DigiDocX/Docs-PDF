import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { NativePdf, isExpoGo } from '../utils/nativeModules';
import { ensureFileUri } from '../utils/pdfUtils';
import { fallbackOpenWithShare } from '../utils/fallback';
import { COLORS } from '../constants/theme';
import * as FileSystem from 'expo-file-system';

/**
 * PDFViewer Component
 * Handles native PDF rendering with graceful fallback to sharing
 */
export const PDFViewer = ({ pdfItem, onLoadComplete, onClose, onEnterEditMode, pdfVersion }) => {
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [viewerUri, setViewerUri] = useState(() => ensureFileUri(pdfItem?.uri));

  React.useEffect(() => {
    let isMounted = true;
    const processUri = async () => {
      // Only do the temp copy logic when the pdfVersion actually updates due to edits
      if (!pdfItem?.uri || !pdfVersion || pdfVersion <= 1) return;
      try {
        const tempFile = `${FileSystem.cacheDirectory}viewer_cache_${pdfVersion}_${pdfItem.name}`;
        await FileSystem.copyAsync({
          from: pdfItem.uri,
          to: tempFile
        });
        if (isMounted) setViewerUri(ensureFileUri(tempFile));
      } catch (err) {
        console.warn("Failed to create temporary cache file for viewer:", err);
        if (isMounted) setViewerUri(ensureFileUri(pdfItem.uri));
      }
    };
    processUri();
    return () => { isMounted = false; };
  }, [pdfItem, pdfVersion]);
  if (!pdfItem?.uri) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Invalid PDF item</Text>
      </View>
    );
  }

  // Native viewer available
  if (!isExpoGo && NativePdf && viewerUri) {
    return (
      <View style={{ flex: 1 }}>
        <NativePdf
          source={{ uri: viewerUri, cache: true }}
          trustAllCerts={false}
          style={{ flex: 1 }}
          onLoadComplete={(numberOfPages) => {
            setPageCount(numberOfPages);
            onLoadComplete?.();
          }}
          onPageChanged={(page, numberOfPages) => {
            setActivePageIndex(page - 1); // Native library returns 1-based index
          }}
          onError={async () => {
            onLoadComplete?.();
            Alert.alert('Viewer Error', 'PDF viewer failed. Opening fallback share.');
            try {
              await fallbackOpenWithShare(pdfItem.uri);
            } catch (error) {
              Alert.alert('Error', error.message || 'Fallback failed');
            }
            onClose?.();
          }}
        />

        {/* Floating Toolbar */}
        <View style={styles.floatingToolbar}>
          <TouchableOpacity
            style={styles.tbButton}
            onPress={() => onEnterEditMode?.(pageCount)}
          >
            <Text style={styles.tbButtonText}>✏️ Edit Pages</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Fallback UI when native viewer unavailable
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>In-app PDF Viewer Unavailable</Text>
      <Text style={styles.errorText}>
        PDF viewer requires a Development Build. Use expo prebuild to create a native app.
      </Text>
      <TouchableOpacity
        style={styles.fallbackBtn}
        onPress={async () => {
          try {
            await fallbackOpenWithShare(pdfItem.uri);
          } catch (error) {
            Alert.alert('Error', error.message || 'Failed to open PDF');
          }
          onClose?.();
        }}
      >
        <Text style={styles.fallbackBtnText}>Open with Share</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  fallbackBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  fallbackBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
  floatingToolbar: {
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
  tbButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tbButtonDisabled: {
    opacity: 0.5,
  },
  tbButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  tbButtonTextDisabled: {
    color: '#888',
  },
});
