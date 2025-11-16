'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import CanvasEditor from '@/components/CanvasEditor'
import { CertificateElement, CanvasBackground } from '@/types/certificate'
import { ThemeProvider } from '@/components/ThemeProvider'

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [background, setBackground] = useState<CanvasBackground>({
    type: 'color',
    color: '#ffffff',
  })
  const [elements, setElements] = useState<CertificateElement[]>([])
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          elements={elements}
          setElements={setElements}
          selectedElementId={selectedElementId}
          setSelectedElementId={setSelectedElementId}
          canvasSize={canvasSize}
          setCanvasSize={setCanvasSize}
          background={background}
          setBackground={setBackground}
        />
        
        <main className="pt-16">
          <CanvasEditor
            elements={elements}
            setElements={setElements}
            selectedElementId={selectedElementId}
            setSelectedElementId={setSelectedElementId}
            canvasSize={canvasSize}
            background={background}
          />
        </main>
      </div>
    </ThemeProvider>
  )
}
