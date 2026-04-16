# PDF Page Management Integration Guide

This guide shows how to integrate the PDF page management functionality (add/insert blank pages) into your React Native app.

## Components Overview

### 1. **Core Utility Function** - `managePdfPages()`
**Location:** `utils/pdfUtils.js`

The low-level function that handles all PDF operations:
- Reads PDF as Base64
- Loads with pdf-lib
- Adds or inserts A4-sized blank pages
- Saves back to filesystem
- Returns version timestamp for re-render triggers

```javascript
import { managePdfPages } from '../utils/pdfUtils';

// Add page to end
const version = await managePdfPages(pdfPath, 'ADD_END');

// Insert page at index 1 (between page 1 and 2)
const version = await managePdfPages(pdfPath, 'INSERT_AT', 1);
```

### 2. **Custom Hook** - `usePdfPageManager()`
**Location:** `hooks/usePdfPageManager.js`

Wraps the utility function with:
- Loading state management
- Error handling with alerts
- Success callbacks for UI updates
- User-friendly error messages

```javascript
const { isProcessing, addPageAtEnd, insertPageAt, error, clearError } = 
  usePdfPageManager();

// Use in your component
await addPageAtEnd(pdfPath, (version) => {
  // Re-render PDF viewer with new version
});
```

### 3. **Modal Component** - `ManagePdfPagesModal`
**Location:** `components/ManagePdfPagesModal.js`

Complete UI for page management:
- Mode selection (Add vs Insert)
- Input validation
- Loading indicator ("Processing...")
- Info box with instructions
- Error display

## Usage Example

### Basic Integration in Your Component

```javascript
import { useState, useRef } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { ManagePdfPagesModal } from './components/ManagePdfPagesModal';

export function PDFEditorScreen({ pdfPath, pdfPageCount }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [pdfVersion, setPdfVersion] = useState(Date.now());

  const handlePagesUpdated = (newVersion) => {
    // Update version to trigger re-render of react-native-pdf viewer
    setPdfVersion(newVersion);
    setModalVisible(false);
  };

  return (
    <View>
      <TouchableOpacity 
        onPress={() => setModalVisible(true)}
        style={{ padding: 10, backgroundColor: '#007AFF' }}
      >
        <Text style={{ color: '#fff' }}>Add/Insert Pages</Text>
      </TouchableOpacity>

      <ManagePdfPagesModal
        visible={modalVisible}
        pdfPath={pdfPath}
        currentPageCount={pdfPageCount}
        onCancel={() => setModalVisible(false)}
        onSuccess={handlePagesUpdated}
      />

      {/* Your PDF Viewer - add key prop to force re-render */}
      <PdfComponent
        key={`pdf-${pdfVersion}`}
        source={{ uri: `file://${pdfPath}` }}
      />
    </View>
  );
}
```

### Direct Function Usage (Without Modal)

```javascript
import { usePdfPageManager } from './hooks/usePdfPageManager';

function MyComponent({ pdfPath }) {
  const { isProcessing, addPageAtEnd, insertPageAt } = usePdfPageManager();

  const handleQuickAddPage = async () => {
    const version = await addPageAtEnd(pdfPath, (newVersion) => {
      // Handle success - refresh UI
      console.log('Page added, new version:', newVersion);
    });
  };

  return (
    <TouchableOpacity 
      onPress={handleQuickAddPage}
      disabled={isProcessing}
      style={{ opacity: isProcessing ? 0.5 : 1 }}
    >
      <Text>{isProcessing ? 'Processing...' : 'Add Page'}</Text>
    </TouchableOpacity>
  );
}
```

### Integration with Existing PDFViewerModal

```javascript
import { PDFViewerModal } from './components/PDFViewerModal';
import { ManagePdfPagesModal } from './components/ManagePdfPagesModal';

