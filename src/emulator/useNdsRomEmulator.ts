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

export async function readNdsMetadata(file: File): Promise<NdsRomMetadata> {
  const header = new Uint8Array(await file.slice(0, 0x20).arrayBuffer())

  return {
    title: cleanAscii(header.slice(0x00, 0x0c)) || file.name.replace(/\.nds$/i, ''),
    gameCode: cleanAscii(header.slice(0x0c, 0x10)),
    makerCode: cleanAscii(header.slice(0x10, 0x12)),
    version: header[0x1e] ?? 0,
    size: file.size,
  }
}

function findGameCanvas(document: Document) {
  const canvases = Array.from(document.querySelectorAll('canvas'))
    .filter((canvas) => canvas.width > 1 && canvas.height > 1)

  if (!canvases.length) return null

  const dsLike = canvases
    .filter((canvas) => {
      const ratio = canvas.width / canvas.height
      return ratio > 0.55 && ratio < 0.8
    })
    .sort((a, b) => b.width * b.height - a.width * a.height)

  return dsLike[0] ?? canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null
}

function hasMeaningfulFrame(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || canvas.width < 8 || canvas.height < 8) return false

  const width = canvas.width
  const height = canvas.height
  const points = [
    [0.1, 0.1],
    [0.5, 0.1],
    [0.9, 0.1],
    [0.25, 0.5],
    [0.5, 0.5],
    [0.75, 0.5],
    [0.1, 0.9],
    [0.5, 0.9],
    [0.9, 0.9],
  ]

  const samples = points.map(([x, y]) => {
    const px = Math.min(width - 1, Math.max(0, Math.floor(width * x)))
    const py = Math.min(height - 1, Math.max(0, Math.floor(height * y)))
    return Array.from(context.getImageData(px, py, 1, 1).data)
  })

  const first = samples[0]
  return samples.some((sample) =>
    sample.some((channel, index) => Math.abs(channel - first[index]) > 10),
  )
}

