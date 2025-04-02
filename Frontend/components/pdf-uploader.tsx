"use client"

import type React from "react"

import { useState, useRef } from "react"
import { usePDF } from "@/context/pdf-context"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Upload, FileText, AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function PDFUploader() {
  const { uploadPDF } = usePDF()
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelection(files[0])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0])
    }
  }

  const handleFileSelection = (file: File) => {
    if (file.type !== "application/pdf") {
      setError("Please select a valid PDF file")
      setSelectedFile(null)
      return
    }

    setError(null)
    setSelectedFile(file)
    // Automatically start the upload process when a file is selected
    handleUpload(file)
  }

  const handleUpload = async (file: File = selectedFile!) => {
    if (!file) return

    try {
      setIsUploading(true)
      setError(null)

      // Simulate progress
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval)
            return 90
          }
          return prev + 10
        })
      }, 200)

      await uploadPDF(file)

      clearInterval(interval)
      setUploadProgress(100)

      // Reset after completion
      setTimeout(() => {
        setIsUploading(false)
        setUploadProgress(0)
        setSelectedFile(null) // Clear the selected file after successful upload
      }, 500)
    } catch (error) {
      setError("Failed to process PDF. Please try another file.")
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          isDragging ? "border-cyan-400 bg-cyan-400/10" : "border-gray-700 hover:border-gray-600"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} ref={fileInputRef} />

        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
            <Upload className="h-8 w-8 text-cyan-400" />
          </div>

          <div>
            <h3 className="text-lg font-medium">Upload your PDF</h3>
            <p className="text-gray-400 text-sm mt-1">Drag and drop your file here or click to browse</p>
          </div>

          <Button variant="outline" onClick={triggerFileInput} className="border-gray-700 hover:bg-gray-700">
            Select PDF
          </Button>
        </div>
      </div>

      {selectedFile && isUploading && (
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <FileText className="h-8 w-8 text-cyan-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-gray-400">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
          <div className="mt-3">
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-xs text-gray-400 mt-1">
              {uploadProgress < 100 ? "Loading PDF and preparing viewer..." : "Completed!"}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

