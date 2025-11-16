# Installation & First Run

Follow these steps to get your certificate generator running.

## Prerequisites

Make sure you have:
- **Node.js 18+** ([Download here](https://nodejs.org/))
- **npm** (comes with Node.js) or **yarn** or **pnpm**
- A modern web browser

Check your Node version:
```bash
node --version
# Should show v18.0.0 or higher
```

## Step-by-Step Installation

### 1. Navigate to Project Directory

```powershell
cd C:\Users\RickCruz\Documents\Cert_gen
```

### 2. Install Dependencies

This will install all required packages:

```powershell
npm install
```

Expected output:
```
added 345 packages, and audited 346 packages in 45s
```

**This may take 2-3 minutes depending on your internet speed.**

### 3. Start Development Server

```powershell
npm run dev
```

Expected output:
```
▲ Next.js 14.2.0
- Local:        http://localhost:3000
- ready started server on 0.0.0.0:3000, url: http://localhost:3000
```

### 4. Open in Browser

Open your browser and navigate to:
```
http://localhost:3000
```

You should see the certificate generator with a default template!

## First Use

### Quick Test
1. **Click the burger menu (☰)** in the top-left
2. **Click on "Certificate of Achievement"** on the canvas
3. **Change the text** in the sidebar
4. **Drag it** to a new position
5. **Click "Export Single"** to download

### Bulk Export Test
1. Use the provided `sample-data.csv` file
2. In the sidebar, scroll to "Bulk Export"
3. Click "Upload Excel" and select `sample-data.csv`
4. Select the "John Doe" element from the dropdown
5. Click "Export Bulk"
6. Wait for the ZIP file to download

## Common Issues

### Issue: Port 3000 Already in Use
**Solution**: Use a different port
```powershell
npm run dev -- -p 3001
```
Then visit `http://localhost:3001`

### Issue: TypeScript Errors in Editor
**Solution**: These are normal before installation. After running `npm install`, restart your code editor (VS Code, etc.)

### Issue: Module Not Found Errors
**Solution**: Make sure you ran `npm install` in the correct directory:
```powershell
cd C:\Users\RickCruz\Documents\Cert_gen
npm install
```

### Issue: Permission Errors (Windows)
**Solution**: Run PowerShell as Administrator or use:
```powershell
npm install --legacy-peer-deps
```

## Verify Installation

After starting the dev server, you should see:
- ✅ A certificate with blue title text
- ✅ A burger menu icon in the top-left
- ✅ A moon icon (theme toggle) in the top-right
- ✅ The certificate on a white background with a subtle grid

Try these:
- ✅ Open the sidebar and see controls
- ✅ Drag an element on the canvas
- ✅ Toggle dark mode (moon/sun icon)
- ✅ Export a certificate

## Next Steps

Once everything is working:

1. **Read the Quick Start**: See `QUICKSTART.md` for basic usage
2. **Explore Features**: Try all the controls in the sidebar
3. **Test Bulk Export**: Use `sample-data.csv` to test bulk generation
4. **Customize**: See `SETUP.md` for customization options
5. **Build for Production**: When ready, run `npm run build`

## Production Build

To create an optimized production build:

```powershell
# Build the application
npm run build

# Start production server
npm start
```

The production server will run on `http://localhost:3000`

## Stopping the Server

To stop the development server:
- Press `Ctrl+C` in the terminal
- Type `Y` when asked to terminate

## Directory Structure Check

Make sure your directory looks like this:

```
C:\Users\RickCruz\Documents\Cert_gen\
├── app/
├── components/
├── lib/
├── types/
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── ...other files
```

## Getting Help

If you encounter issues:
1. Check the console for error messages
2. Make sure all files from this project are present
3. Try deleting `node_modules` and running `npm install` again:
   ```powershell
   Remove-Item -Recurse -Force node_modules
   npm install
   ```
4. Check [GitHub Issues](https://github.com/crux091/cert_gen/issues)

## Success Indicators

You'll know everything is working when:
- ✅ No errors in the terminal
- ✅ Browser shows the certificate editor
- ✅ You can drag elements
- ✅ Sidebar opens and closes smoothly
- ✅ Theme toggle works
- ✅ Export downloads a file

**Congratulations! Your certificate generator is ready to use! 🎉**

---

For more information:
- **Usage Guide**: See `README.md`
- **Quick Start**: See `QUICKSTART.md`
- **Configuration**: See `SETUP.md`
- **Technical Details**: See `PROJECT_SUMMARY.md`
