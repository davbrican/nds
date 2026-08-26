import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useNdsRomEmulator } from './emulator/useNdsRomEmulator'
import './emulator.css'

type Control =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'a'
  | 'b'
  | 'x'
  | 'y'
  | 'l'
  | 'r'
  | 'start'
  | 'select'

type AppId = 'emulator' | 'touch' | 'playground' | 'system'

type Point = {
  x: number
  y: number
}

const apps: Array<{ id: AppId; title: string; subtitle: string; icon: string }> = [
  { id: 'emulator', title: 'NDS Player', subtitle: 'Carga una ROM .nds local', icon: '▣' },
  { id: 'touch', title: 'Touch Lab', subtitle: 'Prueba la pantalla táctil', icon: '✦' },
  { id: 'playground', title: 'Mini Game', subtitle: 'D-pad + botones', icon: '◆' },
  { id: 'system', title: 'System', subtitle: 'Estado de controles', icon: '⚙' },
]

const menuKeyboardMap: Record<string, Control | undefined> = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
  z: 'a',
  Z: 'a',
  x: 'b',
  X: 'b',
  Enter: 'start',
  Shift: 'select',
}

const emulatorKeyboardMap: Record<string, Control | undefined> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  z: 'a',
  Z: 'a',
  x: 'b',
  X: 'b',
  s: 'x',
  S: 'x',
  a: 'y',
  A: 'y',
  q: 'l',
  Q: 'l',
  w: 'r',
  W: 'r',
  Enter: 'start',
  Shift: 'select',
}

