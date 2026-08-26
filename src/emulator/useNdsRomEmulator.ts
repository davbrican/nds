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

type DesmondPlayerElement = HTMLElement & {
  loadURL?: (url: string, callback?: () => void) => void
}

type DesmondWindow = Window & {
  __desmondAlert?: string
  __desmondErrors?: string[]
  __desmondFrameCount?: number
}

const DESMOND_SCRIPT = 'https://cdn.jsdelivr.net/gh/js-emulators/desmond@main/cdn/desmond.min.js'

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

const keyCodes: Record<string, number> = {
  ArrowRight: 39,
  ArrowLeft: 37,
  ArrowDown: 40,
  ArrowUp: 38,
  Shift: 16,
  Enter: 13,
  z: 90,
  x: 88,
  a: 65,
  s: 83,
  q: 81,
  w: 87,
  Backspace: 8,
}

export function useNdsRomEmulator(file: File | null) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const topCanvasRef = useRef<HTMLCanvasElement>(null)
  const bottomCanvasRef = useRef<HTMLCanvasElement>(null)
  const sourceTopRef = useRef<HTMLCanvasElement | null>(null)
  const sourceBottomRef = useRef<HTMLCanvasElement | null>(null)
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
    desmond-player { display: block; width: 256px; height: 384px; }
    #ios-hint, #msg-layer, #rom { display: none !important; }
  </style>
</head>
<body data-rom-token="${romToken}">
  <div id="ios-hint" hidden></div>
  <div id="msg-layer" hidden><span id="msg-text"></span></div>
  <input id="rom" type="file" hidden />
  <desmond-player id="player"></desmond-player>
  <script>
    window.__desmondAlert = '';
    window.__desmondErrors = [];
    window.__desmondFrameCount = 0;
    window.alert = function(message) {
      window.__desmondAlert = String(message || 'Error del emulador');
      console.error('[Desmond]', message);
    };
    window.addEventListener('error', function(event) {
      window.__desmondErrors.push(event.message || 'Error JavaScript dentro de Desmond');
    });
    window.addEventListener('unhandledrejection', function(event) {
      var reason = event.reason;
      window.__desmondErrors.push(reason && reason.message ? reason.message : String(reason || 'Promise rechazada dentro de Desmond'));
    });
    (function() {
      var original = CanvasRenderingContext2D.prototype.putImageData;
      CanvasRenderingContext2D.prototype.putImageData = function() {
        if (this.canvas && (this.canvas.id === 'top' || this.canvas.id === 'bottom')) {
          window.__desmondFrameCount += 1;
        }
        return original.apply(this, arguments);
      };
    })();
  </script>
  <script src="${DESMOND_SCRIPT}" onerror="window.__desmondErrors.push('No se pudo descargar Desmond/DeSmuME-WASM')"></script>
