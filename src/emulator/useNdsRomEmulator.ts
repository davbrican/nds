import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type EmulatorStatus = 'idle' | 'loading' | 'running' | 'error'
type TouchPhase = 'down' | 'move' | 'up'

export type NdsRomMetadata = {
  title: string
  gameCode: string
  makerCode: string
  version: number
  size: number
}

const EJS_DATA_PATH = 'https://cdn.emulatorjs.org/stable/data/'

function cleanAscii(bytes: Uint8Array) {
  return new TextDecoder('ascii')
    .decode(bytes)
    .replace(/\0/g, '')
    .trim()
}

async function readNdsMetadata(file: File): Promise<NdsRomMetadata> {
  const header = new Uint8Array(await file.slice(0, 0x20).arrayBuffer())

  return {
    title: cleanAscii(header.slice(0x00, 0x0c)) || file.name.replace(/\.nds$/i, ''),
    gameCode: cleanAscii(header.slice(0x0c, 0x10)),
    makerCode: cleanAscii(header.slice(0x10, 0x12)),
    version: header[0x1e] ?? 0,
    size: file.size,
  }
}

function findLargestCanvas(document: Document) {
  const canvases = Array.from(document.querySelectorAll('canvas'))
  return canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null
}

export function useNdsRomEmulator(file: File | null) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const topCanvasRef = useRef<HTMLCanvasElement>(null)
  const bottomCanvasRef = useRef<HTMLCanvasElement>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [romUrl, setRomUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<EmulatorStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<NdsRomMetadata | null>(null)

  useEffect(() => {
    sourceCanvasRef.current = null
    setError(null)
    setMetadata(null)

    if (!file) {
      setRomUrl(null)
      setStatus('idle')
      return
    }

    setStatus('loading')
    const url = URL.createObjectURL(file)
    setRomUrl(url)

    readNdsMetadata(file)
      .then(setMetadata)
      .catch(() => setMetadata(null))

    return () => URL.revokeObjectURL(url)
  }, [file])

  const srcDoc = useMemo(() => {
    if (!romUrl || !file) return ''

    const gameUrl = JSON.stringify(romUrl)
    const gameName = JSON.stringify(file.name.replace(/\.nds$/i, ''))

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    html, body, #game { margin: 0; width: 256px; height: 384px; overflow: hidden; background: #000; }
    body { position: relative; }
  </style>
</head>
<body>
  <div id="game"></div>
  <script>
    window.EJS_player = '#game';
    window.EJS_core = 'desmume';
    window.EJS_gameUrl = ${gameUrl};
    window.EJS_gameName = ${gameName};
    window.EJS_pathtodata = '${EJS_DATA_PATH}';
    window.EJS_startOnLoaded = true;
    window.EJS_threads = false;
    window.EJS_volume = 0.7;
    window.EJS_language = 'es-ES';
  <\/script>
  <script src="${EJS_DATA_PATH}loader.js"><\/script>
</body>
</html>`
  }, [file, romUrl])

  useEffect(() => {
    if (!romUrl) return

    let disposed = false
    let attempts = 0

    const locateCanvas = window.setInterval(() => {
      if (disposed) return
      attempts += 1

      try {
        const iframeDocument = iframeRef.current?.contentDocument
        if (!iframeDocument) return

        const source = findLargestCanvas(iframeDocument)
        if (!source || source.width < 2 || source.height < 2) {
          if (attempts > 200) {
            setStatus('error')
            setError('El emulador no ha creado el framebuffer. Revisa la consola del navegador.')
            window.clearInterval(locateCanvas)
          }
          return
        }

        sourceCanvasRef.current = source
        window.clearInterval(locateCanvas)

        const draw = () => {
          if (disposed) return

          const currentSource = sourceCanvasRef.current
          const topCanvas = topCanvasRef.current
          const bottomCanvas = bottomCanvasRef.current

          if (currentSource && topCanvas && bottomCanvas && currentSource.width && currentSource.height) {
            const splitY = Math.floor(currentSource.height / 2)
            const bottomHeight = currentSource.height - splitY

            topCanvas.width = 256
            topCanvas.height = 192
            bottomCanvas.width = 256
            bottomCanvas.height = 192

            const topContext = topCanvas.getContext('2d')
            const bottomContext = bottomCanvas.getContext('2d')

            if (topContext && bottomContext) {
              topContext.imageSmoothingEnabled = false
              bottomContext.imageSmoothingEnabled = false
              topContext.drawImage(
                currentSource,
                0,
                0,
                currentSource.width,
                splitY,
                0,
                0,
                256,
                192,
              )
              bottomContext.drawImage(
                currentSource,
                0,
                splitY,
                currentSource.width,
                bottomHeight,
                0,
                0,
                256,
                192,
              )
              setStatus((current) => (current === 'running' ? current : 'running'))
            }
          }

          animationFrameRef.current = window.requestAnimationFrame(draw)
        }

        draw()
      } catch (reason) {
        window.clearInterval(locateCanvas)
        setStatus('error')
        setError(reason instanceof Error ? reason.message : 'No se pudo acceder al framebuffer del emulador.')
      }
    }, 100)

    return () => {
      disposed = true
      window.clearInterval(locateCanvas)
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      sourceCanvasRef.current = null
    }
  }, [romUrl])

  const sendKey = useCallback((key: string, pressed: boolean) => {
    const frameWindow = iframeRef.current?.contentWindow
    if (!frameWindow) return

    const init: KeyboardEventInit = {
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      bubbles: true,
      cancelable: true,
    }

    frameWindow.dispatchEvent(new KeyboardEvent(pressed ? 'keydown' : 'keyup', init))
    frameWindow.document.dispatchEvent(new KeyboardEvent(pressed ? 'keydown' : 'keyup', init))
  }, [])

  const sendTouch = useCallback((phase: TouchPhase, x: number, y: number) => {
    const source = sourceCanvasRef.current
    const frameWindow = iframeRef.current?.contentWindow
    if (!source || !frameWindow) return

    const rect = source.getBoundingClientRect()
    const clientX = rect.left + Math.max(0, Math.min(1, x)) * rect.width
    const clientY = rect.top + (0.5 + Math.max(0, Math.min(1, y)) * 0.5) * rect.height
    const eventType = phase === 'down' ? 'mousedown' : phase === 'up' ? 'mouseup' : 'mousemove'
    const buttons = phase === 'up' ? 0 : 1

    source.dispatchEvent(
      new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        button: 0,
        buttons,
      }),
    )
  }, [])

  return {
    iframeRef,
    topCanvasRef,
    bottomCanvasRef,
    srcDoc,
    status,
    error,
    metadata,
    sendKey,
    sendTouch,
  }
}
