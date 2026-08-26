import { useCallback, useEffect, useMemo, useState } from 'react'

type Control = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select'
type AppId = 'touch' | 'playground' | 'system'

type Point = {
  x: number
  y: number
}

const apps: Array<{ id: AppId; title: string; subtitle: string; icon: string }> = [
  { id: 'touch', title: 'Touch Lab', subtitle: 'Prueba la pantalla táctil', icon: '✦' },
  { id: 'playground', title: 'Mini Game', subtitle: 'D-pad + botones', icon: '◆' },
  { id: 'system', title: 'System', subtitle: 'Estado de controles', icon: '⚙' },
]

const keyboardMap: Record<string, Control | undefined> = {
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function App() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeApp, setActiveApp] = useState<AppId | null>(null)
  const [pressed, setPressed] = useState<Set<Control>>(new Set())
  const [touchPoint, setTouchPoint] = useState<Point>({ x: 50, y: 50 })
  const [player, setPlayer] = useState<Point>({ x: 50, y: 62 })
  const [score, setScore] = useState(0)
  const [pulse, setPulse] = useState(false)

  const selectedApp = apps[selectedIndex]

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

      if (control === 'b') {
        setActiveApp(null)
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
    [activeApp, movePlayer, selectedIndex],
  )

  const setControlPressed = useCallback(
    (control: Control, isPressed: boolean) => {
      setPressed((current) => {
        const next = new Set(current)
        if (isPressed) next.add(control)
        else next.delete(control)
        return next
      })

      if (isPressed) handleAction(control)
    },
    [handleAction],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const control = keyboardMap[event.key]
      if (!control) return
      event.preventDefault()
      if (!event.repeat) setControlPressed(control, true)
      else if (activeApp === 'playground') movePlayer(control)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const control = keyboardMap[event.key]
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
  }, [activeApp, movePlayer, setControlPressed])

  const updateTouchPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTouchPoint({
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    })
  }

  const controlSummary = useMemo(
    () => (pressed.size ? [...pressed].join(' + ').toUpperCase() : 'NINGUNO'),
    [pressed],
  )

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
                  <span>17:21</span>
                  <span>Wi-Fi ◉</span>
                  <span>100%</span>
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

            {activeApp === 'touch' && (
              <div className="touch-top-screen">
                <span className="eyebrow">TOUCH POSITION</span>
                <div
                  className="floating-orb"
                  style={{ left: `${touchPoint.x}%`, top: `${touchPoint.y}%` }}
                />
                <strong>
                  X {touchPoint.x.toFixed(0)} · Y {touchPoint.y.toFixed(0)}
                </strong>
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
              className="touch-surface"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                updateTouchPoint(event)
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) updateTouchPoint(event)
              }}
            >
              {activeApp === null && (
                <div className="launcher-grid">
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

              {activeApp === 'touch' && (
                <div className="touch-pad-demo">
                  <div className="touch-crosshair" style={{ left: `${touchPoint.x}%`, top: `${touchPoint.y}%` }}>
                    <i />
                  </div>
                  <strong>TOCA Y ARRASTRA</strong>
                  <small>B para volver</small>
                </div>
              )}

              {activeApp === 'playground' && (
                <div className="game-touch-panel">
                  <strong>OBJETIVO</strong>
                  <p>Toca para mover la mira. Usa la cruceta para mover el jugador y A para sumar puntos.</p>
                  <div className="mini-radar">
                    <i style={{ left: `${touchPoint.x}%`, top: `${touchPoint.y}%` }} />
                  </div>
                  <small>B · HOME</small>
                </div>
              )}

              {activeApp === 'system' && (
                <div className="system-touch-panel">
                  <strong>CONTROLES</strong>
                  <p>PC: flechas/WASD · Z = A · X = B · Enter = Start · Shift = Select</p>
                  <p>Móvil: usa los controles físicos simulados de abajo.</p>
                  <small>B · HOME</small>
                </div>
              )}
            </div>
          </ScreenFrame>

          <div className="physical-controls">
            <DPad pressed={pressed} setPressed={setControlPressed} />

            <div className="center-controls">
              <ControlButton
                label="SELECT"
                className="pill-button"
                active={pressed.has('select')}
                onChange={(value) => setControlPressed('select', value)}
              />
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
                active={false}
                onChange={() => undefined}
                disabled
              />
              <ControlButton
                label="Y"
                className="face-button face-y"
                active={false}
                onChange={() => undefined}
                disabled
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

      <p className="desktop-hint">PC · Flechas/WASD · Z=A · X=B · Enter=Start · Shift=Select</p>
    </main>
  )
}

function ScreenFrame({
  children,
  label,
  touch = false,
}: {
  children: React.ReactNode
  label: string
  touch?: boolean
}) {
  return (
    <div className={`screen-bezel ${touch ? 'screen-bezel-touch' : ''}`}>
      <div className="screen-label">{label}</div>
      <div className="screen">{children}</div>
    </div>
  )
}

function DPad({
  pressed,
  setPressed,
}: {
  pressed: Set<Control>
  setPressed: (control: Control, value: boolean) => void
}) {
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
  disabled = false,
}: {
  label: string
  className: string
  active: boolean
  onChange: (pressed: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`${className} ${active ? 'is-pressed' : ''}`}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => {
        if (disabled) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        onChange(true)
      }}
      onPointerUp={(event) => {
        if (disabled) return
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        onChange(false)
      }}
      onPointerCancel={() => !disabled && onChange(false)}
    >
      {label}
    </button>
  )
}

export default App