</body>
</html>`, [romToken])

  useEffect(() => {
    sourceTopRef.current = null
    sourceBottomRef.current = null
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
    let gameUrl: string | null = null
    let loadStarted = false
    let drawStarted = false
    let attempts = 0
    const startedAt = performance.now()

    const fail = (message: string, stageMessage = 'No se pudo iniciar la ROM') => {
      if (disposed) return
      setStatus('error')
      setError(message)
      setStage(stageMessage)
    }

    const draw = () => {
      if (disposed) return

      const sourceTop = sourceTopRef.current
      const sourceBottom = sourceBottomRef.current
      const targetTop = topCanvasRef.current
      const targetBottom = bottomCanvasRef.current

      if (sourceTop && sourceBottom && targetTop && targetBottom) {
        if (targetTop.width !== 256) targetTop.width = 256
        if (targetTop.height !== 192) targetTop.height = 192
        if (targetBottom.width !== 256) targetBottom.width = 256
        if (targetBottom.height !== 192) targetBottom.height = 192

        const topContext = targetTop.getContext('2d')
        const bottomContext = targetBottom.getContext('2d')

        if (topContext && bottomContext) {
          topContext.imageSmoothingEnabled = false
          bottomContext.imageSmoothingEnabled = false
          topContext.drawImage(sourceTop, 0, 0, 256, 192)
          bottomContext.drawImage(sourceBottom, 0, 0, 256, 192)
        }
      }

      animationFrameRef.current = window.requestAnimationFrame(draw)
    }

    const poll = window.setInterval(() => {
      if (disposed) return
      attempts += 1

      const frame = iframeRef.current
      const frameWindow = frame?.contentWindow as DesmondWindow | null
      const frameDocument = frame?.contentDocument

      if (!frameWindow || !frameDocument?.body) {
        if (attempts > 200) fail('No se pudo crear el documento interno del emulador.')
        return
      }

      if (frameDocument.body.dataset.romToken !== romToken) return

      const errors = frameWindow.__desmondErrors ?? []
      const alertMessage = frameWindow.__desmondAlert
      if (alertMessage) {
        fail(alertMessage, 'DeSmuME rechazó la Game Card')
        window.clearInterval(poll)
        return
      }
      if (errors.length) {
        fail(errors[errors.length - 1], 'Error dentro de DeSmuME-WASM')
        window.clearInterval(poll)
        return
      }

      const player = frameDocument.querySelector('desmond-player') as DesmondPlayerElement | null
      const shadow = player?.shadowRoot
      const sourceTop = shadow?.querySelector('#top') as HTMLCanvasElement | null
      const sourceBottom = shadow?.querySelector('#bottom') as HTMLCanvasElement | null

      if (sourceTop && sourceBottom) {
        sourceTopRef.current = sourceTop
        sourceBottomRef.current = sourceBottom

        if (!drawStarted) {
          drawStarted = true
          setStage('DeSmuME-WASM listo. Preparando la Game Card…')
          draw()
        }
      }

      if (!loadStarted && player && typeof player.loadURL === 'function') {
        loadStarted = true
        gameUrl = URL.createObjectURL(file)
        setStage('Copiando la ROM a la memoria del emulador…')

        try {
          player.loadURL(gameUrl, () => {
            if (!disposed) setStage('ROM transferida. Esperando al primer frame…')
          })
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : String(reason)
          fail(message, 'No se pudo cargar la Game Card')
          window.clearInterval(poll)
          return
        }
      }

      const frameCount = frameWindow.__desmondFrameCount ?? 0
      if (frameCount >= 4) {
        setStatus('running')
        setStage('Ejecutando')
        window.clearInterval(poll)
        return
      }

      if (performance.now() - startedAt > 45000) {
        fail(
          loadStarted
            ? 'DeSmuME recibió la ROM pero no produjo ningún frame en 45 segundos.'
            : 'Desmond no terminó de inicializarse. Comprueba que el navegador puede acceder a jsDelivr y js-emulators.github.io.',
          'Tiempo de espera agotado',
        )
        window.clearInterval(poll)
      }
    }, 100)

    return () => {
      disposed = true
      window.clearInterval(poll)
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      sourceTopRef.current = null
      sourceBottomRef.current = null
      if (gameUrl) URL.revokeObjectURL(gameUrl)
    }
  }, [file, romToken])

  const sendKey = useCallback((key: string, pressed: boolean) => {
    const frameWindow = iframeRef.current?.contentWindow
    if (!frameWindow) return

    const normalizedKey = key.length === 1 ? key.toLowerCase() : key
    const keyCode = keyCodes[normalizedKey] ?? keyCodes[key] ?? 0
    const event = new KeyboardEvent(pressed ? 'keydown' : 'keyup', {
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      bubbles: true,
      cancelable: true,
    })

    if (keyCode) {
      Object.defineProperty(event, 'keyCode', { configurable: true, get: () => keyCode })
      Object.defineProperty(event, 'which', { configurable: true, get: () => keyCode })
    }

    frameWindow.dispatchEvent(event)
  }, [])

  const sendTouch = useCallback((phase: TouchPhase, x: number, y: number) => {
    const frameWindow = iframeRef.current?.contentWindow
    const sourceBottom = sourceBottomRef.current
    if (!frameWindow || !sourceBottom) return

    const rect = sourceBottom.getBoundingClientRect()
    const normalizedX = Math.max(0, Math.min(1, x))
    const normalizedY = Math.max(0, Math.min(1, y))
    const clientX = rect.left + normalizedX * rect.width
    const clientY = rect.top + normalizedY * rect.height
    const eventType = phase === 'down' ? 'mousedown' : phase === 'up' ? 'mouseup' : 'mousemove'

    frameWindow.dispatchEvent(
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
