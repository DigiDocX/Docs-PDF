import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { zip } from 'react-native-zip-archive';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativePdf, isExpoGo } from '../utils/nativeModules';
import { ensureFileUri } from '../utils/pdfUtils';
import { fallbackOpenWithShare } from '../utils/fallback';
import { COLORS } from '../constants/theme';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * PDFViewer Component
 * Handles native PDF rendering with graceful fallback to sharing
 */
export const PDFViewer = ({ pdfItem, onLoadComplete, onClose, onEnterEditMode, pdfVersion }) => {
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [viewerUri, setViewerUri] = useState(() => ensureFileUri(pdfItem?.uri));
  const [isZipping, setIsZipping] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handlePrint = async () => {
    try {
      await Print.printAsync({ uri: viewerUri });
    } catch (err) {
      Alert.alert('Print Error', err.message);
    }
  };

  const handleZip = async () => {
    if (isZipping) return;
    setIsZipping(true);
    try {
      const tempDir = `${FileSystem.cacheDirectory}zip_temp_${Date.now()}/`;
      await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });

      const fileName = pdfItem?.name || 'document.pdf';
      const tempFilePath = `${tempDir}${fileName}`;
      await FileSystem.copyAsync({
        from: viewerUri,
        to: tempFilePath
      });

      const zipName = fileName.replace(/\.pdf$/i, '') + '.zip';
      const zipsDir = `${FileSystem.documentDirectory}zips/`;
      const dirInfo = await FileSystem.getInfoAsync(zipsDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(zipsDir, { intermediates: true });
      }
      const targetZipPath = `${zipsDir}${zipName}`;

      const fileInfo = await FileSystem.getInfoAsync(targetZipPath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(targetZipPath);
      }

      await zip(tempDir, targetZipPath);
      await Sharing.shareAsync(targetZipPath);
      await FileSystem.deleteAsync(tempDir, { idempotent: true });
    } catch (err) {
      Alert.alert('Zip Error', err.message);
    } finally {
      setIsZipping(false);
    }
  };

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

        {/* Floating Action Menu (FAB) */}
        <View style={styles.fabContainer}>
          {isMenuOpen && (
            <View style={styles.menuItems}>
              <TouchableOpacity
                style={[styles.menuItemBtn, isZipping && styles.tbButtonDisabled]}
                onPress={() => { setIsMenuOpen(false); handlePrint(); }}
                disabled={isZipping}
              >
                <MaterialCommunityIcons name="printer" size={24} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItemBtn, isZipping && styles.tbButtonDisabled]}
                onPress={() => { setIsMenuOpen(false); handleZip(); }}
                disabled={isZipping}
              >
                {isZipping ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="zip-box" size={24} color="#fff" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItemBtn, isZipping && styles.tbButtonDisabled]}
                onPress={() => { setIsMenuOpen(false); onEnterEditMode?.(pageCount); }}
                disabled={isZipping}
              >
                <MaterialCommunityIcons name="file-document-edit-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.fabBtn}
            onPress={() => setIsMenuOpen(!isMenuOpen)}
          >
            <MaterialCommunityIcons name={isMenuOpen ? "close" : "dots-vertical"} size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {isZipping && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Creating ZIP Archive...</Text>
          </View>
        )}
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
  fabContainer: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    alignItems: 'center',
  },
  menuItems: {
    marginBottom: 16,
    gap: 16,
  },
  menuItemBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(20, 20, 30, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  fabBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  tbButtonDisabled: {
    opacity: 0.5,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  tbButtonTextDisabled: {
    color: '#888',
  },
});
