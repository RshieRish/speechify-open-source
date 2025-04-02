"use client"

import { useState, useEffect, useRef } from "react"
import { usePDF } from "@/context/pdf-context"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Settings } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function AudioPlayer() {
  const { 
    pdfText, 
    isPlaying, 
    progress, 
    togglePlayPause, 
    setProgress, 
    skipForward, 
    skipBackward, 
    audioUrl,
    isLoading,
    error,
    voices,
    selectedVoice,
    setSelectedVoice,
    currentPage
  } = usePDF()

  const [volume, setVolume] = useState(100)
  const [isMuted, setIsMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | undefined>(undefined)

  // Audio visualization
  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    const drawVisualization = () => {
      ctx.clearRect(0, 0, width, height)

      // Draw background
      ctx.fillStyle = "rgba(17, 24, 39, 0.5)"
      ctx.fillRect(0, 0, width, height)

      // Draw progress bar
      const progressWidth = (progress / 100) * width
      ctx.fillStyle = "rgba(6, 182, 212, 0.5)"
      ctx.fillRect(0, 0, progressWidth, height)

      // Draw waveform (simulated)
      ctx.beginPath()
      ctx.lineWidth = 2
      ctx.strokeStyle = isPlaying ? "rgb(6, 182, 212)" : "rgb(156, 163, 175)"

      const segments = 100
      const segmentWidth = width / segments

      ctx.moveTo(0, height / 2)

      for (let i = 0; i < segments; i++) {
        const x = i * segmentWidth

        // Create a more dynamic waveform when playing
        const amplitude = isPlaying ? Math.sin(Date.now() / 200 + i / 5) * 10 + Math.random() * 5 : Math.sin(i / 5) * 5

        const y = height / 2 + amplitude

        ctx.lineTo(x, y)
      }

      ctx.stroke()

      animationRef.current = requestAnimationFrame(drawVisualization)
    }

    drawVisualization()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, progress])

  const handleProgressChange = (value: number[]) => {
    setProgress(value[0])
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="relative h-16 bg-gray-800 rounded-lg animate-pulse">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-gray-400">Processing page {currentPage}...</span>
          </div>
        </div>
        <div className="flex justify-center">
          <Button disabled className="w-12 h-12 rounded-full bg-gray-700">
            <Play className="h-6 w-6 ml-0.5 text-gray-400" />
          </Button>
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="space-y-4">
        <div className="relative h-16 bg-red-900/20 rounded-lg border border-red-900">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-red-400">{error}</span>
          </div>
        </div>
        <div className="flex justify-center">
          <Button disabled className="w-12 h-12 rounded-full bg-gray-700">
            <Play className="h-6 w-6 ml-0.5 text-gray-400" />
          </Button>
        </div>
      </div>
    )
  }

  // Show empty state
  if (!pdfText || !audioUrl) {
    return (
      <div className="space-y-4">
        <div className="relative h-16 bg-gray-800/50 rounded-lg">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-gray-400">Use the "Play Page" button to listen to the current page</span>
          </div>
        </div>
        <div className="flex justify-center">
          <Button disabled className="w-12 h-12 rounded-full bg-gray-700">
            <Play className="h-6 w-6 ml-0.5 text-gray-400" />
          </Button>
        </div>
      </div>
    )
  }

  // Estimate total duration based on average reading speed (150 words per minute)
  const estimatedDuration = pdfText ? Math.ceil((pdfText.split(/\s+/).length / 150) * 60) : 0
  const currentTime = Math.ceil((progress / 100) * estimatedDuration)

  return (
    <div className="space-y-4">
      <div className="relative h-16">
        <canvas ref={canvasRef} width={500} height={64} className="w-full h-full rounded-lg" />
        <div className="absolute top-2 left-2 px-2 py-1 bg-gray-800/80 rounded text-xs text-gray-300">
          Page {currentPage} Audio
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">{formatTime(currentTime)}</span>
        <span className="text-sm text-gray-400">{formatTime(estimatedDuration)}</span>
      </div>

      <Slider value={[progress]} min={0} max={100} step={0.1} onValueChange={handleProgressChange} className="my-2" />

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="icon" onClick={skipBackward} className="border-gray-700 hover:bg-gray-700">
            <SkipBack className="h-4 w-4" />
          </Button>

          <Button
            onClick={togglePlayPause}
            size="icon"
            className={`w-12 h-12 rounded-full ${
              isPlaying
                ? "bg-cyan-500 hover:bg-cyan-600"
                : "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
            }`}
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
          </Button>

          <Button variant="outline" size="icon" onClick={skipForward} className="border-gray-700 hover:bg-gray-700">
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" onClick={toggleMute} className="hover:bg-gray-700">
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>

          <Slider
            value={[volume]}
            min={0}
            max={100}
            step={1}
            onValueChange={([value]) => setVolume(value)}
            className="w-24"
            disabled={isMuted}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="hover:bg-gray-700">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-gray-800 border-gray-700 text-white">
              <DropdownMenuLabel>Voice Settings</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-gray-700" />

              <div className="px-2 py-1.5">
                <label className="text-xs font-medium">Voice</label>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full mt-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm"
                >
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name} ({voice.language})
                    </option>
                  ))}
                </select>
              </div>

              <div className="px-2 py-1.5">
                <label className="text-xs font-medium">Speed</label>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-xs">0.5x</span>
                  <Slider
                    value={[rate]}
                    min={0.5}
                    max={2}
                    step={0.1}
                    onValueChange={([value]) => setRate(value)}
                    className="flex-1"
                  />
                  <span className="text-xs">2x</span>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

