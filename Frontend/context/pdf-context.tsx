"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { extractTextFromPDF } from "@/lib/pdf-utils"

// Constants
const API_BASE_URL = "http://localhost:4567/api"

type Segment = {
  speaker: string
  text: string
  startTime?: number
  endTime?: number
  wordTimings?: { time: number }[]
}

type PDFContextType = {
  pdfFile: string | null
  pdfText: string
  currentPage: number
  totalPages: number
  isPlaying: boolean
  progress: number
  currentWordIndex: number
  words: string[]
  segments: Segment[]
  audioUrl: string | null
  isLoading: boolean
  error: string | null
  voices: { id: string; name: string; language: string }[]
  selectedVoice: string
  uploadPDF: (file: File) => Promise<void>
  setCurrentPage: (page: number) => void
  togglePlayPause: () => void
  setProgress: (progress: number) => void
  skipForward: () => void
  skipBackward: () => void
  setSelectedVoice: (voiceId: string) => void
  updateTotalPages: (numPages: number) => void
}

const PDFContext = createContext<PDFContextType | undefined>(undefined)

export function PDFProvider({ children }: { children: ReactNode }) {
  // PDF state
  const [pdfFile, setPdfFile] = useState<string | null>(null)
  const [pdfText, setPdfText] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [pageTexts, setPageTexts] = useState<Record<number, string>>({})
  
  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [words, setWords] = useState<string[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
  const [wordTimingMap, setWordTimingMap] = useState<Map<number, number>>(new Map())
  
  // API state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voices, setVoices] = useState<{ id: string; name: string; language: string }[]>([])
  const [selectedVoice, setSelectedVoice] = useState("af_heart")
  
  // When voice changes, reset audio to force regeneration
  useEffect(() => {
    if (pageTexts[currentPage]) {
      setAudioUrl(null)
      setSegments([])
      processCurrentPage()
    }
  }, [selectedVoice])

  // Fetch available voices on initial load
  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/voices`)
        if (!response.ok) {
          console.warn(`Failed to fetch voices: ${response.status} ${response.statusText}`)
          return
        }
        const data = await response.json()
        if (data.success && data.voices) {
          setVoices(data.voices)
        }
      } catch (error) {
        console.error("Error fetching voices:", error)
      }
    }
    
    fetchVoices()
  }, [])

  // Create or update audio element when URL changes
  useEffect(() => {
    if (audioUrl) {
      // Stop previous audio if it exists
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ""
      }
      
      // Remove duplicate "/api" in the path if present
      const fixedUrl = audioUrl.startsWith('/api/') 
        ? `${API_BASE_URL}${audioUrl.substring(4)}` 
        : `${API_BASE_URL}${audioUrl}`;
      
      console.log(`Creating audio element with URL: ${fixedUrl}`);
      const audio = new Audio();
      
      // Set up preload behavior to ensure audio buffers properly
      audio.preload = "auto";
      
      // Add error handling for audio loading
      audio.addEventListener("error", (e) => {
        console.error("Audio loading error:", e);
        setError(`Failed to load audio: ${audio.error?.message || 'Unknown error'}`);
      });
      
      audio.addEventListener("ended", () => {
        setIsPlaying(false)
        setProgress(100)
      })
      
      // Wait for the audio to be fully loaded before allowing playback
      let loadingTimeout: number;
      
      audio.addEventListener("loadedmetadata", () => {
        console.log("Audio metadata loaded, duration:", audio.duration);
      });
      
      // Make sure audio is fully loaded before assigning to state
      audio.addEventListener("canplaythrough", () => {
        console.log("Audio can play through, ready for playback");
        
        // Clear any existing timeout
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
        }
        
        // Before fully enabling, buffer a bit of audio
        setTimeout(() => {
          setAudioElement(audio);
        }, 200); // Add a small delay to ensure buffering
      });
      
      // If audio fails to load within 5 seconds, show an error
      loadingTimeout = window.setTimeout(() => {
        if (audio.readyState < 3) { // HAVE_FUTURE_DATA = 3
          console.error("Audio failed to load within timeout");
          setError("Audio failed to load - please try again");
        }
      }, 5000);
      
      // Set source after adding event listeners
      audio.src = fixedUrl;
      
      return () => {
        clearTimeout(loadingTimeout);
        audio.pause();
        audio.src = "";
      };
    }
  }, [audioUrl])

  // Process page text into words when the page text changes
  useEffect(() => {
    if (pdfText) {
      const wordArray = pdfText.split(/\s+/).filter((word) => word.trim() !== "")
      setWords(wordArray)
      
      // Reset the word timing map when text changes
      setWordTimingMap(new Map())
    }
  }, [pdfText])

  // Create word timing map when segments change
  useEffect(() => {
    if (segments.length > 0 && audioElement?.duration) {
      // Generate a timing map for word synchronization
      const newTimingMap = new Map<number, number>()
      let wordCount = 0
      const totalDuration = audioElement.duration
      
      // Check if segments have direct word timing info
      const hasWordTimings = segments.some(seg => 
        'wordTimings' in seg && 
        Array.isArray(seg.wordTimings) && 
        seg.wordTimings.length > 0
      )
      
      if (hasWordTimings) {
        // Use the precise word timing information
        segments.forEach((segment) => {
          if (segment.wordTimings && Array.isArray(segment.wordTimings)) {
            segment.wordTimings.forEach((wordTiming) => {
              newTimingMap.set(wordCount, wordTiming.time)
              wordCount++
            })
          } else {
            // Fallback for a segment without word timings
            const segmentWords = segment.text.split(/\s+/).filter(word => word.trim() !== "")
            const startTime = segment.startTime || 0
            const endTime = segment.endTime || totalDuration
            const segmentDuration = endTime - startTime
            
            segmentWords.forEach((_, wordIndex) => {
              const wordTime = startTime + (wordIndex / segmentWords.length) * segmentDuration
              newTimingMap.set(wordCount, wordTime)
              wordCount++
            })
          }
        })
      } else if (segments.some(seg => 'startTime' in seg && 'endTime' in seg)) {
        // Use segment timing info if available but no word timings
        segments.forEach((segment) => {
          const segmentWords = segment.text.split(/\s+/).filter(word => word.trim() !== "")
          const startTime = segment.startTime || 0
          const endTime = segment.endTime || 0
          const segmentDuration = endTime - startTime
          
          // Calculate time for each word
          segmentWords.forEach((_, wordIndex) => {
            const absoluteWordIndex = wordCount + wordIndex
            // Distribute words evenly across the segment
            const wordTime = startTime + (wordIndex / segmentWords.length) * segmentDuration
            newTimingMap.set(absoluteWordIndex, wordTime)
          })
          
          wordCount += segmentWords.length
        })
      } else {
        // Fallback to proportional mapping
        // Calculate segment durations based on word counts
        let totalWords = 0
        segments.forEach(segment => {
          const segmentWords = segment.text.split(/\s+/).filter(word => word.trim() !== "")
          totalWords += segmentWords.length
        })
        
        // Now assign time for each word's start time
        segments.forEach((segment, segmentIndex) => {
          const segmentWords = segment.text.split(/\s+/).filter(word => word.trim() !== "")
          const wordsInSegment = segmentWords.length
          
          // Calculate this segment's approximate duration based on word count proportion
          const segmentDuration = (wordsInSegment / totalWords) * totalDuration
          
          // Assign timing to each word
          segmentWords.forEach((_, wordIndex) => {
            const absoluteWordIndex = wordCount + wordIndex
            // Calculate word timing based on position within segment
            const wordTime = (absoluteWordIndex / totalWords) * totalDuration
            newTimingMap.set(absoluteWordIndex, wordTime)
          })
          
          wordCount += wordsInSegment
        })
      }
      
      // Apply a small offset to account for browser audio playback latency
      const updatedTimingMap = new Map<number, number>()
      const audioPlaybackLatency = 0.1 // Reduced from 0.2 to 0.1 seconds
      
      newTimingMap.forEach((time, index) => {
        updatedTimingMap.set(index, Math.max(0, time - audioPlaybackLatency))
      })
      
      setWordTimingMap(updatedTimingMap)
    }
  }, [segments, audioElement?.duration])

  // Enhanced audio timeupdate event handler for accuracy
  useEffect(() => {
    if (!audioElement) return
    
    const handleTimeUpdate = () => {
      if (!audioElement.duration) return
      
      const currentTime = audioElement.currentTime;
      const currentProgress = (currentTime / audioElement.duration) * 100;
      setProgress(currentProgress);
      
      // The highlighting is behind the audio, so we need to advance it
      // We'll advance the time by 2 seconds to compensate for the delay
      const advancedTime = currentTime + 1.5; // 1.5 second advance for highlighting
      
      if (wordTimingMap.size > 0) {
        // Find the word that should be highlighted at the advanced time
        let targetWordIndex = 0;
        
        // Find the word that corresponds to our advanced time
        for (let i = 0; i < words.length; i++) {
          const wordTime = wordTimingMap.get(i);
          if (wordTime !== undefined && wordTime <= advancedTime) {
            targetWordIndex = i;
          } else if (wordTime !== undefined && wordTime > advancedTime) {
            // We've found the first word that's ahead of our advanced time
            break;
          }
        }
        
        setCurrentWordIndex(targetWordIndex);
      } else {
        // Fallback to percentage-based method if no timing data available
        // Use advanced time to calculate word index
        const totalWords = words.length;
        const advancedProgress = (advancedTime / audioElement.duration) * 100;
        const wordIndex = Math.min(
          Math.floor((advancedProgress / 100) * totalWords),
          totalWords - 1
        );
        setCurrentWordIndex(wordIndex);
      }
    };
    
    // Use requestAnimationFrame for smoother updates
    let animationFrameId: number;
    let lastTime = 0;
    
    const updateHighlighting = (timestamp: number) => {
      // Only update every 50ms to avoid excessive re-renders
      if (timestamp - lastTime > 50) {
        handleTimeUpdate();
        lastTime = timestamp;
      }
      
      animationFrameId = requestAnimationFrame(updateHighlighting);
    };
    
    if (isPlaying) {
      animationFrameId = requestAnimationFrame(updateHighlighting);
    }
    
    audioElement.addEventListener("play", () => {
      animationFrameId = requestAnimationFrame(updateHighlighting);
    });
    
    audioElement.addEventListener("pause", () => {
      cancelAnimationFrame(animationFrameId);
    });
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [audioElement, words.length, isPlaying]);

  // Process new page when current page changes
  useEffect(() => {
    if (audioElement) {
      audioElement.pause()
      setIsPlaying(false)
    }
    
    setProgress(0)
    setCurrentWordIndex(0)
    setAudioUrl(null)
    setSegments([])
    setWordTimingMap(new Map())
    
    if (pageTexts[currentPage]) {
      setPdfText(pageTexts[currentPage])
      // We don't automatically process the page - wait for user to click Play
    }
  }, [currentPage, pageTexts])
  
  // Process the current page text through the API
  const processCurrentPage = async () => {
    if (!pageTexts[currentPage]) {
      console.error(`No text available for page ${currentPage}`);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log(`Processing page ${currentPage} with ${pageTexts[currentPage].length} characters`);
      const response = await fetch(`${API_BASE_URL}/process-page`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          page_text: pageTexts[currentPage],
          page_number: currentPage,
          voice: selectedVoice,
        }),
      });
      
      const data = await response.json();
      console.log(`API response for page ${currentPage}:`, data);
      
      if (data.success) {
        setAudioUrl(data.audio_url);
        
        // Check if API provided segments with timing info
        if (data.segments && Array.isArray(data.segments)) {
          // Add timing metadata if the API doesn't provide it
          if (data.timing === "immediate") {
            // Pre-calculate timing for immediate response
            setSegments(data.segments);
          } else {
            setSegments(data.segments);
          }
        } else {
          setSegments([]);
        }
      } else {
        setError(data.error || "Failed to process page");
        console.error("API Error:", data.error);
      }
    } catch (error) {
      setError("Network error - failed to connect to API");
      console.error("Error calling API:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const uploadPDF = async (file: File) => {
    try {
      const fileURL = URL.createObjectURL(file)
      setPdfFile(fileURL)

      const { text, pageCount, pageTexts: extractedPageTexts } = await extractTextFromPDF(file)
      setPdfText("")
      setTotalPages(pageCount)
      setPageTexts(extractedPageTexts)

      // Reset state
      setProgress(0)
      setCurrentWordIndex(0)
      setIsPlaying(false)
      setCurrentPage(1)
      setAudioUrl(null)
      setSegments([])
      setWordTimingMap(new Map())
      
      // Set the text of the first page
      if (extractedPageTexts[1]) {
        setPdfText(extractedPageTexts[1])
      }
    } catch (error) {
      console.error("Error uploading PDF:", error)
      setError("Failed to upload PDF")
    }
  }

  const togglePlayPause = async () => {
    // If no audio is available yet, process the current page
    if (!audioUrl && !isLoading) {
      processCurrentPage();
      return;
    }
    
    if (!audioElement) {
      setError("Audio is not ready yet. Please wait or try again.");
      return;
    }

    try {
      if (isPlaying) {
        audioElement.pause();
        setIsPlaying(false);
      } else {
        // Create a promise that resolves when playback starts or rejects on error
        const playPromise = audioElement.play();
        
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("Audio playback started successfully");
              setIsPlaying(true);
            })
            .catch(error => {
              console.error("Error playing audio:", error);
              
              // Handle different error types
              if (error.name === "NotSupportedError") {
                setError("Audio format not supported by your browser. Try using Chrome or Firefox.");
              } else if (error.name === "NotAllowedError") {
                setError("Audio playback was blocked by your browser. Please enable autoplay.");
              } else {
                setError(`Failed to play audio: ${error.message || 'Unknown error'}`);
              }
            });
        } else {
          // Older browsers might not return a promise
          setIsPlaying(true);
        }
      }
    } catch (error) {
      console.error("Unexpected error in togglePlayPause:", error);
      setError(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const skipForward = () => {
    if (!audioElement || !audioElement.duration) return

    const newTime = Math.min(audioElement.currentTime + 10, audioElement.duration)
    audioElement.currentTime = newTime
  }

  const skipBackward = () => {
    if (!audioElement) return

    const newTime = Math.max(audioElement.currentTime - 10, 0)
    audioElement.currentTime = newTime
  }

  const setProgressAndSeek = (newProgress: number) => {
    if (!audioElement || !audioElement.duration) return

    setProgress(newProgress)
    audioElement.currentTime = (newProgress / 100) * audioElement.duration
  }

  const updateTotalPages = (numPages: number) => {
    setTotalPages(numPages)
  }

  return (
    <PDFContext.Provider
      value={{
        pdfFile,
        pdfText,
        currentPage,
        totalPages,
        isPlaying,
        progress,
        currentWordIndex,
        words,
        segments,
        audioUrl,
        isLoading,
        error,
        voices,
        selectedVoice,
        uploadPDF,
        setCurrentPage,
        togglePlayPause,
        setProgress: setProgressAndSeek,
        skipForward,
        skipBackward,
        setSelectedVoice,
        updateTotalPages,
      }}
    >
      {children}
    </PDFContext.Provider>
  )
}

export function usePDF() {
  const context = useContext(PDFContext)
  if (context === undefined) {
    throw new Error("usePDF must be used within a PDFProvider")
  }
  return context
}

