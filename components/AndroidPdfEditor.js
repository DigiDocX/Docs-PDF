import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * Stub component for Android PDF annotation editor
 * This component provides a fallback UI when native Android PDF editing is requested
 * Full implementation would require native Android module integration
 */
export const AndroidPdfEditor = ({
  pdfUri,
  pdfPassword,
  initialEditing,
  onLoadComplete,
  onPageChanged,
  onError,
  onAnnotationsExported,
}) => {
  React.useEffect(() => {
    // Notify parent that PDF is "loaded"
    if (onLoadComplete) {
      onLoadComplete(1);
    }
  }, [onLoadComplete]);

  const handleInfoPress = () => {
    Alert.alert(
      'Feature Not Available',
      'Android native PDF annotation editor requires native module integration. ' +
        'For now, use the PDF painter or annotation tools available in the standard viewer.',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <MaterialCommunityIcons
          name="pencil-off"
          size={56}
          color="#999"
          style={styles.icon}
        />
        <Text style={styles.title}>PDF Annotation</Text>
        <Text style={styles.message}>
          Android native PDF annotation editor is not yet available
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleInfoPress}>
          <Text style={styles.buttonText}>More Info</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  icon: {
    marginBottom: 16,
    opacity: 0.5,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
