"use client"

import { PDFProvider } from "@/context/pdf-context"
import PDFWorkspace from "@/components/pdf-workspace"

export default function Home() {
  return (
    <PDFProvider>
      <main className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            PDF Audiobook Converter
          </h1>
          <p className="text-center text-gray-400 mb-8">
            Transform any PDF into an immersive audiobook experience
          </p>
          
          <PDFWorkspace />
        </div>
      </main>
    </PDFProvider>
  )
}

