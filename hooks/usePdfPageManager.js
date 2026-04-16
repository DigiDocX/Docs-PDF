import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { managePdfPages } from '../utils/pdfUtils';

/**
 * Hook for managing PDF pages (add/insert blank pages)
 * Provides loading state, error handling, and version updates for re-rendering
 *
 * @returns {Object} Object with:
 *   - isProcessing: boolean - Loading state during PDF operation
 *   - addPageAtEnd: function - Add blank page to end of PDF
 *   - insertPageAt: function - Insert blank page at specific index
 *   - error: string - Last error message (null if no error)
 *   - clearError: function - Clear error state
 */
export const usePdfPageManager = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Add a blank A4 page to the end of the PDF
   * @param {string} pdfPath - Full file system path to the PDF
   * @param {function} onSuccess - Callback function when page is added successfully
   *                               Receives the version timestamp for UI updates
   */
  const addPageAtEnd = useCallback(
    async (pdfPath, onSuccess) => {
      setIsProcessing(true);
      setError(null);

      try {
        const version = await managePdfPages(pdfPath, 'ADD_END');
        
        if (onSuccess) {
          onSuccess(version);
        }

        Alert.alert('Success', 'Blank page added to the end of the PDF.');
        return version;
      } catch (err) {
        const errorMsg = err?.message || 'Failed to add page to PDF';
        setError(errorMsg);
        Alert.alert('Error', errorMsg);
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  /**
   * Insert a blank A4 page at a specific index
   * @param {string} pdfPath - Full file system path to the PDF
   * @param {number} pageIndex - 0-based index where to insert the page
   * @param {function} onSuccess - Callback function when page is inserted successfully
   *                               Receives the version timestamp for UI updates
   */
  const insertPageAt = useCallback(
    async (pdfPath, pageIndex, onSuccess) => {
      if (!Number.isInteger(pageIndex) || pageIndex < 0) {
        const errorMsg = 'Page index must be a non-negative integer';
        setError(errorMsg);
        Alert.alert('Invalid Input', errorMsg);
        return null;
      }

      setIsProcessing(true);
      setError(null);

      try {
        const version = await managePdfPages(pdfPath, 'INSERT_AT', pageIndex);

        if (onSuccess) {
          onSuccess(version);
        }

        Alert.alert(
          'Success',
          `Blank page inserted at position ${pageIndex + 1}.`
        );
        return version;
      } catch (err) {
        const errorMsg = err?.message || 'Failed to insert page into PDF';
        setError(errorMsg);
        Alert.alert('Error', errorMsg);
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  return {
    isProcessing,
    addPageAtEnd,
    insertPageAt,
    error,
    clearError,
  };
};
