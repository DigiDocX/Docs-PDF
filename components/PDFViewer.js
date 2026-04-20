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
import { loadAnnotations, saveAnnotationData } from '../utils/annotationStorage';
import { PasswordPromptModal } from './pdfViewer/PasswordPromptModal';
import { OptimizeModal } from './pdfViewer/OptimizeModal';

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
  const [isHighlightMode, setIsHighlightMode] = useState(false);
  const [paths, setPaths] = useState([]);
  const [textAnnotations, setTextAnnotations] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeColor, setActiveColor] = useState(DRAW_COLORS[0]);
  const [highlightColor, setHighlightColor] = useState('#FFD60A');
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

  // ── Refs mirroring every piece of tool state ──────────────────────────────
  // panResponder is created ONCE (empty deps) and reads these refs for fresh values.
  const isEditModeRef = React.useRef(false);
  const isPanModeRef = React.useRef(false);
  const isEraserModeRef = React.useRef(false);
  const isTextModeRef = React.useRef(false);
  const isHighlightModeRef = React.useRef(false);
  const activeColorRef = React.useRef(DRAW_COLORS[0]);
  const highlightColorRef = React.useRef('#FFD60A');
  const strokeWidthRef = React.useRef(3);
  const activePageIndexRef = React.useRef(0);
  const canvasLayoutRef = React.useRef({ width: 1, height: 1 });
  const activeTextDraftRef = React.useRef(null);

  // Keep refs in sync with state
  React.useLayoutEffect(() => { isEditModeRef.current = isEditMode; }, [isEditMode]);
  React.useLayoutEffect(() => { isPanModeRef.current = isPanMode; }, [isPanMode]);
  React.useLayoutEffect(() => { isEraserModeRef.current = isEraserMode; }, [isEraserMode]);
  React.useLayoutEffect(() => { isTextModeRef.current = isTextMode; }, [isTextMode]);
  React.useLayoutEffect(() => { isHighlightModeRef.current = isHighlightMode; }, [isHighlightMode]);
  React.useLayoutEffect(() => { activeColorRef.current = activeColor; }, [activeColor]);
  React.useLayoutEffect(() => { highlightColorRef.current = highlightColor; }, [highlightColor]);
  React.useLayoutEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);
  React.useLayoutEffect(() => { activePageIndexRef.current = activePageIndex; }, [activePageIndex]);
  React.useLayoutEffect(() => { canvasLayoutRef.current = canvasLayout; }, [canvasLayout]);
  React.useLayoutEffect(() => { activeTextDraftRef.current = activeTextDraft; }, [activeTextDraft]);

  // Gesture layer captures touches when in edit mode but NOT in pan mode
  const shouldCaptureAnnotationGestures = isEditMode && !isPanMode;
  // Lock to single-page only when a drawing tool is active (NOT in pan mode).
  // In pan mode: native scroll works freely, SVG overlay is hidden to prevent bleed.
  const isAnnotationCanvasInteractive = isEditMode && !isPanMode;
  // Derived: which draw tool is active
  const activeDrawTool = isEraserMode ? 'eraser' : isTextMode ? 'text' : isHighlightMode ? 'highlight' : isPanMode ? 'pan' : 'pen';

  const optimizeProfiles = React.useMemo(() => ({
    small: { key: 'small', label: 'Small (Low Quality)', quality: 0.28, scale: 0.5 },
    balanced: { key: 'balanced', label: 'Balanced', quality: 0.62, scale: 0.75 },
    original: { key: 'original', label: 'Original (High Quality)', quality: 1, scale: 1 },
  }), []);

  const selectedOptimizeProfile = optimizeProfiles[selectedOptimizeKey] || optimizeProfiles.balanced;
  // The annotation toolbar is outside viewerArea, so no bottom offset is needed for the gesture layer.
  const HIGHLIGHT_COLORS = ['#FFD60A', '#34C759', '#FF9F0A', '#FF375F', '#64D2FF'];
  const PEN_COLORS = ['#FF3B30', '#007AFF', '#34C759', '#FFD60A', '#FF9F0A', '#AF52DE', '#FFFFFF', '#000000'];
  const autoOptimizeOpenedRef = React.useRef(false);
  const autoAnnotateOpenedRef = React.useRef(false);
  const activePathIdRef = React.useRef(null);
  const draggingTextIdRef = React.useRef(null);
  const dragTextOffsetRef = React.useRef({ x: 0, y: 0 });
  const fallbackReportedRef = React.useRef('');
  // Android uses the same NativePdf + SVG-overlay annotation path as other platforms.

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

  // ── Stable refs for data (used in debounced saves and panResponder) ────────
  const pathsRef = React.useRef([]);
  const textAnnotationsRef = React.useRef([]);
  const pdfItemUriRef = React.useRef(pdfItem?.uri);
  const eraseSaveTimerRef = React.useRef(null);

  React.useEffect(() => { pdfItemUriRef.current = pdfItem?.uri; }, [pdfItem?.uri]);
  React.useEffect(() => { pathsRef.current = paths; }, [paths]);
  React.useEffect(() => { textAnnotationsRef.current = textAnnotations; }, [textAnnotations]);

  // ── distanceToSegment (pure) ──────────────────────────────────────────────

  // ── getFittedPageViewport ─────────────────────────────────────────────────
  const pageDimensionsRef = React.useRef([]);
  React.useEffect(() => { pageDimensionsRef.current = pageDimensions; }, [pageDimensions]);

  const getFittedPageViewport = React.useCallback((pageIndex, fallbackPageSize) => {
    const pageSize = pageDimensionsRef.current[pageIndex] || fallbackPageSize;
    const layout = canvasLayoutRef.current;
    if (!pageSize?.width || !pageSize?.height || !layout.width || !layout.height) {
      return { x: 0, y: 0, width: layout.width || 1, height: layout.height || 1 };
    }
    const scale = Math.min(layout.width / pageSize.width, layout.height / pageSize.height);
    const width = pageSize.width * scale;
    const height = pageSize.height * scale;
    return {
      x: (layout.width - width) / 2,
      y: (layout.height - height) / 2,
      width,
      height,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — reads from refs only

  // For save logic we also need a useCallback version that sees pageDimensions state
  const getFittedPageViewportForSave = React.useCallback((pageIndex, fallbackPageSize) => {
    const pageSize = pageDimensions[pageIndex] || fallbackPageSize;
    if (!pageSize?.width || !pageSize?.height || !canvasLayout.width || !canvasLayout.height) {
      return { x: 0, y: 0, width: canvasLayout.width || 1, height: canvasLayout.height || 1 };
    }
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
    const viewport = getFittedPageViewportForSave(pageIndex, pageSize);
    const normalizedX = Math.max(0, Math.min(1, (point.x - viewport.x) / viewport.width));
    const normalizedY = Math.max(0, Math.min(1, (point.y - viewport.y) / viewport.height));
    return {
      x: normalizedX * pageSize.width,
      y: (1 - normalizedY) * pageSize.height,
      viewport,
    };
  }, [getFittedPageViewportForSave]);

  // ── erasePathAtPoint: works on ALL in-memory paths (new + saved) ──────────
  // Uses a direct ref-based approach so no stale closure issues.
  const eraseAtPointImpl = React.useCallback((x, y, currentPageIndex) => {
    let textRemoved = false;
    let pathRemoved = false;

    setPaths((prev) => {
      const point = { x, y };
      const next = prev.filter((path) => {
        if (pathRemoved) return true; // only erase one stroke per call for responsiveness
        if (path.pageIndex !== currentPageIndex || !path.points?.length) return true;
        const threshold = Math.max(16, (path.width || 1) * 4);
        const pts = path.points;
        if (pts.length === 1) {
          if (Math.hypot(point.x - pts[0].x, point.y - pts[0].y) <= threshold) {
            pathRemoved = true;
            return false;
          }
          return true;
        }
        for (let i = 1; i < pts.length; i += 1) {
          const dx = pts[i].x - pts[i - 1].x;
          const dy = pts[i].y - pts[i - 1].y;
          let dist;
          if (dx === 0 && dy === 0) {
            dist = Math.hypot(point.x - pts[i - 1].x, point.y - pts[i - 1].y);
          } else {
            const t = Math.max(0, Math.min(1, ((point.x - pts[i - 1].x) * dx + (point.y - pts[i - 1].y) * dy) / (dx * dx + dy * dy)));
            dist = Math.hypot(point.x - (pts[i - 1].x + t * dx), point.y - (pts[i - 1].y + t * dy));
          }
          if (dist <= threshold) {
            pathRemoved = true;
            return false;
          }
        }
        return true;
      });
      if (pathRemoved) {
        pathsRef.current = next;
        return next;
      }
      return prev;
    });

    setTextAnnotations((prev) => {
      if (textRemoved || pathRemoved) return prev; // already removed something
      const next = prev.filter((ann) => {
        if (textRemoved) return true;
        if (ann.pageIndex !== currentPageIndex) return true;
        const threshold = Math.max(16, ((ann.fontSize || 12) * 1.0));
        if (Math.hypot(x - ann.x, y - ann.y) <= threshold) {
          textRemoved = true;
          return false;
        }
        return true;
      });
      if (textRemoved) {
        textAnnotationsRef.current = next;
        return next;
      }
      return prev;
    });

    if (pathRemoved || textRemoved) {
      // Debounce sidecar save
      if (eraseSaveTimerRef.current) clearTimeout(eraseSaveTimerRef.current);
      eraseSaveTimerRef.current = setTimeout(() => {
        const uri = pdfItemUriRef.current;
        if (uri) {
          saveAnnotationData(uri, pathsRef.current, textAnnotationsRef.current).catch(() => {});
        }
      }, 800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — uses only refs and setters

  const findTextAtPoint = React.useCallback((x, y) => {
    const currentPageText = textAnnotationsRef.current.filter((a) => a.pageIndex === activePageIndexRef.current);
    for (let i = currentPageText.length - 1; i >= 0; i -= 1) {
      const ann = currentPageText[i];
      const size = ann.fontSize || 12;
      const textWidth = Math.max(size, (ann.text?.length || 1) * size * 0.56);
      if (
        x >= ann.x - 10 && x <= ann.x + textWidth + 10
        && y >= ann.y - size - 10 && y <= ann.y + 10
      ) return ann;
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — reads refs only

  // ── PanResponder: created ONCE, reads all state from refs ─────────────────
  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => {
      // Capture if in edit mode and NOT in pan mode
      return isEditModeRef.current && !isPanModeRef.current && !activeTextDraftRef.current;
    },
    onMoveShouldSetPanResponder: () => {
      return isEditModeRef.current && !isPanModeRef.current && !activeTextDraftRef.current;
    },
    onPanResponderGrant: (event) => {
      if (!isEditModeRef.current || isPanModeRef.current) return;
      const { locationX, locationY } = event.nativeEvent;
      const pageIdx = activePageIndexRef.current;
      const layout = canvasLayoutRef.current;

      const viewport = getFittedPageViewport(pageIdx);
      const vp = viewport || { x: 0, y: 0, width: layout.width || 1, height: layout.height || 1 };

      const inside = locationX >= vp.x && locationX <= vp.x + vp.width
        && locationY >= vp.y && locationY <= vp.y + vp.height;
      if (!inside) return;

      if (isEraserModeRef.current) {
        setEraserCursor({ visible: true, x: locationX, y: locationY, radius: Math.max(16, strokeWidthRef.current * 4) });
        eraseAtPointImpl(locationX, locationY, pageIdx);
        return;
      }

      if (isTextModeRef.current) {
        if (activeTextDraftRef.current) return;
        const touchedText = findTextAtPoint(locationX, locationY);
        if (touchedText) {
          setSelectedTextId(touchedText.id);
          draggingTextIdRef.current = touchedText.id;
          dragTextOffsetRef.current = { x: locationX - touchedText.x, y: locationY - touchedText.y };
          return;
        }
        setSelectedTextId(null);
        setActiveTextDraft({ x: locationX, y: locationY, pageIndex: pageIdx, text: '' });
        return;
      }

      // Pen or highlighter
      const pathId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      activePathIdRef.current = pathId;
      const isHL = isHighlightModeRef.current;
      const col = isHL ? highlightColorRef.current : activeColorRef.current;
      const sw = strokeWidthRef.current;
      setPaths((prev) => [
        ...prev,
        {
          id: pathId,
          pageIndex: pageIdx,
          color: col,
          width: isHL ? Math.max(16, sw * 4) : sw,
          opacity: isHL ? 0.38 : 1,
          isHighlight: isHL,
          points: [{ x: locationX, y: locationY }],
        },
      ]);
      setHistory((prev) => [...prev, { type: 'path', id: pathId }]);
    },
    onPanResponderMove: (event) => {
      if (!isEditModeRef.current || isPanModeRef.current) return;
      const { locationX, locationY } = event.nativeEvent;
      const pageIdx = activePageIndexRef.current;
      const layout = canvasLayoutRef.current;
      const viewport = getFittedPageViewport(pageIdx);
      const vp = viewport || { x: 0, y: 0, width: layout.width || 1, height: layout.height || 1 };
      const inside = locationX >= vp.x && locationX <= vp.x + vp.width
        && locationY >= vp.y && locationY <= vp.y + vp.height;

      if (isEraserModeRef.current) {
        if (!inside) return;
        setEraserCursor({ visible: true, x: locationX, y: locationY, radius: Math.max(16, strokeWidthRef.current * 4) });
        eraseAtPointImpl(locationX, locationY, pageIdx);
        return;
      }

      if (isTextModeRef.current) {
        const dragId = draggingTextIdRef.current;
        if (!dragId) return;
        const nextX = locationX - dragTextOffsetRef.current.x;
        const nextY = locationY - dragTextOffsetRef.current.y;
        setTextAnnotations((prev) => prev.map((ann) => {
          if (ann.id !== dragId) return ann;
          return {
            ...ann,
            x: Math.max(vp.x + 4, Math.min(vp.x + vp.width - 4, nextX)),
            y: Math.max(vp.y + 12, Math.min(vp.y + vp.height - 4, nextY)),
          };
        }));
        return;
      }

      if (!inside || !activePathIdRef.current) return;
      const pid = activePathIdRef.current;
      setPaths((prev) => prev.map((path) => {
        if (path.id !== pid) return path;
        return { ...path, points: [...path.points, { x: locationX, y: locationY }] };
      }));
    },
    onPanResponderRelease: () => {
      activePathIdRef.current = null;
      draggingTextIdRef.current = null;
      setEraserCursor((prev) => ({ ...prev, visible: false }));
    },
    onPanResponderTerminate: () => {
      activePathIdRef.current = null;
      draggingTextIdRef.current = null;
      setEraserCursor((prev) => ({ ...prev, visible: false }));
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []); // STABLE — all logic reads from refs

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
    setIsHighlightMode(false);
    setActiveTextDraft(null);
    setIsColorBarOpen(false);
    setSelectedTextId(null);
  };

  const selectTool = (tool) => {
    setIsEraserMode(tool === 'eraser');
    setIsTextMode(tool === 'text');
    setIsHighlightMode(tool === 'highlight');
    setIsPanMode(tool === 'pan');
    setActiveTextDraft(null);
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
    // Also clear the sidecar so cleared annotations don't reload next session
    if (pdfItem?.uri) {
      saveAnnotationData(pdfItem.uri, [], []).catch(() => {});
    }
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

  /**
   * saveAnnotations — writes to SIDECAR ONLY.
   * Does NOT bake into the PDF. Strokes stay fully erasable.
   * Call exportAnnotationsToPdf() to bake permanently.
   */
  const saveAnnotations = async ({ skipEmptyAlert = false } = {}) => {
    if (isSavingAnnotations) return;

    // Commit any active text draft
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

    const allPaths = paths.filter((p) => p.points?.length);
    const allTexts = [
      ...textAnnotations.filter((a) => a.text?.trim()),
      ...(draftText ? [draftText] : []),
    ];

    if (!allPaths.length && !allTexts.length) {
      if (!skipEmptyAlert) Alert.alert('No Annotations', 'Add drawings or text before saving.');
      return 'empty';
    }

    if (!pdfItem?.uri) {
      Alert.alert('Save Error', 'No PDF selected.');
      return 'error';
    }

    setIsSavingAnnotations(true);
    try {
      await saveAnnotationData(pdfItem.uri, allPaths, allTexts);
      if (draftText) {
        setTextAnnotations((prev) => [...prev, draftText]);
        setActiveTextDraft(null);
      }
      if (!skipEmptyAlert) {
        Alert.alert('Saved', 'Annotations saved. Use "Export to PDF" to bake them permanently into the file.');
      }
      return 'saved';
    } catch (err) {
      Alert.alert('Save Error', err?.message || 'Failed to save annotations.');
      return 'error';
    } finally {
      setIsSavingAnnotations(false);
    }
  };

  /**
   * exportAnnotationsToPdf — bakes all current sidecar strokes into the PDF permanently.
   * After export, the sidecar is cleared (strokes are now part of the PDF pixels).
   */
  const exportAnnotationsToPdf = async () => {
    if (isSavingAnnotations) return;

    const allPaths = pathsRef.current.filter((p) => p.points?.length);
    const allTexts = textAnnotationsRef.current.filter((a) => a.text?.trim());

    if (!allPaths.length && !allTexts.length) {
      Alert.alert('No Annotations', 'Nothing to export.');
      return;
    }

    if (!pdfItem?.uri || !canvasLayout.width || !canvasLayout.height) {
      Alert.alert('Export Error', 'Not ready. Try again.');
      return;
    }

    setIsSavingAnnotations(true);
    try {
      const sourceUri = ensureFileUri(pdfItem.uri);
      let sourceBase64;
      try {
        sourceBase64 = await FileSystem.readAsStringAsync(sourceUri, { encoding: FileSystem.EncodingType.Base64 });
      } catch {
        sourceBase64 = await FileSystem.readAsStringAsync(sourceUri.replace('file://', ''), { encoding: FileSystem.EncodingType.Base64 });
      }

      const pdfDoc = await PDFDocument.load(Buffer.from(sourceBase64, 'base64'));
      const pages = pdfDoc.getPages();
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

      allPaths.forEach((path) => {
        const page = pages[path.pageIndex];
        if (!page || path.points.length < 1) return;
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const pageSize = { width: pageWidth, height: pageHeight };
        const viewport = getFittedPageViewportForSave(path.pageIndex, pageSize);
        const color = hexToRgb(path.color);
        const scaleX = pageWidth / viewport.width;
        const scaleY = pageHeight / viewport.height;
        const mappedThickness = Math.max(0.5, path.width * ((scaleX + scaleY) / 2));
        const pathOpacity = path.opacity !== undefined ? path.opacity : 1;
        if (path.points.length === 1) {
          const pt = mapScreenPointToPdf(path.points[0], pageSize, path.pageIndex);
          page.drawCircle({ x: pt.x, y: pt.y, size: Math.max(0.75, mappedThickness * 0.5), color: rgb(color.r, color.g, color.b), opacity: pathOpacity });
          return;
        }
        for (let i = 1; i < path.points.length; i += 1) {
          const start = mapScreenPointToPdf(path.points[i - 1], pageSize, path.pageIndex);
          const end = mapScreenPointToPdf(path.points[i], pageSize, path.pageIndex);
          page.drawLine({ start, end, thickness: mappedThickness, color: rgb(color.r, color.g, color.b), opacity: pathOpacity });
        }
      });

      allTexts.forEach((ann) => {
        const page = pages[ann.pageIndex];
        if (!page || !ann.text) return;
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const pageSize = { width: pageWidth, height: pageHeight };
        const { x: mx, y: my, viewport } = mapScreenPointToPdf({ x: ann.x, y: ann.y }, pageSize, ann.pageIndex);
        const color = hexToRgb(ann.color);
        const scaleX = pageWidth / viewport.width;
        const scaleY = pageHeight / viewport.height;
        const mappedSize = Math.max(8, ann.fontSize * ((scaleX + scaleY) / 2));
        page.drawText(ann.text, { x: mx, y: Math.max(0, my - mappedSize * 0.2), size: mappedSize, font: helvetica, color: rgb(color.r, color.g, color.b) });
      });

      const outputUri = ensureFileUri(pdfItem.uri);
      const bytes = await pdfDoc.save();
      const updatedBase64 = Buffer.from(bytes).toString('base64');
      try {
        await FileSystem.writeAsStringAsync(outputUri, updatedBase64, { encoding: FileSystem.EncodingType.Base64 });
      } catch {
        await FileSystem.writeAsStringAsync(outputUri.replace('file://', ''), updatedBase64, { encoding: FileSystem.EncodingType.Base64 });
      }

      // Refresh viewer
      const cacheTarget = `${FileSystem.cacheDirectory}viewer_exported_${Date.now()}_${pdfItem.name || 'document.pdf'}`;
      try {
        await FileSystem.copyAsync({ from: outputUri, to: cacheTarget });
      } catch {
        await FileSystem.copyAsync({ from: outputUri.replace('file://', ''), to: cacheTarget });
      }

      // Clear sidecar — strokes are now baked and no longer erasable
      await saveAnnotationData(pdfItem.uri, [], []);
      setPaths([]);
      setTextAnnotations([]);
      setHistory([]);
      setActiveTextDraft(null);
      setViewerUri(withVersionQuery(cacheTarget));
      Alert.alert('Exported', 'Annotations permanently written to PDF. Note: baked strokes can no longer be erased.');
    } catch (err) {
      Alert.alert('Export Error', err?.message || 'Failed to export.');
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
    let isMounted = true;
    setViewerPassword('');
    setPasswordInput('');
    setShowPasswordPrompt(false);
    setIsEditMode(false);
    setIsPanMode(false);
    setIsEraserMode(false);
    setIsTextMode(false);
    setIsHighlightMode(false);
    setActiveTextDraft(null);
    setIsColorBarOpen(false);
    setPaths([]);
    setTextAnnotations([]);
    setHistory([]);
    setSelectedTextId(null);
    setViewerUri(withVersionQuery(pdfItem?.uri));

    // Load persisted sidecar annotations for the new PDF
    if (pdfItem?.uri) {
      loadAnnotations(pdfItem.uri).then((data) => {
        if (!isMounted || !data) return;
        if (data.paths?.length) setPaths(data.paths);
        if (data.textAnnotations?.length) setTextAnnotations(data.textAnnotations);
      }).catch(() => {});
    }
    return () => { isMounted = false; };
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
    // Only auto-enter annotation mode once per (pdf + action) combination
    if (requestedAction === 'annotate' && !autoAnnotateOpenedRef.current) {
      autoAnnotateOpenedRef.current = true;
      setIsEditMode(true);
      setIsPanMode(true); // Start in pan mode so user can scroll first, then pick a tool
      setIsEraserMode(false);
      setIsTextMode(false);
      setIsHighlightMode(false);
      setIsColorBarOpen(false);
    }
  }, [requestedAction]); // intentionally omit pdfItem?.uri so this only re-runs on action change

  React.useEffect(() => {
    // Reset the gate only when requestedAction changes away from 'annotate',
    // NOT on every pdfItem change (that caused double-firing).
    if (requestedAction !== 'annotate') {
      autoAnnotateOpenedRef.current = false;
    }
  }, [requestedAction]);

  React.useEffect(() => {
    const key = `${pdfItem?.uri || ''}|${requestedAction || ''}`;

    if (fallbackReportedRef.current === key) return;

    if (pdfItem?.uri && (!NativePdf || !viewerUri)) {
      fallbackReportedRef.current = key;
      onLoadComplete?.(0);
    }
  }, [pdfItem?.uri, requestedAction, viewerUri, onLoadComplete]);

  if (!pdfItem?.uri) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Invalid PDF item</Text>
      </View>
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
            style={[styles.svgOverlay, isPanMode && { opacity: 0 }]}
            pointerEvents={isEditMode && !isPanMode ? 'box-none' : 'none'}
          >
            <Svg width="100%" height="100%" pointerEvents="none">
              {pagePaths.map((path) => (
                <Path
                  key={path.id}
                  d={buildPathData(path.points)}
                  stroke={path.color}
                  strokeWidth={path.width}
                  strokeOpacity={path.opacity || 1}
                  fill="none"
                  strokeLinecap={path.isHighlight ? 'square' : 'round'}
                  strokeLinejoin={path.isHighlight ? 'miter' : 'round'}
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
              style={styles.canvasGestureLayer}
              pointerEvents={shouldCaptureAnnotationGestures ? 'auto' : 'none'}
              {...panResponder.panHandlers}
            />
          </View>
        </View>

        {/* ── ANNOTATION TOOLBAR ───────────────────────────── */}
        {isEditMode && (
          <View style={styles.annotationToolbar}>
            {/* Row 1: Tool buttons */}
            <View style={styles.atbRow}>
              {/* Pen */}
              <TouchableOpacity
                style={[styles.atbBtn, activeDrawTool === 'pen' && styles.atbBtnActive]}
                onPress={() => selectTool('pen')}
              >
                <MaterialCommunityIcons name="pencil" size={22} color={activeDrawTool === 'pen' ? COLORS.primary : '#ccc'} />
              </TouchableOpacity>

              {/* Highlighter */}
              <TouchableOpacity
                style={[styles.atbBtn, activeDrawTool === 'highlight' && styles.atbBtnActive]}
                onPress={() => selectTool('highlight')}
              >
                <MaterialCommunityIcons name="marker" size={22} color={activeDrawTool === 'highlight' ? '#FFD60A' : '#ccc'} />
              </TouchableOpacity>

              {/* Eraser */}
              <TouchableOpacity
                style={[styles.atbBtn, activeDrawTool === 'eraser' && styles.atbBtnActive]}
                onPress={() => selectTool('eraser')}
              >
                <MaterialCommunityIcons name="eraser" size={22} color={activeDrawTool === 'eraser' ? '#FF3B30' : '#ccc'} />
              </TouchableOpacity>

              {/* Text */}
              <TouchableOpacity
                style={[styles.atbBtn, activeDrawTool === 'text' && styles.atbBtnActive]}
                onPress={() => selectTool('text')}
              >
                <MaterialCommunityIcons name="format-text" size={22} color={activeDrawTool === 'text' ? COLORS.primary : '#ccc'} />
              </TouchableOpacity>

              {/* Pan / No-Draw mode — touch without drawing; use < > buttons to navigate pages */}
              <TouchableOpacity
                style={[styles.atbBtn, activeDrawTool === 'pan' && styles.atbBtnActive]}
                onPress={() => selectTool('pan')}
              >
                <MaterialCommunityIcons name="hand-back-right" size={22} color={activeDrawTool === 'pan' ? COLORS.primary : '#ccc'} />
              </TouchableOpacity>

              <View style={styles.atbDivider} />

              {/* Undo */}
              <TouchableOpacity
                style={[styles.atbBtn, !history.length && styles.atbBtnDisabled]}
                onPress={handleUndoLastPath}
                disabled={!history.length}
              >
                <MaterialCommunityIcons name="undo" size={22} color={history.length ? '#ccc' : '#555'} />
              </TouchableOpacity>

              {/* Clear */}
              <TouchableOpacity
                style={[styles.atbBtn, !(paths.length || textAnnotations.length) && styles.atbBtnDisabled]}
                onPress={() => {
                  Alert.alert('Clear All', 'Remove all annotations on this page?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Clear', style: 'destructive', onPress: handleClearPaths },
                  ]);
                }}
                disabled={!(paths.length || textAnnotations.length)}
              >
                <MaterialCommunityIcons name="delete-sweep" size={22} color={paths.length || textAnnotations.length ? '#FF3B30' : '#555'} />
              </TouchableOpacity>

              <View style={styles.atbDivider} />

              {/* Page prev */}
              <TouchableOpacity
                style={[styles.atbBtn, activePageIndex === 0 && styles.atbBtnDisabled]}
                onPress={() => goToPage(-1)}
                disabled={activePageIndex === 0}
              >
                <MaterialCommunityIcons name="chevron-left" size={22} color={activePageIndex === 0 ? '#555' : '#ccc'} />
              </TouchableOpacity>

              <Text style={styles.atbPageLabel}>{activePageIndex + 1}/{pageCount}</Text>

              {/* Page next */}
              <TouchableOpacity
                style={[styles.atbBtn, activePageIndex >= pageCount - 1 && styles.atbBtnDisabled]}
                onPress={() => goToPage(1)}
                disabled={activePageIndex >= pageCount - 1}
              >
                <MaterialCommunityIcons name="chevron-right" size={22} color={activePageIndex >= pageCount - 1 ? '#555' : '#ccc'} />
              </TouchableOpacity>

              <View style={styles.atbDivider} />

              {/* Save to sidecar (keeps strokes erasable) */}
              <TouchableOpacity
                style={[styles.atbSaveBtn, isSavingAnnotations && styles.atbBtnDisabled]}
                onPress={() => saveAnnotations()}
                disabled={isSavingAnnotations}
              >
                {isSavingAnnotations ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="content-save" size={20} color="#fff" />
                )}
              </TouchableOpacity>

              {/* Export: bake strokes permanently into PDF */}
              <TouchableOpacity
                style={[styles.atbExportBtn, isSavingAnnotations && styles.atbBtnDisabled]}
                onPress={() => {
                  Alert.alert(
                    'Export to PDF',
                    'This permanently bakes your annotations into the PDF. Baked strokes cannot be erased. Proceed?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Export', onPress: exportAnnotationsToPdf },
                    ]
                  );
                }}
                disabled={isSavingAnnotations}
              >
                <MaterialCommunityIcons name="file-export" size={20} color="#fff" />
              </TouchableOpacity>

              {/* Close annotation mode */}
              <TouchableOpacity
                style={styles.atbCloseBtn}
                onPress={() => {
                  if (paths.length || textAnnotations.length) {
                    Alert.alert('Exit Annotations?', 'Save your work before exiting?', [
                      { text: 'Save & Exit', onPress: async () => { await saveAnnotations({ skipEmptyAlert: true }); closeAnnotationMode(); } },
                      { text: 'Exit without Saving', style: 'destructive', onPress: closeAnnotationMode },
                      { text: 'Stay', style: 'cancel' },
                    ]);
                  } else {
                    closeAnnotationMode();
                  }
                }}
              >
                <MaterialCommunityIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Row 2: Color swatches + stroke size */}
            <View style={styles.atbRow}>
              {(activeDrawTool === 'highlight' ? HIGHLIGHT_COLORS : PEN_COLORS).map((c) => {
                const isCurrent = activeDrawTool === 'highlight' ? highlightColor === c : activeColor === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c, borderColor: isCurrent ? '#fff' : 'transparent' },
                    ]}
                    onPress={() => {
                      if (activeDrawTool === 'highlight') {
                        setHighlightColor(c);
                      } else {
                        setActiveColor(c);
                      }
                    }}
                  />
                );
              })}

              <View style={styles.atbDivider} />

              {/* Stroke size */}
              {[1, 3, 6, 10].map((size) => (
                <TouchableOpacity
                  key={size}
                  style={[styles.strokeDot, strokeWidth === size && styles.strokeDotActive]}
                  onPress={() => setStrokeWidth(size)}
                >
                  <View
                    style={{
                      width: Math.max(4, size * 2),
                      height: Math.max(4, size * 2),
                      borderRadius: size * 2,
                      backgroundColor: strokeWidth === size ? (activeDrawTool === 'highlight' ? '#FFD60A' : COLORS.primary) : '#888',
                    }}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

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

        {/* Floating Action Menu (FAB) – hidden when annotation toolbar is showing */}
        {!isEditMode && (
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

            {isMenuOpen && (
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
                  onPress={() => {
                    setIsMenuOpen(false);
                    // Enter annotation mode with pen active
                    setIsEditMode(true);
                    setIsPanMode(false);
                    setIsEraserMode(false);
                    setIsTextMode(false);
                    setIsHighlightMode(false);
                  }}
                  disabled={isZipping || isLocking || isOptimizing}
                >
                  <MaterialCommunityIcons name="pencil" size={24} color="#fff" />
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

            <TouchableOpacity
              style={styles.fabBtn}
              onPress={() => setIsMenuOpen(!isMenuOpen)}
            >
              <MaterialCommunityIcons name={isMenuOpen ? 'close' : 'dots-vertical'} size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

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
    bottom: 0,
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
  // ── Annotation Toolbar ────────────────────────────────────
  annotationToolbar: {
    backgroundColor: 'rgba(14, 14, 22, 0.97)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    elevation: 20,
    zIndex: 50,
  },
  atbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    paddingVertical: 4,
  },
  atbBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  atbBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  atbBtnDisabled: {
    opacity: 0.35,
  },
  atbDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 4,
  },
  atbPageLabel: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'center',
  },
  atbSaveBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  atbExportBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FF9F0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  atbCloseBtn: {
    height: 38,
    width: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,59,48,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    margin: 2,
  },
  strokeDot: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  strokeDotActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
});