const emulatorControlKeys: Record<Control, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  a: 'z',
  b: 'x',
  x: 's',
  y: 'a',
  l: 'q',
  r: 'w',
  start: 'Enter',
  select: 'Shift',
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function AppNew() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeApp, setActiveApp] = useState<AppId | null>(null)
  const [pressed, setPressed] = useState<Set<Control>>(new Set())
  const [touchPoint, setTouchPoint] = useState<Point>({ x: 50, y: 50 })
  const [player, setPlayer] = useState<Point>({ x: 50, y: 62 })
  const [score, setScore] = useState(0)
  const [pulse, setPulse] = useState(false)
  const [romFile, setRomFile] = useState<File | null>(null)
  const [romValidationError, setRomValidationError] = useState<string | null>(null)

  const emulator = useNdsRomEmulator(activeApp === 'emulator' ? romFile : null)
  const selectedApp = apps[selectedIndex]

  const goHome = useCallback(() => {
    setActiveApp(null)
    setRomFile(null)
    setRomValidationError(null)
    setPressed(new Set())
  }, [])

  const movePlayer = useCallback((control: Control) => {
    if (!['up', 'down', 'left', 'right'].includes(control)) return

    setPlayer((current) => {
      const step = 5
      const next = { ...current }
      if (control === 'up') next.y -= step
      if (control === 'down') next.y += step
      if (control === 'left') next.x -= step
      if (control === 'right') next.x += step
      return {
        x: clamp(next.x, 8, 92),
        y: clamp(next.y, 18, 86),
      }
    })
  }, [])

  const handleAction = useCallback(
    (control: Control) => {
      if (activeApp === null) {
        if (control === 'left' || control === 'up') {
          setSelectedIndex((index) => (index - 1 + apps.length) % apps.length)
        }
        if (control === 'right' || control === 'down') {
          setSelectedIndex((index) => (index + 1) % apps.length)
        }
        if (control === 'a' || control === 'start') {
          setActiveApp(apps[selectedIndex].id)
        }
        return
      }

      if (activeApp === 'emulator') return

      if (control === 'b') {
        goHome()
        return
      }

      if (activeApp === 'playground') {
        movePlayer(control)
        if (control === 'a') {
          setScore((value) => value + 1)
          setPulse(true)
          window.setTimeout(() => setPulse(false), 180)
        }
      }
    },
    [activeApp, goHome, movePlayer, selectedIndex],
  )

  const setControlPressed = useCallback(
    (control: Control, isPressed: boolean) => {
      setPressed((current) => {
        const next = new Set(current)
        if (isPressed) next.add(control)
        else next.delete(control)
        return next
      })

      if (activeApp === 'emulator' && romFile) {
        emulator.sendKey(emulatorControlKeys[control], isPressed)
      }

      if (isPressed) handleAction(control)
    },
    [activeApp, emulator.sendKey, handleAction, romFile],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (activeApp === 'emulator' && event.key === 'Escape') {
        event.preventDefault()
        goHome()
        return
      }

      const control = (activeApp === 'emulator' ? emulatorKeyboardMap : menuKeyboardMap)[event.key]
      if (!control) return
      event.preventDefault()

      if (!event.repeat) {
        setControlPressed(control, true)
      } else if (activeApp === 'playground') {
        movePlayer(control)
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const control = (activeApp === 'emulator' ? emulatorKeyboardMap : menuKeyboardMap)[event.key]
      if (!control) return
      event.preventDefault()
      setControlPressed(control, false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [activeApp, goHome, movePlayer, setControlPressed])

  const updateTouchPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTouchPoint({
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    })
  }

  const sendEmulatorTouch = (
    event: ReactPointerEvent<HTMLDivElement>,
    phase: 'down' | 'move' | 'up',
  ) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    emulator.sendTouch(phase, x, y)
  }

  const onTouchSurfacePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    if (activeApp === 'emulator' && romFile) {
      sendEmulatorTouch(event, 'down')
      return
    }
    updateTouchPoint(event)
  }

  const onTouchSurfacePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    if (activeApp === 'emulator' && romFile) {
      sendEmulatorTouch(event, 'move')
      return
    }
    updateTouchPoint(event)
  }

  const onTouchSurfacePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeApp === 'emulator' && romFile) sendEmulatorTouch(event, 'up')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const controlSummary = useMemo(
    () => (pressed.size ? [...pressed].join(' + ').toUpperCase() : 'NINGUNO'),
    [pressed],
  )

  const chooseRom = (file: File | undefined) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.nds')) {
      setRomFile(null)
      setRomValidationError('Selecciona un archivo con extensión .nds.')
      return
    }
    if (file.size < 512) {
      setRomFile(null)
      setRomValidationError('El archivo es demasiado pequeño para ser una ROM NDS válida.')
      return
    }

    setRomValidationError(null)
    setRomFile(file)
  }

  return (
    <main className="page-shell">
      <section className="console" aria-label="Consola de doble pantalla">
        <div className="lid lid-top">
          <div className="speaker speaker-left" aria-hidden="true" />
          <ScreenFrame label="TOP">
            {activeApp === null && (
              <div className="home-top-screen">
                <div className="brand-mark">NDS</div>
                <p>WEB CONSOLE</p>
                <div className="status-row">
                  <span>READY</span>
                  <span>Wi-Fi ◉</span>
                  <span>WEB</span>
                </div>
                <div className="selected-preview">
                  <span className="preview-icon">{selectedApp.icon}</span>
                  <div>
                    <strong>{selectedApp.title}</strong>
                    <small>{selectedApp.subtitle}</small>
                  </div>
                </div>
              </div>
            )}

            {activeApp === 'emulator' && !romFile && (
              <div className="rom-intro-screen">
                <span className="eyebrow">NINTENDO DS ROM PLAYER</span>
                <strong>Carga un archivo .nds</strong>
                <p>La ROM se procesa localmente en tu navegador y no se sube al servidor.</p>
                <small>Core inicial: DeSmuME / WebAssembly</small>
              </div>
            )}

            {activeApp === 'emulator' && romFile && (
              <div className="rom-screen">
                <canvas ref={emulator.topCanvasRef} className="rom-canvas" aria-label="Pantalla superior NDS" />
                {emulator.status !== 'running' && (
                  <div className="rom-loading-overlay">
                    <strong>{emulator.status === 'error' ? 'ERROR' : 'CARGANDO ROM…'}</strong>
                    <small>{emulator.error ?? 'Descargando el core y preparando WebAssembly'}</small>
                  </div>
                )}
              </div>
            )}

            {activeApp === 'touch' && (
              <div className="touch-top-screen">
                <span className="eyebrow">TOUCH POSITION</span>
                <div className="floating-orb" style={{ left: `${touchPoint.x}%`, top: `${touchPoint.y}%` }} />
                <strong>X {touchPoint.x.toFixed(0)} · Y {touchPoint.y.toFixed(0)}</strong>
                <small>Mueve el dedo o el ratón por la pantalla inferior.</small>
              </div>
            )}

            {activeApp === 'playground' && (
              <div className="game-screen">
                <div className="game-hud">
                  <span>MINI GAME</span>
                  <span>A × {score}</span>
                </div>
                <div className="game-grid" />
                <div
                  className={`player ${pulse ? 'player-pulse' : ''}`}
                  style={{ left: `${player.x}%`, top: `${player.y}%` }}
                >
                  ▲
                </div>
                <div className="game-target" style={{ left: `${touchPoint.x}%`, top: `${touchPoint.y}%` }}>
                  ×
                </div>
              </div>
            )}

            {activeApp === 'system' && (
              <div className="system-screen">
                <span className="eyebrow">INPUT MONITOR</span>
                <strong>{controlSummary}</strong>
                <div className="system-grid">
                  <span>Touch X</span><b>{touchPoint.x.toFixed(1)}</b>
                  <span>Touch Y</span><b>{touchPoint.y.toFixed(1)}</b>
                  <span>Mode</span><b>{matchMedia('(pointer: coarse)').matches ? 'TOUCH' : 'POINTER'}</b>
                </div>
              </div>
            )}
          </ScreenFrame>
          <div className="speaker speaker-right" aria-hidden="true" />
        </div>

        <div className="hinge" aria-hidden="true">
          <span />
          <span className="power-led" />
          <span />
        </div>

        <div className="lid lid-bottom">
          <ScreenFrame label="TOUCH" touch>
            <div
              className={`touch-surface ${activeApp === 'emulator' ? 'touch-surface-emulator' : ''}`}
              onPointerDown={onTouchSurfacePointerDown}
              onPointerMove={onTouchSurfacePointerMove}
              onPointerUp={onTouchSurfacePointerUp}
              onPointerCancel={onTouchSurfacePointerUp}
            >
              {activeApp === null && (
                <div className="launcher-grid launcher-grid-four">
                  {apps.map((app, index) => (
                    <button
                      className={`launcher-card ${selectedIndex === index ? 'launcher-card-selected' : ''}`}
                      key={app.id}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => {
                        setSelectedIndex(index)
                        setActiveApp(app.id)
                      }}
                    >
                      <span>{app.icon}</span>
                      <strong>{app.title}</strong>
                    </button>
                  ))}
                </div>
              )}

              {activeApp === 'emulator' && !romFile && (
                <div className="rom-loader-panel">
                  <div className="rom-chip">NDS</div>
                  <strong>INSERT GAME CARD</strong>
                  <p>Selecciona una copia .nds que tengas derecho a utilizar.</p>
                  <label className="rom-file-button" onPointerDown={(event) => event.stopPropagation()}>
                    CARGAR .NDS
                    <input
                      type="file"
                      accept=".nds,application/octet-stream"
                      onChange={(event) => chooseRom(event.target.files?.[0])}
                    />
                  </label>
                  {romValidationError && <small className="rom-error">{romValidationError}</small>}
                </div>
              )}

              {activeApp === 'emulator' && romFile && (
                <div className="rom-screen rom-touch-screen">
                  <canvas ref={emulator.bottomCanvasRef} className="rom-canvas" aria-label="Pantalla táctil NDS" />
                  <div className="rom-meta-badge">
                    <strong>{emulator.metadata?.title || romFile.name}</strong>
                    {emulator.metadata?.gameCode && <small>{emulator.metadata.gameCode}</small>}
                  </div>
                </div>
              )}

              {activeApp === 'touch' && (
                <div className="touch-pad-demo">
                  <div className="touch-crosshair" style={{ left: `${touchPoint.x}%`, top: `${touchPoint.y}%` }}><i /></div>
                  <strong>TOCA Y ARRASTRA</strong>
                  <small>B para volver</small>
                </div>
              )}

              {activeApp === 'playground' && (
                <div className="game-touch-panel">
                  <strong>OBJETIVO</strong>
                  <p>Toca para mover la mira. Usa la cruceta para mover el jugador y A para sumar puntos.</p>
                  <div className="mini-radar"><i style={{ left: `${touchPoint.x}%`, top: `${touchPoint.y}%` }} /></div>
                  <small>B · HOME</small>
                </div>
              )}

              {activeApp === 'system' && (
                <div className="system-touch-panel">
                  <strong>CONTROLES</strong>
                  <p>Menú: flechas/WASD · Z = A · X = B.</p>
                  <p>ROM: flechas · Z/A · X/B · S/X · A/Y · Q/L · W/R.</p>
                  <small>B · HOME</small>
                </div>
              )}
            </div>
          </ScreenFrame>

          <div className="physical-controls">
            <ControlButton
              label="L"
              className="shoulder-button shoulder-left"
              active={pressed.has('l')}
              onChange={(value) => setControlPressed('l', value)}
            />
            <ControlButton
              label="R"
              className="shoulder-button shoulder-right"
              active={pressed.has('r')}
              onChange={(value) => setControlPressed('r', value)}
            />

            <DPad pressed={pressed} setPressed={setControlPressed} />

            <div className="center-controls">
              <ControlButton
                label="SELECT"
                className="pill-button"
                active={pressed.has('select')}
                onChange={(value) => setControlPressed('select', value)}
              />
              {activeApp === 'emulator' && (
                <button type="button" className="pill-button home-pill" onClick={goHome}>HOME</button>
              )}
              <ControlButton
                label="START"
                className="pill-button"
                active={pressed.has('start')}
                onChange={(value) => setControlPressed('start', value)}
              />
            </div>

            <div className="ab-controls">
              <ControlButton
                label="X"
                className="face-button face-x"
                active={pressed.has('x')}
                onChange={(value) => setControlPressed('x', value)}
              />
              <ControlButton
                label="Y"
                className="face-button face-y"
                active={pressed.has('y')}
                onChange={(value) => setControlPressed('y', value)}
              />
              <ControlButton
                label="A"
                className="face-button face-a"
                active={pressed.has('a')}
                onChange={(value) => setControlPressed('a', value)}
              />
              <ControlButton
                label="B"
                className="face-button face-b"
                active={pressed.has('b')}
                onChange={(value) => setControlPressed('b', value)}
              />
            </div>
          </div>
        </div>
      </section>

      <p className="desktop-hint">
        {activeApp === 'emulator'
          ? 'ROM · Flechas · Z=A · X=B · S=X · A=Y · Q=L · W=R · Enter=Start · Shift=Select · Esc=Home'
          : 'PC · Flechas/WASD · Z=A · X=B · Enter=Start · Shift=Select'}
      </p>

      {activeApp === 'emulator' && romFile && (
        <iframe
          ref={emulator.iframeRef}
          className="emulator-engine-frame"
          srcDoc={emulator.srcDoc}
          title="Motor interno del emulador Nintendo DS"
          tabIndex={-1}
        />
      )}
    </main>
  )
}

