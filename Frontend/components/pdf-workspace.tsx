"use client"

import { useState } from "react"
import { usePDF } from "@/context/pdf-context"
import PDFUploader from "@/components/pdf-uploader"
import PDFViewer from "@/components/pdf-viewer"
import AudioPlayer from "@/components/audio-player"
import LyricsDisplay from "@/components/lyrics-display"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function PDFWorkspace() {
  const { pdfFile } = usePDF()
  const [activeTab, setActiveTab] = useState<string>("upload")

  // When a PDF is uploaded, switch to the viewer tab
  if (pdfFile && activeTab === "upload") {
    setActiveTab("viewer")
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl border border-gray-700 overflow-hidden min-h-[700px]">
          {!pdfFile ? (
            <div className="p-6 flex items-center justify-center h-full">
              <PDFUploader />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full">
              <div className="border-b border-gray-700">
                <TabsList className="bg-transparent w-full justify-start px-4 pt-2">
                  <TabsTrigger value="viewer" className="data-[state=active]:bg-gray-700">
                    PDF Viewer
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="data-[state=active]:bg-gray-700">
                    Upload New
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="viewer" className="m-0 h-full">
                <PDFViewer />
              </TabsContent>

              <TabsContent value="upload" className="m-0 p-4">
                <PDFUploader />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      <div className="lg:col-span-5 space-y-4">
        <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl border border-gray-700 p-4">
          <h3 className="font-medium mb-3 text-lg text-cyan-400">Audio Player</h3>
          <AudioPlayer />
        </div>

        <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl border border-gray-700 overflow-hidden">
          <div className="border-b border-gray-700 px-4 py-2">
            <h3 className="font-medium">Synchronized Text</h3>
          </div>
          <LyricsDisplay />
        </div>
      </div>
    </div>
  )
}

