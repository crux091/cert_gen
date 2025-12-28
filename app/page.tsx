'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Ribbon from '@/components/Ribbon'
import CanvasEditor from '@/components/CanvasEditor'
import { CertificateElement, CanvasBackground, CSVData, VariableBindings } from '@/types/certificate'

export default function Home() {
  const [background, setBackground] = useState<CanvasBackground>({
    type: 'color',
    color: '#ffffff',
  })
  const [elements, setElements] = useState<CertificateElement[]>([])
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const [csvData, setCsvData] = useState<CSVData | null>(null)
  const [variableBindings, setVariableBindings] = useState<VariableBindings>({})

  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 transition-colors flex flex-col overflow-hidden">
      <Header />
      
      <div className="pt-16 flex-none z-40 relative">
        <Ribbon
          elements={elements}
          setElements={setElements}
          selectedElementId={selectedElementId}
          setSelectedElementId={setSelectedElementId}
          canvasSize={canvasSize}
          setCanvasSize={setCanvasSize}
          background={background}
          setBackground={setBackground}
          csvData={csvData}
          setCsvData={setCsvData}
          variableBindings={variableBindings}
          setVariableBindings={setVariableBindings}
        />
      </div>
      
      <main className="flex-1 overflow-auto relative z-0 bg-gray-200 dark:bg-gray-950">
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
  )
}
