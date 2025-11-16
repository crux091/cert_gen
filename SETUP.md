## Setup Instructions

Follow these steps to get the certificate generator running on your machine:

### 1. Install Node.js
Make sure you have Node.js 18 or higher installed. Check your version:
```bash
node --version
```

If you need to install Node.js, download it from [nodejs.org](https://nodejs.org/)

### 2. Install Dependencies
Open a terminal in the project directory and run:
```bash
npm install
```

This will install all required packages including:
- Next.js and React
- Tailwind CSS for styling
- Framer Motion for animations
- react-rnd for drag-and-drop
- html2canvas and jsPDF for exports
- xlsx for Excel parsing
- JSZip for bulk exports

### 3. Run Development Server
Start the development server:
```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000)

### 4. Build for Production (Optional)
To create an optimized production build:
```bash
npm run build
npm start
```

## Quick Start Guide

### Creating Your First Certificate

1. **Open the app** in your browser (http://localhost:3000)
2. **Click the menu icon (☰)** in the top-left to open the sidebar
3. **Customize the default template**:
   - Click on any text element on the canvas
   - Edit the content, font, size, color in the sidebar
   - Drag elements to reposition them
4. **Export**: Choose PNG or PDF and click "Export Single"

### Bulk Generating Certificates

1. **Prepare an Excel file** with a column of names:
   ```
   Name
   John Doe
   Jane Smith
   Bob Johnson
   ```

2. **In the sidebar**, scroll to "Bulk Export"
3. **Click "Upload Excel"** and select your file
4. **Select the name element** from the dropdown (usually "John Doe")
5. **Click "Export Bulk"** and wait for the ZIP file to download

### Saving Your Layout

1. Design your perfect certificate template
2. In the sidebar, click "Save Current Layout"
3. Enter a name (e.g., "Company Certificate")
4. Click "Save"

To reload it later, just click the folder icon next to the saved layout!

## Troubleshooting

### Port 3000 is already in use
If you see an error about port 3000 being in use, you can run on a different port:
```bash
npm run dev -- -p 3001
```

### TypeScript errors on first run
Some TypeScript errors are normal before running `npm install`. After installation, restart your editor.

### Export not working
Make sure you have a modern browser (Chrome, Firefox, Safari, Edge). Exports use HTML5 Canvas APIs that require recent browser versions.

### Excel upload failing
Ensure your Excel file has at least one column with data. The file should be .xlsx, .xls, or .csv format.

## Configuration

### Changing the Blue Color Theme
Edit `tailwind.config.js` and change the primary colors:
```js
primary: {
  500: '#0ea5e9', // Change this to your preferred blue
  600: '#0b69cc', // Change this to a darker shade
}
```

### Adjusting Export Quality
Edit `lib/exportService.ts` and change the DPI value:
```typescript
const scale = (options.dpi || 300) / 96
// Change 300 to 150 (smaller files) or 600 (higher quality)
```

### Changing Default Canvas Size
Edit `app/page.tsx` and modify:
```typescript
const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
// Change to your preferred dimensions
```

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [React Documentation](https://react.dev/)

Need help? [Open an issue](https://github.com/crux091/cert_gen/issues) on GitHub!
