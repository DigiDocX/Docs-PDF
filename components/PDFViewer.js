import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, Modal, TextInput, PanResponder, Platform } from 'react-native';
import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;
import * as Print from 'expo-print';
import Svg, { Path, Circle, Text as SvgText } from 'react-native-svg';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

import JSZip from 'jszip';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativePdf, isExpoGo } from '../utils/nativeModules';
import { ensureFileUri, formatFileSize } from '../utils/pdfUtils';
import { fallbackOpenWithShare } from '../utils/fallback';
import { LockPDFModal } from './LockPDFModal';
import { COLORS } from '../constants/theme';
import * as FileSystem from 'expo-file-system/legacy';
import { PasswordPromptModal } from './pdfViewer/PasswordPromptModal';
import { OptimizeModal } from './pdfViewer/OptimizeModal';
import { AndroidPdfEditor } from './AndroidPdfEditor';

/**
 * PDFViewer Component
 * Handles native PDF rendering with graceful fallback to sharing
 */
export const PDFViewer = ({
  pdfItem,
  onLoadComplete,
  onClose,
  onEnterEditMode,
  requestedAction,
  pdfVersion,
  onZipSaved,
  onLockPDF,
  onOptimizePDF,
  onUpscalePDF,
  onEstimateOptimization,
}) => {
  const DRAW_COLORS = ['#ff3b30', '#007aff', '#34c759', '#ffd60a'];

  const withVersionQuery = React.useCallback((uri) => {
    const normalized = ensureFileUri(uri);
    if (!normalized) return normalized;
    // Native local-file renderers can fail when query params are attached.
    if (normalized.startsWith('file://')) return normalized;
    const separator = normalized.includes('?') ? '&' : '?';
    return `${normalized}${separator}v=${Date.now()}`;
  }, []);

  const [activePageIndex, setActivePageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [viewerUri, setViewerUri] = useState(() => withVersionQuery(pdfItem?.uri));
  const [viewerPassword, setViewerPassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordPromptMessage, setPasswordPromptMessage] = useState('This PDF is password-protected. Enter password to continue.');
  const [isZipping, setIsZipping] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isPanMode, setIsPanMode] = useState(false);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [isTextMode, setIsTextMode] = useState(false);
  const [paths, setPaths] = useState([]);
  const [textAnnotations, setTextAnnotations] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeColor, setActiveColor] = useState(DRAW_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [canvasLayout, setCanvasLayout] = useState({ width: 1, height: 1 });
  const [eraserCursor, setEraserCursor] = useState({ visible: false, x: 0, y: 0, radius: 12 });
  const [activeTextDraft, setActiveTextDraft] = useState(null);
  const [isColorBarOpen, setIsColorBarOpen] = useState(false);
  const [hueValue, setHueValue] = useState(0);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [isSavingAnnotations, setIsSavingAnnotations] = useState(false);
  const [pageDimensions, setPageDimensions] = useState([]);
  const [selectedOptimizeKey, setSelectedOptimizeKey] = useState('balanced');
  const [minimumSizeMb, setMinimumSizeMb] = useState('');
  const [sizeEstimate, setSizeEstimate] = useState({ beforeSize: 0, estimatedAfterSize: 0 });
  const shouldCaptureAnnotationGestures = isEditMode && !isPanMode;
  const isAnnotationCanvasInteractive = shouldCaptureAnnotationGestures;

  const optimizeProfiles = React.useMemo(() => ({
    small: { key: 'small', label: 'Small (Low Quality)', quality: 0.28, scale: 0.5 },
    balanced: { key: 'balanced', label: 'Balanced', quality: 0.62, scale: 0.75 },
    original: { key: 'original', label: 'Original (High Quality)', quality: 1, scale: 1 },
  }), []);

  const selectedOptimizeProfile = optimizeProfiles[selectedOptimizeKey] || optimizeProfiles.balanced;
  const gestureBlockedBottomHeight = isColorBarOpen ? 300 : 230;
  const autoOptimizeOpenedRef = React.useRef(false);
  const autoAnnotateOpenedRef = React.useRef(false);
  const activePathIdRef = React.useRef(null);
  const draggingTextIdRef = React.useRef(null);
  const dragTextOffsetRef = React.useRef({ x: 0, y: 0 });
  const fallbackReportedRef = React.useRef('');
  const shouldUseAndroidPainter = Platform.OS === 'android' && requestedAction === 'annotate';

  const hexToRgb = React.useCallback((hex) => {
    const value = (hex || '').replace('#', '');
    if (value.length !== 6) {
      return { r: 1, g: 0, b: 0 };
    }
    return {
      r: parseInt(value.slice(0, 2), 16) / 255,
      g: parseInt(value.slice(2, 4), 16) / 255,
      b: parseInt(value.slice(4, 6), 16) / 255,
    };
  }, []);

  const hueToHex = React.useCallback((hue) => {
    const normalized = ((hue % 360) + 360) % 360;
    const c = 1;
    const x = c * (1 - Math.abs(((normalized / 60) % 2) - 1));
    let rPrime = 0;
    let gPrime = 0;
    let bPrime = 0;

    if (normalized < 60) {
      rPrime = c; gPrime = x; bPrime = 0;
    } else if (normalized < 120) {
      rPrime = x; gPrime = c; bPrime = 0;
    } else if (normalized < 180) {
      rPrime = 0; gPrime = c; bPrime = x;
    } else if (normalized < 240) {
      rPrime = 0; gPrime = x; bPrime = c;
    } else if (normalized < 300) {
      rPrime = x; gPrime = 0; bPrime = c;
    } else {
      rPrime = c; gPrime = 0; bPrime = x;
    }

    const toHex = (value) => Math.round(value * 255).toString(16).padStart(2, '0');
    return `#${toHex(rPrime)}${toHex(gPrime)}${toHex(bPrime)}`;
  }, []);

  const hexToHue = React.useCallback((hex) => {
    const { r, g, b } = hexToRgb(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta === 0) return 0;

    let hue;
    if (max === r) {
      hue = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      hue = 60 * (((b - r) / delta) + 2);
    } else {
      hue = 60 * (((r - g) / delta) + 4);
    }
    return Math.round((hue + 360) % 360);
  }, [hexToRgb]);

  const buildPathData = React.useCallback((points) => {
    if (!points?.length) return '';
    if (points.length === 1) {
      const point = points[0];
      return `M ${point.x} ${point.y} L ${point.x + 0.1} ${point.y + 0.1}`;
    }
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
  }, []);

  const distanceToSegment = React.useCallback((point, start, end) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) {
      return Math.hypot(point.x - start.x, point.y - start.y);
    }

    const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
    const clamped = Math.max(0, Math.min(1, t));
    const projX = start.x + clamped * dx;
    const projY = start.y + clamped * dy;
    return Math.hypot(point.x - projX, point.y - projY);
  }, []);

  const erasePathAtPoint = React.useCallback((x, y) => {
    let removedPathId = null;
    let removedTextId = null;

    setTextAnnotations((prev) => {
      let removed = false;
      const kept = prev.filter((annotation) => {
        if (removed || annotation.pageIndex !== activePageIndex) return true;
        const threshold = Math.max(12, ((annotation.fontSize || 12) * 0.8));
        if (Math.hypot(x - annotation.x, y - annotation.y) <= threshold) {
          removed = true;
          removedTextId = annotation.id;
          return false;
        }
        return true;
      });
      return removed ? kept : prev;
    });

    setPaths((prev) => {
      const point = { x, y };
      let removed = false;
      const kept = prev.filter((path) => {
        if (removed || path.pageIndex !== activePageIndex || !path.points?.length) return true;

        const threshold = Math.max(12, (path.width || 1) * 3);
        const points = path.points;

        if (points.length === 1) {
          if (Math.hypot(point.x - points[0].x, point.y - points[0].y) <= threshold) {
            removed = true;
            removedPathId = path.id;
            return false;
          }
          return true;
        }

        for (let i = 1; i < points.length; i += 1) {
          const dist = distanceToSegment(point, points[i - 1], points[i]);
          if (dist <= threshold) {
            removed = true;
            removedPathId = path.id;
            return false;
          }
        }
        return true;
      });

      return removed ? kept : prev;
    });

    if (removedPathId || removedTextId) {
      setHistory((prev) => prev.filter((entry) => entry.id !== removedPathId && entry.id !== removedTextId));
      if (removedTextId) {
        setSelectedTextId((prev) => (prev === removedTextId ? null : prev));
      }
    }
  }, [activePageIndex, distanceToSegment]);

  const findTextAtPoint = React.useCallback((x, y) => {
    const currentPageText = textAnnotations.filter((annotation) => annotation.pageIndex === activePageIndex);
    for (let i = currentPageText.length - 1; i >= 0; i -= 1) {
      const annotation = currentPageText[i];
      const size = annotation.fontSize || 12;
      const textWidth = Math.max(size, (annotation.text?.length || 1) * size * 0.56);
      const minX = annotation.x - 10;
      const maxX = annotation.x + textWidth + 10;
      const minY = annotation.y - size - 10;
      const maxY = annotation.y + 10;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        return annotation;
      }
    }
    return null;
  }, [activePageIndex, textAnnotations]);

  const getFittedPageViewport = React.useCallback((pageIndex, fallbackPageSize) => {
    const pageSize = pageDimensions[pageIndex] || fallbackPageSize;
    if (!pageSize?.width || !pageSize?.height || !canvasLayout.width || !canvasLayout.height) {
      return {
        x: 0,
        y: 0,
        width: canvasLayout.width || 1,
        height: canvasLayout.height || 1,
      };
    }

    // Match a contain-style fit used by the native PDF view.
    const scale = Math.min(canvasLayout.width / pageSize.width, canvasLayout.height / pageSize.height);
    const width = pageSize.width * scale;
    const height = pageSize.height * scale;
    return {
      x: (canvasLayout.width - width) / 2,
      y: (canvasLayout.height - height) / 2,
      width,
      height,
    };
  }, [pageDimensions, canvasLayout.width, canvasLayout.height]);

  const mapScreenPointToPdf = React.useCallback((point, pageSize, pageIndex) => {
    const viewport = getFittedPageViewport(pageIndex, pageSize);
    const normalizedX = Math.max(0, Math.min(1, (point.x - viewport.x) / viewport.width));
    const normalizedY = Math.max(0, Math.min(1, (point.y - viewport.y) / viewport.height));
    return {
      x: normalizedX * pageSize.width,
      y: (1 - normalizedY) * pageSize.height,
      viewport,
    };
  }, [getFittedPageViewport]);

  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (event) => {
      if (!shouldCaptureAnnotationGestures || activeTextDraft) return false;
      return true;
    },
    onMoveShouldSetPanResponder: (event) => {
      if (!shouldCaptureAnnotationGestures || activeTextDraft) return false;
      return true;
    },
    onPanResponderGrant: (event) => {
      if (!shouldCaptureAnnotationGestures) return;
      const { locationX, locationY } = event.nativeEvent;
      const viewport = getFittedPageViewport(activePageIndex);
      const safeViewport = viewport || {
        x: 0,
        y: 0,
        width: canvasLayout.width || 1,
        height: canvasLayout.height || 1,
      };
      const isInsideActiveViewport = (
        locationX >= safeViewport.x
        && locationX <= safeViewport.x + safeViewport.width
        && locationY >= safeViewport.y
        && locationY <= safeViewport.y + safeViewport.height
      );
      if (!isInsideActiveViewport) return;

      if (isEraserMode) {
        setEraserCursor({ visible: true, x: locationX, y: locationY, radius: Math.max(12, strokeWidth * 3) });
        erasePathAtPoint(locationX, locationY);
        return;
      }
      if (isTextMode) {
        if (activeTextDraft) return;

        const touchedText = findTextAtPoint(locationX, locationY);
        if (touchedText) {
          setSelectedTextId(touchedText.id);
          draggingTextIdRef.current = touchedText.id;
          dragTextOffsetRef.current = {
            x: locationX - touchedText.x,
            y: locationY - touchedText.y,
          };
          return;
        }

        setSelectedTextId(null);
        setActiveTextDraft({
          x: locationX,
          y: locationY,
          pageIndex: activePageIndex,
          text: '',
        });
        return;
      }
      const pathId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      activePathIdRef.current = pathId;
      setPaths((prev) => ([
        ...prev,
        {
          id: pathId,
          pageIndex: activePageIndex,
          color: activeColor,
          width: strokeWidth,
          points: [{ x: locationX, y: locationY }],
        },
      ]));
      setHistory((prev) => [...prev, { type: 'path', id: pathId }]);
    },
    onPanResponderMove: (event) => {
      if (!shouldCaptureAnnotationGestures) return;
      const { locationX, locationY } = event.nativeEvent;
      const viewport = getFittedPageViewport(activePageIndex);
      const safeViewport = viewport || {
        x: 0,
        y: 0,
        width: canvasLayout.width || 1,
        height: canvasLayout.height || 1,
      };
      const isInsideActiveViewport = (
        locationX >= safeViewport.x
        && locationX <= safeViewport.x + safeViewport.width
        && locationY >= safeViewport.y
        && locationY <= safeViewport.y + safeViewport.height
      );

      if (isEraserMode) {
        if (!isInsideActiveViewport) return;
        setEraserCursor({ visible: true, x: locationX, y: locationY, radius: Math.max(12, strokeWidth * 3) });
        erasePathAtPoint(locationX, locationY);
        return;
      }

      if (isTextMode) {
        const dragId = draggingTextIdRef.current;
        if (!dragId) return;

        const nextX = locationX - dragTextOffsetRef.current.x;
        const nextY = locationY - dragTextOffsetRef.current.y;

        setTextAnnotations((prev) => prev.map((annotation) => {
          if (annotation.id !== dragId) return annotation;
          return {
            ...annotation,
            x: Math.max(safeViewport.x + 4, Math.min(safeViewport.x + safeViewport.width - 4, nextX)),
            y: Math.max(safeViewport.y + 12, Math.min(safeViewport.y + safeViewport.height - 4, nextY)),
          };
        }));
        return;
      }

      if (!isInsideActiveViewport) return;

      if (!activePathIdRef.current) return;
      const point = { x: locationX, y: locationY };
      const activePathId = activePathIdRef.current;

      setPaths((prev) => prev.map((path) => {
        if (path.id !== activePathId) return path;
        return { ...path, points: [...path.points, point] };
      }));
    },
    onPanResponderRelease: () => {
      activePathIdRef.current = null;
      draggingTextIdRef.current = null;
      if (isEraserMode) {
        setEraserCursor((prev) => ({ ...prev, visible: false }));
      }
    },
    onPanResponderTerminate: () => {
      activePathIdRef.current = null;
      draggingTextIdRef.current = null;
      if (isEraserMode) {
        setEraserCursor((prev) => ({ ...prev, visible: false }));
      }
    },
  }), [shouldCaptureAnnotationGestures, isEraserMode, isTextMode, activePageIndex, activeColor, strokeWidth, erasePathAtPoint, activeTextDraft, findTextAtPoint, getFittedPageViewport, canvasLayout.width, canvasLayout.height]);

  const pagePaths = React.useMemo(
    () => paths.filter((path) => path.pageIndex === activePageIndex),
    [paths, activePageIndex]
  );

  const goToPage = React.useCallback((delta) => {
    setActivePageIndex((current) => Math.max(0, Math.min(pageCount - 1, current + delta)));
  }, [pageCount]);

  const closeAnnotationMode = () => {
    setIsEditMode(false);
    setIsPanMode(false);
    setIsEraserMode(false);
    setIsTextMode(false);
    setActiveTextDraft(null);
    setIsColorBarOpen(false);
    setSelectedTextId(null);
  };

  const isPasswordError = (error) => {
    const message = (error?.message || error || '').toString();
    return /(password|encrypted|decrypt|authorization|security)/i.test(message);
  };

  const openPasswordPrompt = (message) => {
    setPasswordPromptMessage(message || 'This PDF is password-protected. Enter password to continue.');
    setPasswordInput('');
    setShowPasswordPrompt(true);
  };

  const closePasswordPrompt = () => {
    setShowPasswordPrompt(false);
    setPasswordInput('');
  };

  const submitPassword = () => {
    if (!passwordInput.trim()) {
      Alert.alert('Password Required', 'Please enter the PDF password.');
      return;
    }
    setViewerPassword(passwordInput);
    setShowPasswordPrompt(false);
    setPasswordInput('');
  };

  const handleUndoLastPath = () => {
    setHistory((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const last = next.pop();
      if (last?.type === 'path') {
        setPaths((current) => current.filter((path) => path.id !== last.id));
      } else if (last?.type === 'text') {
        setTextAnnotations((current) => current.filter((annotation) => annotation.id !== last.id));
      }
      return next;
    });
  };

  const handleClearPaths = () => {
    setPaths([]);
    setTextAnnotations([]);
    setHistory([]);
    setSelectedTextId(null);
  };

  const commitTextDraft = () => {
    const value = activeTextDraft?.text?.trim();
    if (!activeTextDraft || !value) {
      setActiveTextDraft(null);
      return;
    }

    const textId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setTextAnnotations((prev) => ([
      ...prev,
      {
        id: textId,
        pageIndex: activeTextDraft.pageIndex,
        x: activeTextDraft.x,
        y: activeTextDraft.y,
        text: value,
        color: activeColor,
        fontSize: Math.max(10, strokeWidth * 3),
      },
    ]));
    setHistory((prev) => [...prev, { type: 'text', id: textId }]);
    setSelectedTextId(textId);
    setActiveTextDraft(null);
  };

  const saveAnnotations = async ({ skipEmptyAlert = false } = {}) => {
    if (isSavingAnnotations) return;

    const drawablePaths = paths.filter((path) => path.points?.length);
    const draftText = activeTextDraft?.text?.trim()
      ? {
          id: `draft_${Date.now()}`,
          pageIndex: activeTextDraft.pageIndex,
          x: activeTextDraft.x,
          y: activeTextDraft.y,
          text: activeTextDraft.text.trim(),
          color: activeColor,
          fontSize: Math.max(10, strokeWidth * 3),
        }
      : null;
    const drawableTexts = [
      ...textAnnotations.filter((annotation) => annotation.text?.trim()),
      ...(draftText ? [draftText] : []),
    ];
    if (!drawablePaths.length && !drawableTexts.length) {
      if (!skipEmptyAlert) {
        Alert.alert('No Annotations', 'Add drawings or text on the PDF before saving.');
      }
      return 'empty';
    }

    if (!pdfItem?.uri) {
      Alert.alert('Save Error', 'No PDF selected to annotate.');
      return 'error';
    }

    if (!canvasLayout.width || !canvasLayout.height) {
      Alert.alert('Save Error', 'Canvas dimensions are not ready yet. Try again.');
      return 'error';
    }

    setIsSavingAnnotations(true);
    try {
      const sourceUri = ensureFileUri(pdfItem.uri);
      let sourceBase64;
      try {
        sourceBase64 = await FileSystem.readAsStringAsync(sourceUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch {
        sourceBase64 = await FileSystem.readAsStringAsync(sourceUri.replace('file://', ''), {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      const pdfDoc = await PDFDocument.load(Buffer.from(sourceBase64, 'base64'));
      const pages = pdfDoc.getPages();
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

      drawablePaths.forEach((path) => {
        const page = pages[path.pageIndex];
        if (!page || path.points.length < 1) return;

        const { width: pageWidth, height: pageHeight } = page.getSize();
        const pageSize = { width: pageWidth, height: pageHeight };
        const viewport = getFittedPageViewport(path.pageIndex, pageSize);
        const color = hexToRgb(path.color);
        const scaleX = pageWidth / viewport.width;
        const scaleY = pageHeight / viewport.height;
        const mappedThickness = Math.max(0.5, path.width * ((scaleX + scaleY) / 2));

        if (path.points.length === 1) {
          const point = mapScreenPointToPdf(path.points[0], pageSize, path.pageIndex);
          page.drawCircle({
            x: point.x,
            y: point.y,
            size: Math.max(0.75, mappedThickness * 0.5),
            color: rgb(color.r, color.g, color.b),
          });
          return;
        }

        for (let i = 1; i < path.points.length; i += 1) {
          const previous = path.points[i - 1];
          const current = path.points[i];
          const start = mapScreenPointToPdf(previous, pageSize, path.pageIndex);
          const end = mapScreenPointToPdf(current, pageSize, path.pageIndex);

          page.drawLine({
            start,
            end,
            thickness: mappedThickness,
            color: rgb(color.r, color.g, color.b),
          });
        }
      });

      drawableTexts.forEach((annotation) => {
        const page = pages[annotation.pageIndex];
        if (!page || !annotation.text) return;

        const { width: pageWidth, height: pageHeight } = page.getSize();
        const pageSize = { width: pageWidth, height: pageHeight };
        const { x: mappedX, y: mappedY, viewport } = mapScreenPointToPdf(
          { x: annotation.x, y: annotation.y },
          pageSize,
          annotation.pageIndex
        );
        const color = hexToRgb(annotation.color);
        const scaleX = pageWidth / viewport.width;
        const scaleY = pageHeight / viewport.height;
        const mappedSize = Math.max(8, annotation.fontSize * ((scaleX + scaleY) / 2));
        // SVG text y is baseline-like while pdf-lib y uses text bottom; adjust for closer visual match.
        const baselineAdjustment = mappedSize * 0.2;

        page.drawText(annotation.text, {
          x: mappedX,
          y: Math.max(0, mappedY - baselineAdjustment),
          size: mappedSize,
          font: helvetica,
          color: rgb(color.r, color.g, color.b),
        });
      });

      const outputUri = ensureFileUri(pdfItem.uri);
      const bytes = await pdfDoc.save();

      const updatedBase64 = Buffer.from(bytes).toString('base64');
      try {
        await FileSystem.writeAsStringAsync(outputUri, updatedBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch {
        await FileSystem.writeAsStringAsync(outputUri.replace('file://', ''), updatedBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      // Refresh native renderer from a fresh cache path so edits are visible immediately.
      const cacheTarget = `${FileSystem.cacheDirectory}viewer_annotated_${Date.now()}_${pdfItem.name || 'document.pdf'}`;
      try {
        await FileSystem.copyAsync({
          from: outputUri,
          to: cacheTarget,
        });
      } catch {
        await FileSystem.copyAsync({
          from: outputUri.replace('file://', ''),
          to: cacheTarget,
        });
      }

      setPaths([]);
      setTextAnnotations([]);
      setHistory([]);
      closeAnnotationMode();
      setViewerUri(withVersionQuery(cacheTarget));
      Alert.alert('Saved', 'Your annotations were permanently written to this PDF.');
      return 'saved';
    } catch (error) {
      Alert.alert('Save Error', error?.message || 'Failed to save annotations.');
      return 'error';
    } finally {
      setIsSavingAnnotations(false);
    }
  };

  const handlePrint = async () => {
    try {
      await Print.printAsync({ uri: viewerUri });
    } catch (err) {
      Alert.alert('Print Error', err.message);
    }
  };

  const handleLockPdf = async (password) => {
    if (!onLockPDF || isLocking) return;
    setIsLocking(true);
    try {
      const success = await onLockPDF(pdfItem, password);
      if (success) {
        setShowLockModal(false);
      }
    } finally {
      setIsLocking(false);
    }
  };

  const refreshSizeEstimate = React.useCallback(async (profile) => {
    if (!pdfItem?.uri || !profile) return;

    try {
      const parsedMinimumMb = Number((minimumSizeMb || '').replace(',', '.'));
      const minimumSizeBytes = Number.isFinite(parsedMinimumMb) && parsedMinimumMb > 0
        ? Math.floor(parsedMinimumMb * 1024 * 1024)
        : 0;

      if (typeof onEstimateOptimization === 'function') {
        const estimate = await onEstimateOptimization(pdfItem, {
          quality: profile.quality,
          scale: profile.scale,
          minimumSizeBytes: profile.key === 'original' ? minimumSizeBytes : 0,
        });
        setSizeEstimate(estimate || { beforeSize: 0, estimatedAfterSize: 0 });
        return;
      }

      const info = await FileSystem.getInfoAsync(pdfItem.uri);
      const beforeSize = info.size || pdfItem.size || 0;
      const estimateFactor = Math.max(0.2, Math.min(1, 0.2 + profile.quality * profile.scale * profile.scale * 0.8));
      setSizeEstimate({
        beforeSize,
        estimatedAfterSize: Math.max(Math.round(beforeSize * estimateFactor), profile.key === 'original' ? minimumSizeBytes : 0),
      });
    } catch {
      setSizeEstimate({ beforeSize: pdfItem.size || 0, estimatedAfterSize: pdfItem.size || 0 });
    }
  }, [minimumSizeMb, onEstimateOptimization, pdfItem]);

  const openOptimizeModal = () => {
    const balanced = optimizeProfiles.balanced;
    setSelectedOptimizeKey(balanced.key);
    setMinimumSizeMb('');
    setShowOptimizeModal(true);
    refreshSizeEstimate(balanced);
  };

  const applyOptimization = async () => {
    if (isOptimizing || !pdfItem?.uri) return;

    setIsOptimizing(true);
    try {
      let result = null;
      const parsedMinimumMb = Number((minimumSizeMb || '').replace(',', '.'));
      const minimumSizeBytes = Number.isFinite(parsedMinimumMb) && parsedMinimumMb > 0
        ? Math.floor(parsedMinimumMb * 1024 * 1024)
        : 0;

      if (selectedOptimizeProfile.key === 'original' && typeof onUpscalePDF === 'function') {
        result = await onUpscalePDF(pdfItem, { minimumSizeBytes });
      } else if (typeof onOptimizePDF === 'function') {
        result = await onOptimizePDF(pdfItem, selectedOptimizeProfile.quality, {
          scale: selectedOptimizeProfile.scale,
          useOriginalSource: selectedOptimizeProfile.key === 'original',
        });
      }

      if (result?.success) {
        setViewerUri(withVersionQuery(result.uri || pdfItem.uri));
        setShowOptimizeModal(false);
        await refreshSizeEstimate(selectedOptimizeProfile);
        Alert.alert(
          'Optimization Complete',
          `Before: ${formatFileSize(result.beforeSize)}\nAfter: ${formatFileSize(result.afterSize)}`
        );
      }
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleZip = async () => {
    if (isZipping) return;
    setIsZipping(true);
    try {
      const fileName = pdfItem?.name || 'document.pdf';
      const sourceUri = ensureFileUri(pdfItem?.uri || viewerUri);

      // Read the PDF as base64
      let pdfBase64;
      try {
        pdfBase64 = await FileSystem.readAsStringAsync(sourceUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch {
        // Some environments may resolve only plain paths.
        pdfBase64 = await FileSystem.readAsStringAsync(sourceUri.replace('file://', ''), {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      // Build zip in memory using JSZip (pure JS — no native module needed)
      const zip = new JSZip();
      zip.file(fileName, pdfBase64, { base64: true });
      const zipBase64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });

      // Ensure the zips directory exists
      const zipsDir = `${FileSystem.documentDirectory}zips/`;
      const dirInfo = await FileSystem.getInfoAsync(zipsDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(zipsDir, { intermediates: true });
      }

      // Save with timestamp to avoid name collisions
      const baseName = fileName.replace(/\.pdf$/i, '');
      const zipName = `${baseName}_${Date.now()}.zip`;
      const targetZipPath = `${zipsDir}${zipName}`;

      await FileSystem.writeAsStringAsync(targetZipPath, zipBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Verify file was actually written
      const written = await FileSystem.getInfoAsync(targetZipPath);
      if (!written.exists || written.size === 0) {
        throw new Error('Zip file was not saved correctly.');
      }

      Alert.alert('Success', `"${zipName}" saved to your Zipped Files.`);
      await onZipSaved?.();
    } catch (err) {
      console.error('Zip error:', err);
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
        if (isMounted) setViewerUri(withVersionQuery(tempFile));
      } catch (err) {
        console.warn("Failed to create temporary cache file for viewer:", err);
        if (isMounted) setViewerUri(withVersionQuery(pdfItem.uri));
      }
    };
    processUri();
    return () => { isMounted = false; };
  }, [pdfItem, pdfVersion, withVersionQuery]);

  React.useEffect(() => {
    let isMounted = true;
    const loadPageDimensions = async () => {
      if (!pdfItem?.uri) {
        if (isMounted) setPageDimensions([]);
        return;
      }

      try {
        const sourceUri = ensureFileUri(pdfItem.uri);
        let sourceBase64;
        try {
          sourceBase64 = await FileSystem.readAsStringAsync(sourceUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch {
          sourceBase64 = await FileSystem.readAsStringAsync(sourceUri.replace('file://', ''), {
            encoding: FileSystem.EncodingType.Base64,
          });
        }

        const doc = await PDFDocument.load(Buffer.from(sourceBase64, 'base64'));
        const dims = doc.getPages().map((page) => {
          const { width, height } = page.getSize();
          return { width, height };
        });
        if (isMounted) {
          setPageDimensions(dims);
        }
      } catch {
        if (isMounted) {
          setPageDimensions([]);
        }
      }
    };

    loadPageDimensions();
    return () => {
      isMounted = false;
    };
  }, [pdfItem?.uri]);

  React.useEffect(() => {
    if (!showOptimizeModal) return;
    refreshSizeEstimate(selectedOptimizeProfile);
  }, [showOptimizeModal, selectedOptimizeProfile, refreshSizeEstimate]);

  React.useEffect(() => {
    setViewerPassword('');
    setPasswordInput('');
    setShowPasswordPrompt(false);
    setIsEditMode(false);
    setIsPanMode(false);
    setIsEraserMode(false);
    setIsTextMode(false);
    setActiveTextDraft(null);
    setIsColorBarOpen(false);
    setPaths([]);
    setTextAnnotations([]);
    setHistory([]);
    setSelectedTextId(null);
    setViewerUri(withVersionQuery(pdfItem?.uri));
  }, [pdfItem?.uri, withVersionQuery]);

  React.useEffect(() => {
    if (!selectedTextId) return;
    const exists = textAnnotations.some((annotation) => annotation.id === selectedTextId);
    if (!exists) {
      setSelectedTextId(null);
    }
  }, [textAnnotations, selectedTextId]);

  React.useEffect(() => {
    autoOptimizeOpenedRef.current = false;
  }, [pdfItem?.uri, requestedAction]);

  React.useEffect(() => {
    if (requestedAction === 'annotate' && !autoAnnotateOpenedRef.current) {
      autoAnnotateOpenedRef.current = true;
      setIsEditMode(true);
      setIsPanMode(true);
      setIsEraserMode(false);
      setIsTextMode(false);
      setIsColorBarOpen(false);
    }
  }, [requestedAction]);

  React.useEffect(() => {
    if (requestedAction !== 'annotate') {
      autoAnnotateOpenedRef.current = false;
    }
  }, [requestedAction, pdfItem?.uri]);

  React.useEffect(() => {
    const key = `${pdfItem?.uri || ''}|${requestedAction || ''}`;
    const usingAndroidPainter = shouldUseAndroidPainter && !isExpoGo && viewerUri;

    if (fallbackReportedRef.current === key) return;

    if (pdfItem?.uri && !usingAndroidPainter && (!NativePdf || !viewerUri)) {
      fallbackReportedRef.current = key;
      onLoadComplete?.(0);
    }
  }, [pdfItem?.uri, requestedAction, shouldUseAndroidPainter, viewerUri, onLoadComplete]);

  if (!pdfItem?.uri) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Invalid PDF item</Text>
      </View>
    );
  }

  if (shouldUseAndroidPainter && !isExpoGo && viewerUri) {
    return (
      <AndroidPdfEditor
        pdfUri={viewerUri}
        pdfPassword={viewerPassword}
        initialEditing
        onLoadComplete={(numberOfPages) => {
          const safePageCount = numberOfPages || 0;
          setPageCount(safePageCount);
          onLoadComplete?.(safePageCount);
        }}
        onPageChanged={(page, numberOfPages) => {
          const safeIndex = Math.max(0, Math.min((numberOfPages || pageCount) - 1, (page || 1) - 1));
          setActivePageIndex(safeIndex);
        }}
        onError={() => {
          onLoadComplete?.(0);
        }}
        onAnnotationsExported={(annotationPath) => {
          Alert.alert(
            'Annotations Saved',
            `Saved to ${annotationPath}. Reopening this PDF in annotate mode loads the same drawing file automatically.`
          );
        }}
      />
    );
  }

  // Native viewer available (works in dev builds when module is linked)
  if (NativePdf && viewerUri) {
    return (
      <View style={{ flex: 1 }}>
        <View
          style={styles.viewerArea}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            if (width > 0 && height > 0) {
              setCanvasLayout({ width, height });
            }
          }}
        >
          <NativePdf
            source={{ uri: viewerUri, cache: true }}
            password={viewerPassword || undefined}
            trustAllCerts={false}
            scrollEnabled={!isEditMode || isPanMode}
            singlePage={isAnnotationCanvasInteractive}
            page={isAnnotationCanvasInteractive ? activePageIndex + 1 : undefined}
            style={{ flex: 1 }}
            onLoadComplete={(numberOfPages) => {
              setPageCount(numberOfPages);
              onLoadComplete?.(numberOfPages);
              if (requestedAction === 'optimize' && !autoOptimizeOpenedRef.current) {
                autoOptimizeOpenedRef.current = true;
                openOptimizeModal();
              }
            }}
            onPageChanged={(page, numberOfPages) => {
              // While drawing (single-page controlled mode), we own page state via toolbar navigation.
              // Native callbacks can be noisy here and incorrectly override the target page.
              if (isAnnotationCanvasInteractive) return;
              const safeIndex = Math.max(0, Math.min((numberOfPages || pageCount) - 1, (page || 1) - 1));
              setActivePageIndex(safeIndex); // Native library returns 1-based index
            }}
            onError={async (error) => {
              if (isPasswordError(error)) {
                setViewerPassword('');
                openPasswordPrompt('This PDF is password-protected. Enter the password to open it.');
                return;
              }

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

          <View
            style={styles.svgOverlay}
            pointerEvents={isEditMode ? 'box-none' : 'none'}
          >
            <Svg width="100%" height="100%" pointerEvents="none">
              {pagePaths.map((path) => (
                <Path
                  key={path.id}
                  d={buildPathData(path.points)}
                  stroke={path.color}
                  strokeWidth={path.width}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {textAnnotations
                .filter((annotation) => annotation.pageIndex === activePageIndex)
                .map((annotation) => (
                  <React.Fragment key={annotation.id}>
                    <SvgText
                      x={annotation.x}
                      y={annotation.y}
                      fill={annotation.color}
                      fontSize={annotation.fontSize}
                      fontWeight="700"
                    >
                      {annotation.text}
                    </SvgText>
                    {isTextMode && selectedTextId === annotation.id ? (
                      <Circle
                        cx={annotation.x + Math.max(8, ((annotation.text?.length || 1) * (annotation.fontSize || 12) * 0.28))}
                        cy={annotation.y - ((annotation.fontSize || 12) * 0.45)}
                        r={Math.max(14, (annotation.fontSize || 12) * 0.95)}
                        fill="rgba(255,255,255,0.05)"
                        stroke="rgba(255,255,255,0.9)"
                        strokeWidth={1.2}
                      />
                    ) : null}
                  </React.Fragment>
                ))}
              {isEraserMode && eraserCursor.visible ? (
                <Circle
                  cx={eraserCursor.x}
                  cy={eraserCursor.y}
                  r={eraserCursor.radius}
                  fill="rgba(255,255,255,0.08)"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={1.5}
                />
              ) : null}
            </Svg>

            <View
              style={[styles.canvasGestureLayer, { bottom: gestureBlockedBottomHeight }]}
              pointerEvents={shouldCaptureAnnotationGestures ? 'auto' : 'none'}
              {...panResponder.panHandlers}
            />
          </View>
        </View>

        {isEditMode && isTextMode && activeTextDraft && activeTextDraft.pageIndex === activePageIndex && (
          <View
            style={[
              styles.inlineTextInputWrap,
              {
                left: Math.max(8, Math.min(canvasLayout.width - 180, activeTextDraft.x - 6)),
                top: Math.max(8, Math.min(canvasLayout.height - 60, activeTextDraft.y - 28)),
              },
            ]}
          >
            <TextInput
              value={activeTextDraft.text}
              onChangeText={(text) => setActiveTextDraft((prev) => (prev ? { ...prev, text } : prev))}
              autoFocus
              multiline
              blurOnSubmit
              placeholder="Type here"
              placeholderTextColor="rgba(255,255,255,0.45)"
              onSubmitEditing={commitTextDraft}
              onBlur={commitTextDraft}
              style={[styles.inlineTextInput, { color: activeColor, fontSize: Math.max(10, strokeWidth * 3) }]}
            />
          </View>
        )}

        <PasswordPromptModal
          visible={showPasswordPrompt}
          message={passwordPromptMessage}
          passwordInput={passwordInput}
          onChangePassword={setPasswordInput}
          onCancel={closePasswordPrompt}
          onSubmit={submitPassword}
        />

        <OptimizeModal
          visible={showOptimizeModal}
          isOptimizing={isOptimizing}
          optimizeProfiles={optimizeProfiles}
          selectedOptimizeKey={selectedOptimizeKey}
          onSelectProfile={setSelectedOptimizeKey}
          sizeEstimate={sizeEstimate}
          minimumSizeMb={minimumSizeMb}
          onChangeMinimumSize={setMinimumSizeMb}
          onCancel={() => setShowOptimizeModal(false)}
          onApply={applyOptimization}
        />

        {/* Floating Action Menu (FAB) */}
        <View style={styles.fabContainer}>
          <LockPDFModal
            visible={showLockModal}
            fileName={pdfItem?.name}
            onCancel={() => {
              if (!isLocking) setShowLockModal(false);
            }}
            onConfirm={handleLockPdf}
            isLoading={isLocking}
          />

          {isMenuOpen && !isEditMode && (
            <View style={styles.menuItems}>
              <TouchableOpacity
                style={[styles.menuItemBtn, (isZipping || isLocking || isOptimizing) && styles.tbButtonDisabled]}
                onPress={() => { setIsMenuOpen(false); handlePrint(); }}
                disabled={isZipping || isLocking || isOptimizing}
              >
                <MaterialCommunityIcons name="printer" size={24} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItemBtn, (isZipping || isLocking || isOptimizing) && styles.tbButtonDisabled]}
                onPress={() => { setIsMenuOpen(false); handleZip(); }}
                disabled={isZipping || isLocking || isOptimizing}
              >
                {isZipping ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="zip-box" size={24} color="#fff" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItemBtn, (isZipping || isLocking || isOptimizing) && styles.tbButtonDisabled]}
                onPress={() => {
                  setIsMenuOpen(false);
                  setShowLockModal(true);
                }}
                disabled={isZipping || isLocking || isOptimizing}
              >
                {isLocking ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="lock" size={24} color="#fff" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItemBtn, (isZipping || isLocking || isOptimizing) && styles.tbButtonDisabled]}
                onPress={() => {
                  setIsMenuOpen(false);
                  openOptimizeModal();
                }}
                disabled={isZipping || isLocking || isOptimizing}
              >
                {isOptimizing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="tune-variant" size={24} color="#fff" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItemBtn, (isZipping || isLocking || isOptimizing) && styles.tbButtonDisabled]}
                onPress={() => { setIsMenuOpen(false); onEnterEditMode?.(pageCount); }}
                disabled={isZipping || isLocking || isOptimizing}
              >
                <MaterialCommunityIcons name="file-document-edit-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {!isEditMode && (
            <TouchableOpacity
              style={styles.fabBtn}
              onPress={() => setIsMenuOpen(!isMenuOpen)}
            >
              <MaterialCommunityIcons name={isMenuOpen ? 'close' : 'dots-vertical'} size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {(isZipping || isLocking || isOptimizing) && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>
              {isOptimizing
                ? 'Optimizing PDF...'
                : isLocking
                  ? 'Encrypting PDF...'
                  : 'Creating ZIP Archive...'}
            </Text>
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
        Native PDF rendering is unavailable in this runtime. Open the file using your device PDF app.
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
  viewerArea: {
    flex: 1,
  },
  svgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  canvasGestureLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  inlineTextInputWrap: {
    position: 'absolute',
    minWidth: 120,
    maxWidth: 240,
    minHeight: 32,
    backgroundColor: 'rgba(20,20,30,0.28)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    zIndex: 30,
    elevation: 12,
  },
  inlineTextInput: {
    paddingVertical: 2,
    paddingHorizontal: 0,
    fontWeight: '700',
    minHeight: 24,
  },
  tbButtonTextDisabled: {
    color: '#888',
  },
});
