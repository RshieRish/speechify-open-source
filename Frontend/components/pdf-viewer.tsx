"use client"

import { useState, useEffect, useRef } from "react"
import { usePDF } from "@/context/pdf-context"
import { Document, Page, pdfjs } from "react-pdf"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Minimize2, Play, Loader2 } from "lucide-react"

// Initialize PDF.js worker
// Use a CDN that's more reliable
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

// Import required CSS for PDF viewer
import 'react-pdf/dist/esm/Page/TextLayer.css'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'

export default function PDFViewer() {
  const { 
    pdfFile, 
    currentPage, 
    totalPages, 
    setCurrentPage, 
    isPlaying, 
    isLoading,
    togglePlayPause,
    audioUrl,
    updateTotalPages
  } = usePDF()
  
  const [scale, setScale] = useState(1.0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [displayedPage, setDisplayedPage] = useState(currentPage)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Ensure PDF.js worker is loaded
  useEffect(() => {
    console.log("Setting up PDF.js worker")
    const workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  }, []);

  // Update displayed page when currentPage changes
  useEffect(() => {
    setDisplayedPage(currentPage);
    console.log(`Current page updated to ${currentPage}`);
  }, [currentPage]);

  // Handle document load success
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log(`PDF loaded with ${numPages} pages`);
    setNumPages(numPages);
    // Update the total pages in context
    if (numPages !== totalPages && numPages > 0) {
      console.log(`Updating total pages from ${totalPages} to ${numPages}`);
      updateTotalPages(numPages);
    }
  }

  // Handle document load error
  const onDocumentLoadError = (error: Error) => {
    console.error("Error loading PDF:", error);
    setError(`Error loading PDF: ${error.message}`);
  }

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  // Listen for fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [])

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && (numPages ? newPage <= numPages : newPage <= totalPages)) {
      console.log(`Changing to page ${newPage} of ${numPages || totalPages}`);
      setDisplayedPage(newPage);
      setCurrentPage(newPage);
    }
  }

  const handleZoom = (direction: "in" | "out") => {
    setScale((prev) => {
      if (direction === "in") return Math.min(prev + 0.2, 3)
      return Math.max(prev - 0.2, 0.5)
    })
  }

  if (!pdfFile) {
    return <div className="flex items-center justify-center h-[500px] text-gray-400">Upload a PDF to view</div>
  }

  if (error) {
    return <div className="flex items-center justify-center h-[500px] text-red-500">{error}</div>
  }

  return (
    <div ref={containerRef} className="flex flex-col h-[700px]">
      <div className="flex items-center justify-between border-b border-gray-700 p-4">
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => handlePageChange(displayedPage - 1)}
            disabled={displayedPage <= 1}
            className="border-gray-700 hover:bg-gray-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center space-x-2">
            <Input
              type="number"
              min={1}
              max={numPages || totalPages}
              value={displayedPage}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value)) {
                  handlePageChange(value);
                }
              }}
              className="w-16 bg-gray-800 border-gray-700"
            />
            <span className="text-gray-400">/ {numPages || totalPages}</span>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => handlePageChange(displayedPage + 1)}
            disabled={displayedPage >= (numPages || totalPages)}
            className="border-gray-700 hover:bg-gray-700"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          <Button
            onClick={togglePlayPause}
            disabled={isLoading}
            className="ml-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : isPlaying ? (
              "Pause Audio"
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Play Page
              </>
            )}
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleZoom("out")}
            className="border-gray-700 hover:bg-gray-700"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>

          <Slider
            value={[scale * 100]}
            min={50}
            max={300}
            step={10}
            onValueChange={([value]) => setScale(value / 100)}
            className="w-32"
          />

          <Button
            variant="outline"
            size="icon"
            onClick={() => handleZoom("in")}
            className="border-gray-700 hover:bg-gray-700"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={toggleFullscreen}
            className="border-gray-700 hover:bg-gray-700"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 bg-gray-900/50">
        <div className="flex justify-center">
          <Document
            file={pdfFile}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            className="pdf-document"
          >
            <Page
              pageNumber={displayedPage}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-xl"
              error={<div className="text-red-500 p-4">Error loading page!</div>}
              noData={<div className="text-gray-400 p-4">No PDF data</div>}
              loading={<div className="text-blue-400 p-4">Loading page...</div>}
            />
          </Document>
        </div>
      </div>
    </div>
  )
}