export function PDFView() {
  const [pdfVersion, setPdfVersion] = useState(1);
  const [managePagesVisible, setManagePagesVisible] = useState(false);
  const [activePdf, setActivePdf] = useState(null);

  const handlePagesModified = (newVersion) => {
    // Update the version to trigger re-render
    setPdfVersion(newVersion);
    setManagePagesVisible(false);
  };

  return (
    <>
      <PDFViewerModal
        visible={viewerModalVisible}
        pdfUri={activePdf?.uri}
        pdfTitle={activePdf?.name}
        onEditPages={() => setManagePagesVisible(true)}
      />

      <ManagePdfPagesModal
        visible={managePagesVisible}
        pdfPath={activePdf?.uri}
        currentPageCount={activePdf?.pageCount || 0}
        onCancel={() => setManagePagesVisible(false)}
        onSuccess={handlePagesModified}
      />
    </>
  );
}
```

## How It Works

### Data Flow

```
User clicks "Add Page"
        ↓
Modal -> usePdfPageManager -> managePdfPages()
        ↓
1. Read PDF from filesystem as Base64
        ↓
2. Convert Base64 → Buffer → Uint8Array
        ↓
3. Load with PDFDocument.load()
        ↓
4. Add/Insert blank A4 page (595x842 points)
        ↓
5. Save: pdfDoc.save() → Buffer → Base64 → Write to filesystem
        ↓
6. Return timestamp (version key)
        ↓
onSuccess callback → Update state → Re-render PDF viewer
        ↓
User sees updated PDF with new page
```

### Re-render Trigger Strategy

The react-native-pdf viewer doesn't detect file changes automatically. Force updates using:

**Option 1: Key-based (Recommended)**
```javascript
<PdfView key={`pdf-${pdfVersion}`} source={{ uri }} />
```

**Option 2: Ref-based**
```javascript
const pdfRef = useRef();

// After PDF is modified:
pdfRef.current?.reload?.();
```

**Option 3: State-based**
```javascript
const [refreshKey, setRefreshKey] = useState(0);

// After PDF is modified:
setRefreshKey(prev => prev + 1);
```

## Error Handling

The hook and components handle:
- ✅ Invalid PDF paths
- ✅ Corrupted PDF files
- ✅ Invalid page indices
- ✅ File system permission errors
- ✅ Large file processing delays

Errors are shown via:
1. Alert dialogs to the user
2. Console errors for debugging
3. Error state accessible in the hook

## Performance Considerations

- **Large PDFs**: Processing may take 1-2 seconds (shows loader)
- **Multiple Operations**: Queue operations to avoid concurrent file access
- **File Size**: Adding pages increases file size slightly (~50-100 bytes per page)

## Dependencies

Required packages (already in your project):
- `pdf-lib` - PDF manipulation
- `expo-file-system/legacy` - File operations
- `buffer` - Binary data conversion

## API Reference

### `managePdfPages(existingPath, action, index)`

**Parameters:**
- `existingPath` (string, required): Full filesystem path to PDF
- `action` (string, required): `'ADD_END'` or `'INSERT_AT'`
- `index` (number, optional): 0-based page index for `INSERT_AT`

**Returns:**
- `Promise<number>`: Timestamp for version updates, or throws error

**Actions:**
- `'ADD_END'`: Append blank A4 page to end
- `'INSERT_AT'`: Insert blank A4 page at index (0=before first page)

### Hook: `usePdfPageManager()`

**Returns Object:**
- `isProcessing` (boolean): Operation in progress
- `addPageAtEnd(path, onSuccess?)`: Add page to end
- `insertPageAt(path, index, onSuccess?)`: Insert page at index
- `error` (string|null): Last error message
- `clearError()`: Clear error state

## Troubleshooting

### PDF not updating after adding page
- Ensure you're using the returned version timestamp
- Try unmounting/remounting the PDF component
- Clear app cache if problem persists

### "Failed to add page" error
- Check PDF file is not corrupted
- Verify file path is correct
- Check app has read/write permissions

### Slow performance on large PDFs
- Normal for files >50MB (pdf-lib processes in memory)
- Show clear loading indicator to user
- Consider splitting large PDFs

## Next Steps

1. Add "Edit Pages" button to PDFViewerModal
2. Create batch operations (add multiple pages)
3. Add page deletion functionality
4. Persist page operations to undo/redo stack