export function useNdsRomEmulator(file: File | null) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const topCanvasRef = useRef<HTMLCanvasElement>(null)
  const bottomCanvasRef = useRef<HTMLCanvasElement>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [status, setStatus] = useState<EmulatorStatus>('idle')
  const [stage, setStage] = useState('Selecciona una ROM .nds')
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<NdsRomMetadata | null>(null)

  const romToken = useMemo(
    () => file ? `${encodeURIComponent(file.name)}:${file.size}:${file.lastModified}` : 'empty',
    [file],
  )

  const srcDoc = useMemo(() => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    html, body { margin: 0; width: 256px; height: 384px; overflow: hidden; background: #000; }
    #game { width: 256px; height: 384px; overflow: hidden; background: #000; }
    canvas { image-rendering: pixelated; }
  </style>
</head>
<body data-rom-token="${romToken}">
  <div id="game"></div>
</body>
</html>`, [romToken])

  useEffect(() => {
    sourceCanvasRef.current = null
    setError(null)

    if (!file) {
      setMetadata(null)
      setStatus('idle')
      setStage('Selecciona una ROM .nds')
      return
    }

    setStatus('loading')
    setStage('Leyendo cabecera de la Game Card…')

    readNdsMetadata(file)
      .then(setMetadata)
      .catch(() => setMetadata(null))
  }, [file])

  useEffect(() => {
    if (!file) return

    let disposed = false
    let bootAttempts = 0
    let canvasAttempts = 0
    let firstCanvasAt = 0
    let loaderInjected = false
    let childErrorHandler: ((event: ErrorEvent) => void) | null = null
    let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null

    const bootInterval = window.setInterval(() => {
      if (disposed || loaderInjected) return
      bootAttempts += 1

      const frame = iframeRef.current
      const frameWindow = frame?.contentWindow
      const frameDocument = frame?.contentDocument

      if (!frameWindow || !frameDocument?.body) {
        if (bootAttempts > 100) {
          setStatus('error')
          setError('No se pudo inicializar el contenedor del emulador.')
          setStage('Error al crear el motor')
          window.clearInterval(bootInterval)
        }
        return
      }

      if (frameDocument.body.dataset.romToken !== romToken) return

      loaderInjected = true
      window.clearInterval(bootInterval)
      setStage('Cargando EmulatorJS y el core Nintendo DS…')

      childErrorHandler = (event: ErrorEvent) => {
        if (disposed) return
        setStatus('error')
        setError(event.message || 'Error JavaScript dentro del emulador.')
        setStage('El motor ha devuelto un error')
      }

      rejectionHandler = (event: PromiseRejectionEvent) => {
        if (disposed) return
        const reason = event.reason
        const message = reason instanceof Error ? reason.message : String(reason ?? 'Error desconocido')
        setStatus('error')
        setError(message)
        setStage('El motor no ha podido arrancar')
      }

      frameWindow.addEventListener('error', childErrorHandler)
      frameWindow.addEventListener('unhandledrejection', rejectionHandler)

      const ejsWindow = frameWindow as Window & {
        EJS_player?: string
        EJS_gameName?: string
        EJS_biosUrl?: string
        EJS_gameUrl?: File | string
        EJS_core?: string
        EJS_pathtodata?: string
        EJS_startOnLoaded?: boolean
        EJS_threads?: boolean
        EJS_volume?: number
        EJS_language?: string
        EJS_ready?: () => void
      }

      ejsWindow.EJS_player = '#game'
      ejsWindow.EJS_gameName = file.name.replace(/\.nds$/i, '')
      ejsWindow.EJS_biosUrl = ''
      ejsWindow.EJS_gameUrl = file
      ejsWindow.EJS_core = 'nds'
      ejsWindow.EJS_pathtodata = EJS_DATA_PATH
      ejsWindow.EJS_startOnLoaded = true
      ejsWindow.EJS_threads = false
      ejsWindow.EJS_volume = 0.75
      ejsWindow.EJS_language = 'es-ES'
      ejsWindow.EJS_ready = () => {
        if (!disposed) setStage('Core listo. Iniciando la Game Card…')
      }

      const loader = frameDocument.createElement('script')
      loader.src = `${EJS_DATA_PATH}loader.js`
      loader.async = true
      loader.onerror = () => {
        if (disposed) return
        setStatus('error')
        setError('No se pudo descargar loader.js desde el CDN de EmulatorJS.')
        setStage('Error descargando EmulatorJS')
      }
      frameDocument.body.appendChild(loader)
    }, 50)

    const canvasInterval = window.setInterval(() => {
      if (disposed || !loaderInjected) return
      canvasAttempts += 1

      try {
        const frameDocument = iframeRef.current?.contentDocument
        if (!frameDocument) return

        const source = findGameCanvas(frameDocument)
        if (!source) {
          if (canvasAttempts > 400) {
            setStatus('error')
            setError('El core Nintendo DS no llegó a crear su framebuffer.')
            setStage('No se ha recibido imagen del emulador')
            window.clearInterval(canvasInterval)
          }
          return
        }

        sourceCanvasRef.current = source
        if (!firstCanvasAt) {
          firstCanvasAt = performance.now()
          setStage('Framebuffer detectado. Esperando vídeo…')
        }

        const draw = () => {
          if (disposed) return

          const currentSource = sourceCanvasRef.current
          const topCanvas = topCanvasRef.current
          const bottomCanvas = bottomCanvasRef.current

          if (currentSource && topCanvas && bottomCanvas && currentSource.width && currentSource.height) {
            const splitY = Math.floor(currentSource.height / 2)
            const bottomHeight = currentSource.height - splitY

            if (topCanvas.width !== 256) topCanvas.width = 256
            if (topCanvas.height !== 192) topCanvas.height = 192
            if (bottomCanvas.width !== 256) bottomCanvas.width = 256
            if (bottomCanvas.height !== 192) bottomCanvas.height = 192

            const topContext = topCanvas.getContext('2d', { willReadFrequently: true })
            const bottomContext = bottomCanvas.getContext('2d', { willReadFrequently: true })

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

              const age = performance.now() - firstCanvasAt
              if (status !== 'running' && (hasMeaningfulFrame(topCanvas) || hasMeaningfulFrame(bottomCanvas) || age > 8000)) {
                setStatus('running')
                setStage('Ejecutando')
              }
            }
          }

          animationFrameRef.current = window.requestAnimationFrame(draw)
        }

        window.clearInterval(canvasInterval)
        draw()
      } catch (reason) {
        window.clearInterval(canvasInterval)
        setStatus('error')
        setError(reason instanceof Error ? reason.message : 'No se pudo acceder al framebuffer del emulador.')
        setStage('Error leyendo el framebuffer')
      }
    }, 100)

    return () => {
      disposed = true
      window.clearInterval(bootInterval)
      window.clearInterval(canvasInterval)

      const frameWindow = iframeRef.current?.contentWindow
      if (frameWindow && childErrorHandler) frameWindow.removeEventListener('error', childErrorHandler)
      if (frameWindow && rejectionHandler) frameWindow.removeEventListener('unhandledrejection', rejectionHandler)

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }

      sourceCanvasRef.current = null
    }
  }, [file, romToken])

  const sendKey = useCallback((key: string, pressed: boolean) => {
    const frameWindow = iframeRef.current?.contentWindow
    if (!frameWindow) return

    const event = new KeyboardEvent(pressed ? 'keydown' : 'keyup', {
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      bubbles: true,
      cancelable: true,
    })

    frameWindow.dispatchEvent(event)
    frameWindow.document.dispatchEvent(event)
  }, [])

  const sendTouch = useCallback((phase: TouchPhase, x: number, y: number) => {
    const source = sourceCanvasRef.current
    if (!source) return

    const rect = source.getBoundingClientRect()
    const normalizedX = Math.max(0, Math.min(1, x))
    const normalizedY = Math.max(0, Math.min(1, y))
    const clientX = rect.left + normalizedX * rect.width
    const clientY = rect.top + (0.5 + normalizedY * 0.5) * rect.height
    const eventType = phase === 'down' ? 'mousedown' : phase === 'up' ? 'mouseup' : 'mousemove'

    source.dispatchEvent(
      new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        button: 0,
        buttons: phase === 'up' ? 0 : 1,
      }),
    )
  }, [])

  return {
    iframeRef,
    topCanvasRef,
    bottomCanvasRef,
    srcDoc,
    status,
    stage,
    error,
    metadata,
    sendKey,
    sendTouch,
  }
}