function ScreenFrame({ children, label, touch = false }: { children: React.ReactNode; label: string; touch?: boolean }) {
  return (
    <div className={`screen-bezel ${touch ? 'screen-bezel-touch' : ''}`}>
      <div className="screen-label">{label}</div>
      <div className="screen">{children}</div>
    </div>
  )
}

function DPad({ pressed, setPressed }: { pressed: Set<Control>; setPressed: (control: Control, value: boolean) => void }) {
  return (
    <div className="dpad" aria-label="Cruceta">
      <ControlButton label="▲" className="dpad-button dpad-up" active={pressed.has('up')} onChange={(v) => setPressed('up', v)} />
      <ControlButton label="◀" className="dpad-button dpad-left" active={pressed.has('left')} onChange={(v) => setPressed('left', v)} />
      <div className="dpad-center" />
      <ControlButton label="▶" className="dpad-button dpad-right" active={pressed.has('right')} onChange={(v) => setPressed('right', v)} />
      <ControlButton label="▼" className="dpad-button dpad-down" active={pressed.has('down')} onChange={(v) => setPressed('down', v)} />
    </div>
  )
}

function ControlButton({
  label,
  className,
  active,
  onChange,
}: {
  label: string
  className: string
  active: boolean
  onChange: (pressed: boolean) => void
}) {
  return (
    <button
      type="button"
      className={`${className} ${active ? 'is-pressed' : ''}`}
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        onChange(true)
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        onChange(false)
      }}
      onPointerCancel={() => onChange(false)}
    >
      {label}
    </button>
  )
}

export default AppNew
