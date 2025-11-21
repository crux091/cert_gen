/**
 * Dynamically load a custom font from a URL
 * @param url - URL to font file (.woff2, .woff, .ttf) or CSS stylesheet
 * @param fontFamily - The font-family name to use
 */
export default async function loadFont(url: string, fontFamily: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Check if it's a CSS file (stylesheet URL)
      if (url.includes('.css') || url.includes('fonts.googleapis.com')) {
        // Load as stylesheet
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = url
        link.onload = () => resolve()
        link.onerror = () => reject(new Error('Failed to load font stylesheet'))
        document.head.appendChild(link)
      } else {
        // Load as font file using CSS Font Loading API
        const fontFace = new FontFace(fontFamily, `url(${url})`)
        
        fontFace.load()
          .then((loadedFace) => {
            document.fonts.add(loadedFace)
            resolve()
          })
          .catch((error) => {
            reject(new Error(`Failed to load font: ${error.message}`))
          })
      }
    } catch (error) {
      reject(error)
    }
  })
}
