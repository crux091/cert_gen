# Advanced Variable-Based Certificate Generation

## Overview

The certificate generator now supports **bracket-based variable binding** for dynamic, multi-field certificate generation. This enables professional document automation with data from CSV/Excel files.

## Features Implemented

### ✅ 1. Direct Canvas Paste with Formatting Preservation
- **Ctrl+V / Cmd+V** directly on canvas creates text boxes
- Preserves paragraph-level formatting:
  - Font family
  - Font size
  - Text alignment (left/center/right)
  - Font weight (bold)
  - Text color

### ✅ 2. Bracket-Based Variable System
- Variables defined using `[VariableName]` syntax
- Case-sensitive matching: `[Name]` ≠ `[name]`
- Works across multiple text boxes
- Example:
  ```
  I, [Name] do solemnly swear as [Position]...
  ```

### ✅ 3. CSV Dataset Integration
- **Upload Dataset** button in Export tab
- Supports `.xlsx`, `.xls`, and `.csv` files
- Parses all columns and rows
- Shows row/column count after upload

### ✅ 4. Variable Binding UI
- Automatically detects all `[variables]` in text
- Click-to-bind dropdowns for each variable
- Maps variables to CSV column names
- Visual indicators:
  - ✓ Green checkmark for bound variables
  - Yellow border for unbound variables

### ✅ 5. Multi-Variable Bulk Export
- **PNG All** and **PDF All** buttons
- Replaces all variables across all text boxes
- Generates one certificate per CSV row
- Downloads as ZIP file

### ✅ 6. Formatting Preservation During Export
- Bold/italic applied to `[Name]` transfers to actual data
- Character-level style preservation
- Vertical text wrapping with fixed width

### ✅ 7. Data Validation
- Pre-export validation checks for:
  - Unbound variables
  - Missing data in CSV rows
  - Mixed data types (images/text) in columns
- Error notifications specify row and column

### ✅ 8. Image Variable Support
- Bind variables to image URL columns
- Automatic image detection (http://, .png, .jpg, etc.)
- Downloads and inserts images during export
- Validates image URLs before processing

### ✅ 9. Preview Functionality
- **Preview First** button renders first CSV row
- Validates bindings before bulk export
- Shows exactly how certificates will look

## Usage Workflow

### Step 1: Design Template
1. Upload PNG background via **Import** tab
2. Paste text content directly on canvas (Ctrl+V)
3. Formatting is automatically preserved

### Step 2: Add Variables
1. Double-click text to edit
2. Type brackets around dynamic fields: `[Name]`, `[Position]`, `[Date]`
3. Variables are case-sensitive

### Step 3: Upload Dataset
1. Go to **Export** tab
2. Click **Upload Dataset**
3. Select your CSV/Excel file
4. System shows row/column count

### Step 4: Bind Variables
1. **Variable Bindings** section appears automatically
2. Each detected variable shows with a dropdown
3. Select corresponding CSV column for each variable
4. Green checkmark appears when bound

### Step 5: Preview & Export
1. Click **Preview First** to see first certificate
2. Verify all data appears correctly
3. Click **PNG All** or **PDF All** for bulk export
4. ZIP file downloads with all certificates

## Example Dataset

```csv
Name,Position,Date,Signature
John Doe,President,2025-01-15,https://example.com/signatures/john.png
Jane Smith,Vice President,2025-01-15,https://example.com/signatures/jane.png
Bob Johnson,Secretary,2025-01-15,https://example.com/signatures/bob.png
```

## Example Certificate Text

```
Oath of Office
Of GG - APC

I, [Name] do solemnly swear (or affirm) that I will support, uphold, and defend 
the Constitution of Asia Pacific College Gaming Genesis (APCGG), as the 
organization's [Position]; I further swear (or affirm) that I will faithfully 
discharge my duties as [Position] to the best of my ability.

[Signature]
[Name]
[Position]
```

## Variable Binding Result

| Variable | CSV Column | Example Value |
|----------|------------|---------------|
| `[Name]` | Name | John Doe |
| `[Position]` | Position | President |
| `[Signature]` | Signature | https://example.com/signatures/john.png |

## Error Messages

### "Unbound variables detected"
**Cause:** Variables in text haven't been mapped to CSV columns  
**Solution:** Bind all variables using the dropdowns in Variable Bindings section

### "Missing data in column [X] for row [Y]"
**Cause:** CSV has empty cells in required columns  
**Solution:** Fill missing data in CSV file and re-upload

### "Column [X] contains mixed data types"
**Cause:** Image URL column has some text values  
**Solution:** Ensure image columns contain only valid image URLs

### "Failed to load image from URL"
**Cause:** Image URL is invalid or inaccessible  
**Solution:** Verify image URLs are publicly accessible

## Technical Details

### Supported Formatting
- **Paragraph-level:** Font family, size, color, alignment, weight
- **Character-level:** Bold, italic on individual words during export
- **Vertical wrapping:** Text auto-wraps within fixed width textbox

### Image URL Detection
Recognizes these patterns as images:
- `http://` or `https://` URLs
- `data:image` base64 encoded images
- Files ending in `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`

### Export Quality
- **Default DPI:** 300 (high resolution)
- **Format:** PNG (lossless) or PDF (vector-compatible)
- **Batch processing:** 500ms delay between certificates for stability

## Backward Compatibility

Legacy single-element bulk export still works in **Legacy Bulk Export** section:
- Upload Excel → Select element → Export All
- For simple name-only certificates

## Tips & Best Practices

1. **Test with Preview:** Always preview first certificate before bulk export
2. **Consistent Formatting:** Format `[variables]` as desired—bold, colored, etc.
3. **Image Sizing:** Set placeholder text size to control image dimensions
4. **Column Names:** Use clear CSV headers that match your variable names
5. **Data Validation:** Check CSV for empty cells before upload
6. **Backup Template:** Save layout via **Layout** tab before bulk export

## Limitations

- Variables are **case-sensitive**: `[Name]` ≠ `[name]`
- Images replace entire text box (no inline images within paragraphs)
- Formatting preservation works at character level, not word level
- Network-dependent: Image URLs must be accessible during export

## Future Enhancements (Not Yet Implemented)

- Live variable preview on canvas (badges showing bound status)
- Conditional variables (show/hide based on data)
- Formula-based variables (computed from other columns)
- QR code generation from data fields
- Multi-page certificate support
