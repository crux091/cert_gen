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
  const [elements, setElements] = useState<CertificateElement[]>([
    {
      id: '1',
      type: 'text',
      content: 'Certificate of Achievement',
      x: 200,
      y: 100,
      fontSize: 48,
      fontWeight: 'bold',
      fontFamily: 'Inter',
      color: '#0b69cc',
      alignment: 'center',
      locked: false,
      zIndex: 1,
    },
    {
      id: '2',
      type: 'text',
      content: 'John Doe',
      x: 200,
      y: 250,
      fontSize: 36,
      fontWeight: 'normal',
      fontFamily: 'Inter',
      color: '#000000',
      alignment: 'center',
      locked: false,
      zIndex: 2,
    },
    {
      id: '3',
      type: 'text',
      content: 'For outstanding performance and dedication',
      x: 200,
      y: 350,
      fontSize: 20,
      fontWeight: 'normal',
      fontFamily: 'Inter',
      color: '#666666',
      alignment: 'center',
      locked: false,
      zIndex: 3,
    },
    {
      id: '4',
      type: 'text',
      content: new Date().toLocaleDateString(),
      x: 200,
      y: 450,
      fontSize: 16,
      fontWeight: 'normal',
      fontFamily: 'Inter',
      color: '#999999',
      alignment: 'center',
      locked: false,
      zIndex: 4,
    },
  ])
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
