import * as pdfjs from "pdfjs-dist"

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

export async function extractTextFromPDF(file: File): Promise<{ 
  text: string; 
  pageCount: number;
  pageTexts: Record<number, string>;
}> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
    const pageCount = pdf.numPages

    let fullText = ""
    const pageTexts: Record<number, string> = {}

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map((item: any) => item.str).join(" ")

      fullText += pageText + " "
      pageTexts[i] = pageText.trim()
    }

    return { text: fullText.trim(), pageCount, pageTexts }
  } catch (error) {
    console.error("Error extracting text from PDF:", error)
    return { text: "", pageCount: 0, pageTexts: {} }
  }
}

export function getWordPositions(
  text: string,
  highlightedWordIndex: number,
): {
  before: string[]
  current: string
  after: string[]
} {
  const words = text.split(/\s+/).filter((word) => word.trim() !== "")

  const current = words[highlightedWordIndex] || ""
  const before = words.slice(Math.max(0, highlightedWordIndex - 20), highlightedWordIndex)
  const after = words.slice(highlightedWordIndex + 1, highlightedWordIndex + 21)

  return { before, current, after }
}

