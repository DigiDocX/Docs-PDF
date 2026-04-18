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

  /**
   * Apply sequential page numbers to all pages in the PDF
   * @param {string} pdfPath - Full file system path to the PDF
   * @param {Object} options - Numbering configuration
   * @param {function} onSuccess - Callback function when numbering is applied
   *                               Receives the version timestamp for UI updates
   */
  const applyPageNumbers = useCallback(
    async (pdfPath, options = {}, onSuccess) => {
      if (!pdfPath) {
        const errorMsg = 'PDF path is required';
        setError(errorMsg);
        Alert.alert('Invalid Input', errorMsg);
        return null;
      }

      const startNumber = Number.parseInt(options.startNumber, 10);
      if (!Number.isInteger(startNumber) || startNumber < 1) {
        const errorMsg = 'Start number must be an integer greater than or equal to 1';
        setError(errorMsg);
        Alert.alert('Invalid Input', errorMsg);
        return null;
      }

      setIsProcessing(true);
      setError(null);

      try {
        const version = await managePdfPages(pdfPath, 'APPLY_PAGE_NUMBERS', {
          startNumber,
          includeTotal: Boolean(options.includeTotal),
          position: options.position || 'BOTTOM_CENTER',
          fontSize: Number.parseFloat(options.fontSize) || 11,
          margin: Number.parseFloat(options.margin) || 28,
          color: options.color || '#333333',
        });

        if (onSuccess) {
          onSuccess(version);
        }

        Alert.alert('Success', 'Page numbers were applied to all pages.');
        return version;
      } catch (err) {
        const errorMsg = err?.message || 'Failed to apply page numbers';
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
    applyPageNumbers,
    error,
    clearError,
  };
};
