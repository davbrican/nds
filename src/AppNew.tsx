import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  readNdsMetadata,
  useNdsRomEmulator,
  type NdsRomMetadata,
} from './emulator/useNdsRomEmulator'
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

type AppId = 'emulator' | 'pictochat' | 'download' | 'settings'

type Point = {
  x: number
  y: number
}

type UserColor = 'blue' | 'green' | 'pink' | 'orange'

const menuItems: Array<{ id: AppId; title: string }> = [
  { id: 'emulator', title: 'Nintendo DS Game' },
  { id: 'pictochat', title: 'PictoChat' },
  { id: 'download', title: 'DS Download Play' },
  { id: 'settings', title: 'Settings' },
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function AppNew() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeApp, setActiveApp] = useState<AppId | null>(null)
  const [pressed, setPressed] = useState<Set<Control>>(new Set())
  const [romFile, setRomFile] = useState<File | null>(null)
  const [romMetadata, setRomMetadata] = useState<NdsRomMetadata | null>(null)
  const [romValidationError, setRomValidationError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [brightness, setBrightness] = useState(3)
  const [alarmOn, setAlarmOn] = useState(false)
  const [userColor, setUserColor] = useState<UserColor>('blue')
  const [chatPoints, setChatPoints] = useState<Point[]>([])

  const emulator = useNdsRomEmulator(activeApp === 'emulator' ? romFile : null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const goHome = useCallback(() => {
    setActiveApp(null)
    setRomValidationError(null)
    setPressed(new Set())
  }, [])

  const openSelected = useCallback(() => {
    setActiveApp(menuItems[selectedIndex].id)
  }, [selectedIndex])

  const handleMenuAction = useCallback(
    (control: Control) => {
      if (activeApp === null) {
        if (control === 'left' || control === 'up') {
          setSelectedIndex((index) => (index - 1 + menuItems.length) % menuItems.length)
        }
        if (control === 'right' || control === 'down') {
          setSelectedIndex((index) => (index + 1) % menuItems.length)
        }
        if (control === 'a' || control === 'start') openSelected()
        return
      }

      if (activeApp !== 'emulator' && control === 'b') goHome()
    },
    [activeApp, goHome, openSelected],
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

      if (isPressed) handleMenuAction(control)
    },
    [activeApp, emulator.sendKey, handleMenuAction, romFile],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (activeApp === 'emulator' && event.key === 'Escape') {
        event.preventDefault()
        goHome()
        return
      }

      const map = activeApp === 'emulator' ? emulatorKeyboardMap : menuKeyboardMap
      const control = map[event.key]
      if (!control) return

      event.preventDefault()
      if (!event.repeat) setControlPressed(control, true)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const map = activeApp === 'emulator' ? emulatorKeyboardMap : menuKeyboardMap
      const control = map[event.key]
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
  }, [activeApp, goHome, setControlPressed])

  const sendEmulatorTouch = (
    event: ReactPointerEvent<HTMLDivElement>,
    phase: 'down' | 'move' | 'up',
  ) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    emulator.sendTouch(phase, x, y)
  }

  const addPictoPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setChatPoints((points) => [
      ...points.slice(-650),
      {
        x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
        y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
      },
    ])
  }

  const onTouchSurfacePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeApp === 'emulator' && romFile) {
      event.currentTarget.setPointerCapture(event.pointerId)
      sendEmulatorTouch(event, 'down')
      return
    }

    if (activeApp === 'pictochat') {
      event.currentTarget.setPointerCapture(event.pointerId)
      addPictoPoint(event)
    }
  }

  const onTouchSurfacePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return

    if (activeApp === 'emulator' && romFile) {
      sendEmulatorTouch(event, 'move')
      return
    }

    if (activeApp === 'pictochat') addPictoPoint(event)
  }

  const onTouchSurfacePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeApp === 'emulator' && romFile) sendEmulatorTouch(event, 'up')

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const chooseRom = async (file: File | undefined) => {
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.nds')) {
      setRomValidationError('Selecciona un archivo con extensión .nds.')
      return
    }

    if (file.size < 512) {
      setRomValidationError('El archivo es demasiado pequeño para ser una ROM NDS válida.')
      return
    }

    setRomValidationError(null)
    setRomFile(file)

    try {
      setRomMetadata(await readNdsMetadata(file))
    } catch {
      setRomMetadata({
        title: file.name.replace(/\.nds$/i, ''),
        gameCode: '',
        makerCode: '',
        version: 0,
        size: file.size,
      })
    }
  }

  const ejectRom = () => {
    setRomFile(null)
    setRomMetadata(null)
    setRomValidationError(null)
    goHome()
  }

  const cycleBrightness = () => setBrightness((value) => (value + 1) % 4)

  const themeClass = `theme-${userColor}`

  return (
    <main className={`page-shell ${themeClass}`}>
      <section className="console ds-lite" aria-label="Nintendo DS web console">
        <div className="lid lid-top">
          <div className="speaker speaker-left" aria-hidden="true" />
          <ScreenFrame brightness={brightness}>
            {activeApp === null && <DsHomeTop now={now} alarmOn={alarmOn} />}

            {activeApp === 'emulator' && !romFile && (
              <div className="ds-system-page game-card-info">
                <div className="system-page-title">Nintendo DS Game Card</div>
                <div className="game-card-illustration">
                  <span>NINTENDO</span>
                  <strong>DS</strong>
                </div>
                <p>Insert a Game Card to begin.</p>
              </div>
            )}

            {activeApp === 'emulator' && romFile && (
              <div className="rom-screen">
                <canvas
                  ref={emulator.topCanvasRef}
                  className="rom-canvas"
                  aria-label="Pantalla superior Nintendo DS"
                />
                {emulator.status !== 'running' && (
                  <div className={`rom-loading-overlay ${emulator.status === 'error' ? 'is-error' : ''}`}>
                    <div className="ds-loading-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </div>
                    <strong>{emulator.status === 'error' ? 'Unable to start Game Card' : 'Loading Game Card…'}</strong>
                    <small>{emulator.error ?? emulator.stage}</small>
                  </div>
                )}
              </div>
            )}

            {activeApp === 'pictochat' && (
              <div className="ds-system-page picto-top">
                <div className="system-page-title">PictoChat</div>
                <div className="picto-logo">P</div>
                <strong>Room A</strong>
                <p>0 participants nearby</p>
                <small>Messages are not sent over the internet.</small>
              </div>
            )}

            {activeApp === 'download' && (
              <div className="ds-system-page download-top">
                <div className="system-page-title">DS Download Play</div>
                <div className="wireless-rings" aria-hidden="true"><i /><i /><i /></div>
                <strong>Searching for software…</strong>
                <p>Keep this system within range of the host Nintendo DS.</p>
              </div>
            )}

            {activeApp === 'settings' && (
              <div className="ds-system-page settings-top">
                <div className="system-page-title">System Settings</div>
                <div className="settings-symbol">◆</div>
                <p>Choose a panel on the Touch Screen.</p>
                <small>Web console settings</small>
              </div>
            )}
          </ScreenFrame>
          <div className="speaker speaker-right" aria-hidden="true" />
        </div>

        <div className="hinge" aria-hidden="true">
          <span className="hinge-left" />
          <span className="hinge-logo">NDS</span>
          <span className="power-led" />
          <span className="hinge-right" />
        </div>

        <div className="lid lid-bottom">
          <ScreenFrame brightness={brightness} touch>
            <div
              className={`touch-surface ${
                activeApp === 'emulator' && romFile ? 'touch-surface-emulator' : ''
              }`}
              onPointerDown={onTouchSurfacePointerDown}
              onPointerMove={onTouchSurfacePointerMove}
              onPointerUp={onTouchSurfacePointerUp}
              onPointerCancel={onTouchSurfacePointerUp}
            >
              {activeApp === null && (
                <DsHomeBottom
                  selectedIndex={selectedIndex}
                  romMetadata={romMetadata}
                  hasRom={Boolean(romFile)}
                  brightness={brightness}
                  alarmOn={alarmOn}
                  onSelect={(index, app) => {
                    setSelectedIndex(index)
                    setActiveApp(app)
                  }}
                  onBrightness={cycleBrightness}
                  onAlarm={() => setAlarmOn((value) => !value)}
                />
              )}

              {activeApp === 'emulator' && !romFile && (
                <div className="ds-rom-loader">
                  <div className="insert-card-row">
                    <span className="mini-card-icon">DS</span>
                    <div>
                      <strong>No Game Card inserted</strong>
                      <small>Choose a local .nds file</small>
                    </div>
                  </div>

                  <label
                    className="ds-action-button"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    Load Game Card
                    <input
                      type="file"
                      accept=".nds,application/octet-stream"
                      onChange={(event) => chooseRom(event.target.files?.[0])}
                    />
                  </label>

                  {romValidationError && <p className="rom-error">{romValidationError}</p>}
                  <button type="button" className="ds-text-button" onClick={goHome}>Back</button>
                </div>
              )}

              {activeApp === 'emulator' && romFile && (
                <div className="rom-screen rom-touch-screen">
                  <canvas
                    ref={emulator.bottomCanvasRef}
                    className="rom-canvas"
                    aria-label="Pantalla táctil Nintendo DS"
                  />
                  {emulator.status === 'error' && (
                    <button type="button" className="rom-eject-float" onClick={ejectRom}>
                      Eject
                    </button>
                  )}
                </div>
              )}

              {activeApp === 'pictochat' && (
                <div className="picto-touch">
                  <div className="picto-toolbar">
                    <strong>PictoChat</strong>
                    <button type="button" onClick={() => setChatPoints([])}>Clear</button>
                  </div>
                  <div className="picto-paper">
                    {chatPoints.map((point, index) => (
                      <i key={`${index}-${point.x}-${point.y}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} />
                    ))}
                    {!chatPoints.length && <span>Write or draw with the stylus</span>}
                  </div>
                  <button type="button" className="picto-send" disabled>Send</button>
                </div>
              )}

              {activeApp === 'download' && (
                <div className="download-touch">
                  <div className="download-header">Game Selection</div>
                  <div className="download-empty">
                    <span className="wireless-small">)))</span>
                    <strong>No software titles found.</strong>
                    <small>Search is simulated in this web version.</small>
                  </div>
                  <button type="button" className="ds-text-button" onClick={goHome}>Back</button>
                </div>
              )}

              {activeApp === 'settings' && (
                <div className="settings-touch">
                  <button type="button" className="settings-tile" onClick={cycleBrightness}>
                    <span>☀</span>
                    <strong>Brightness</strong>
                    <small>{brightness + 1} / 4</small>
                  </button>
                  <button type="button" className="settings-tile" onClick={() => setAlarmOn((value) => !value)}>
                    <span>◷</span>
                    <strong>Alarm</strong>
                    <small>{alarmOn ? 'On' : 'Off'}</small>
                  </button>
                  <div className="settings-tile settings-colors">
                    <span>●</span>
                    <strong>User Color</strong>
                    <div className="color-dots">
                      {(['blue', 'green', 'pink', 'orange'] as UserColor[]).map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`color-dot color-${color} ${userColor === color ? 'selected' : ''}`}
                          aria-label={`Color ${color}`}
                          onClick={() => setUserColor(color)}
                        />
                      ))}
                    </div>
                  </div>
                  <button type="button" className="settings-tile" onClick={goHome}>
                    <span>↩</span>
                    <strong>Back</strong>
                    <small>DS Menu</small>
                  </button>
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
                <button type="button" className="pill-button menu-pill" onClick={goHome}>
                  MENU
                </button>
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

            <span className="mic-label">MIC.</span>
          </div>
        </div>
      </section>

      <p className="desktop-hint">
        {activeApp === 'emulator'
          ? 'ROM · Flechas · Z=A · X=B · S=X · A=Y · Q=L · W=R · Enter=Start · Shift=Select · Esc=Menu'
          : 'Menú · Flechas/WASD · Z=A · X=B · Enter=Start'}
      </p>

      {activeApp === 'emulator' && romFile && (
        <iframe
          ref={emulator.iframeRef}
          key={`${romFile.name}-${romFile.size}-${romFile.lastModified}`}
          className="emulator-engine-frame"
          srcDoc={emulator.srcDoc}
          title="Motor interno del emulador Nintendo DS"
          tabIndex={-1}
        />
      )}
    </main>
  )
}

function DsHomeTop({ now, alarmOn }: { now: Date; alarmOn: boolean }) {
  return (
    <div className="ds-home-top">
      <div className="ds-top-status">
        <span className="user-name">Player</span>
        <span className="top-icons">
          <i className="startup-mode">M</i>
          <i className="battery-icon"><b /></i>
        </span>
      </div>

      <div className="ds-home-main">
        <AnalogClock now={now} alarmOn={alarmOn} />
        <Calendar now={now} />
      </div>

      <div className="ds-home-footer">
        <span>{formatDate(now)}</span>
        <strong>{formatTime(now)}</strong>
      </div>
    </div>
  )
}

function AnalogClock({ now, alarmOn }: { now: Date; alarmOn: boolean }) {
  const seconds = now.getSeconds()
  const minutes = now.getMinutes() + seconds / 60
  const hours = (now.getHours() % 12) + minutes / 60

  return (
    <div className="clock-block">
      <div className="analog-clock" aria-label={formatTime(now)}>
        {Array.from({ length: 12 }, (_, index) => (
          <i
            key={index}
            className="clock-tick"
            style={{ transform: `translateX(-50%) rotate(${index * 30}deg)` }}
          />
        ))}
        <span className="clock-hand hour-hand" style={{ transform: `rotate(${hours * 30}deg)` }} />
        <span className="clock-hand minute-hand" style={{ transform: `rotate(${minutes * 6}deg)` }} />
        <span className="clock-hand second-hand" style={{ transform: `rotate(${seconds * 6}deg)` }} />
        <b className="clock-pin" />
      </div>
      {alarmOn && <span className="alarm-indicator">● ALARM</span>}
    </div>
  )
}

function Calendar({ now }: { now: Date }) {
  const year = now.getFullYear()
  const month = now.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = index - startOffset + 1
    return day >= 1 && day <= daysInMonth ? day : null
  })

  const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(now)

  return (
    <div className="calendar-block">
      <div className="calendar-heading">
        <strong>{monthName}</strong>
        <span>{year}</span>
      </div>
      <div className="calendar-grid weekdays">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-grid calendar-days">
        {days.map((day, index) => (
          <span
            key={`${day ?? 'empty'}-${index}`}
            className={day === now.getDate() ? 'today' : ''}
          >
            {day ?? ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function DsHomeBottom({
  selectedIndex,
  romMetadata,
  hasRom,
  brightness,
  alarmOn,
  onSelect,
  onBrightness,
  onAlarm,
}: {
  selectedIndex: number
  romMetadata: NdsRomMetadata | null
  hasRom: boolean
  brightness: number
  alarmOn: boolean
  onSelect: (index: number, app: AppId) => void
  onBrightness: () => void
  onAlarm: () => void
}) {
  return (
    <div className="ds-menu-home">
      <div className="utility-strip">
        <button type="button" className="utility-button" onClick={onBrightness}>
          <span className="sun-icon">☀</span>
          <small>{brightness + 1}</small>
        </button>
        <div className="utility-center">
          <span className="wireless-icon">)))</span>
          <small>DS Menu</small>
        </div>
        <button type="button" className={`utility-button ${alarmOn ? 'active' : ''}`} onClick={onAlarm}>
          <span>◷</span>
          <small>{alarmOn ? 'ON' : 'OFF'}</small>
        </button>
      </div>

      <button
        type="button"
        className={`ds-menu-panel game-panel ${selectedIndex === 0 ? 'selected' : ''}`}
        onClick={() => onSelect(0, 'emulator')}
      >
        <span className="panel-icon game-card-icon">DS</span>
        <span className="panel-copy">
          <strong>{hasRom ? (romMetadata?.title || 'Nintendo DS Game') : 'Nintendo DS Game'}</strong>
          <small>{hasRom ? 'Game Card inserted' : 'There is no DS Game Card inserted.'}</small>
        </span>
        <span className="panel-arrow">›</span>
      </button>

      <div className="menu-pair">
        <button
          type="button"
          className={`ds-menu-panel small-panel ${selectedIndex === 1 ? 'selected' : ''}`}
          onClick={() => onSelect(1, 'pictochat')}
        >
          <span className="panel-icon picto-icon">P</span>
          <span className="panel-copy">
            <strong>PictoChat</strong>
            <small>Chat locally</small>
          </span>
        </button>

        <button
          type="button"
          className={`ds-menu-panel small-panel ${selectedIndex === 2 ? 'selected' : ''}`}
          onClick={() => onSelect(2, 'download')}
        >
          <span className="panel-icon download-icon">)))</span>
          <span className="panel-copy">
            <strong>DS Download Play</strong>
            <small>Receive software</small>
          </span>
        </button>
      </div>

      <div className="menu-bottom-row">
        <div className="gba-panel" aria-disabled="true">
          <span className="gba-mark">GBA</span>
          <span>
            <strong>Game Boy Advance</strong>
            <small>There is no Game Pak inserted.</small>
          </span>
        </div>
        <button
          type="button"
          className={`settings-panel ${selectedIndex === 3 ? 'selected' : ''}`}
          onClick={() => onSelect(3, 'settings')}
          aria-label="Settings"
        >
          <span>◆</span>
          <small>Settings</small>
        </button>
      </div>
    </div>
  )
}

function ScreenFrame({
  children,
  touch = false,
  brightness,
}: {
  children: React.ReactNode
  touch?: boolean
  brightness: number
}) {
  return (
    <div className={`screen-bezel ${touch ? 'screen-bezel-touch' : ''}`}>
      <div className={`screen screen-brightness-${brightness}`}>{children}</div>
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

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(date)
}

export default AppNew
