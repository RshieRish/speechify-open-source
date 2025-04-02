"use client"

import { useRef, useEffect } from "react"
import { usePDF } from "@/context/pdf-context"

export default function LyricsDisplay() {
  const { pdfText, currentWordIndex, words, segments, isLoading, currentPage, progress } = usePDF()
  const containerRef = useRef<HTMLDivElement>(null)
  const highlightedRef = useRef<HTMLSpanElement>(null)
  const activeSegmentRef = useRef<HTMLDivElement>(null)

  // Use a more responsive approach to scrolling to the highlighted word
  useEffect(() => {
    if (highlightedRef.current && containerRef.current) {
      // Calculate center position
      const highlightOffset = highlightedRef.current.offsetTop
      const containerHeight = containerRef.current.clientHeight
      
      // Calculate smooth scroll velocity based on distance
      const currentScrollTop = containerRef.current.scrollTop
      const targetScrollTop = highlightOffset - containerHeight / 2
      const scrollDistance = Math.abs(targetScrollTop - currentScrollTop)
      
      // Use smoother scrolling for large jumps
      const behavior = scrollDistance > 300 ? "auto" : "smooth"
      
      // Smooth scroll to keep highlighted word in center
      containerRef.current.scrollTo({
        top: targetScrollTop,
        behavior,
      })
    }
  }, [currentWordIndex])

  // Also scroll to active segment when it changes
  useEffect(() => {
    if (activeSegmentRef.current && containerRef.current) {
      const segmentOffset = activeSegmentRef.current.offsetTop
      const containerHeight = containerRef.current.clientHeight
      
      // Check if segment is out of view
      const containerScrollTop = containerRef.current.scrollTop
      const containerScrollBottom = containerScrollTop + containerHeight
      
      if (segmentOffset < containerScrollTop || segmentOffset > containerScrollBottom) {
        containerRef.current.scrollTo({
          top: segmentOffset - 20,
          behavior: "smooth",
        })
      }
    }
  }, [currentWordIndex])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="animate-pulse">Generating audio for page {currentPage}...</div>
      </div>
    )
  }

  if (!pdfText) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p className="text-center">
          Navigate to a page in the PDF viewer and press the "Play Page" button to see synchronized text
        </p>
      </div>
    )
  }

  // Calculate which segment the current word belongs to
  const getWordDisplay = () => {
    let wordCount = 0
    let activeSegmentIndex = -1;
    
    // Pre-calculate active segment for better rendering
    segments.forEach((segment, idx) => {
      const segmentWords = segment.text.split(/\s+/).filter(word => word.trim() !== "")
      const segmentStartIndex = wordCount
      const segmentEndIndex = segmentStartIndex + segmentWords.length - 1
      
      if (currentWordIndex >= segmentStartIndex && currentWordIndex <= segmentEndIndex) {
        activeSegmentIndex = idx;
      }
      
      wordCount += segmentWords.length
    });
    
    // Reset for actual rendering
    wordCount = 0;
    
    return (
      <div>
        <div className="mb-3 text-xs text-gray-400 border-b border-gray-700 pb-2">
          Following along with page {currentPage}
        </div>
        {segments.map((segment, segmentIndex) => {
          const segmentWords = segment.text.split(/\s+/).filter(word => word.trim() !== "")
          const segmentStartIndex = wordCount
          const segmentEndIndex = segmentStartIndex + segmentWords.length - 1
          wordCount += segmentWords.length
          
          const isActiveSegment = segmentIndex === activeSegmentIndex;
          
          // Calculate segment progress for visual indicator
          let segmentProgress = 0;
          if (isActiveSegment && currentWordIndex >= segmentStartIndex) {
            segmentProgress = ((currentWordIndex - segmentStartIndex + 1) / segmentWords.length) * 100;
          } else if (currentWordIndex > segmentEndIndex) {
            segmentProgress = 100;
          }
          
          return (
            <div 
              key={segmentIndex} 
              ref={isActiveSegment ? activeSegmentRef : null}
              className={`mb-4 p-3 rounded-lg relative ${isActiveSegment ? 'bg-gray-700/50' : ''}`}
            >
              {/* Segment progress indicator */}
              {segmentProgress > 0 && (
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-cyan-900/20 rounded-l-lg transition-all duration-100 ease-linear"
                  style={{ width: `${segmentProgress}%` }}
                />
              )}
              
              <div className="mb-1 text-xs text-gray-400 relative z-10">
                {segment.speaker}
                {segment.startTime !== undefined && segment.endTime !== undefined && (
                  <span className="ml-2 text-gray-500">
                    ({segment.startTime.toFixed(1)}s - {segment.endTime.toFixed(1)}s)
                  </span>
                )}
              </div>
              
              <div className="relative z-10">
                {segmentWords.map((word, wordIndex) => {
                  const absoluteWordIndex = segmentStartIndex + wordIndex
                  const isHighlighted = absoluteWordIndex === currentWordIndex
                  
                  return (
                    <span
                      key={wordIndex}
                      ref={isHighlighted ? highlightedRef : null}
                      className={`${
                        isHighlighted
                          ? "bg-cyan-500/30 text-cyan-300 font-medium px-1 py-0.5 rounded transition-all duration-150 ease-in-out transform scale-105"
                          : absoluteWordIndex < currentWordIndex
                          ? "text-gray-300 transition-colors duration-150 ease-in-out"
                          : "text-gray-500 transition-colors duration-150 ease-in-out"
                      }`}
                    >
                      {word}{" "}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="p-4 h-64 overflow-y-auto text-sm space-y-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
    >
      {segments.length > 0 ? (
        getWordDisplay()
      ) : (
        <div className="text-gray-400">
          {words.map((word, index) => (
            <span
              key={index}
              ref={index === currentWordIndex ? highlightedRef : null}
              className={`${
                index === currentWordIndex
                  ? "bg-cyan-500/30 text-cyan-300 font-medium px-1 py-0.5 rounded transition-all duration-300 transform scale-110"
                  : index < currentWordIndex
                  ? "text-gray-300 transition-all duration-300"
                  : "text-gray-500 transition-all duration-300"
              }`}
            >
              {word}{" "}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

