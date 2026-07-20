import { useEffect, useRef, useState } from 'react'
import * as fabric from 'fabric'
import './DesignCanvasModal.css'

interface GalleryImage {
  name: string
  image: string
  prompt: string | null
}

interface Props {
  saving: boolean
  galleryImages: GalleryImage[]
  onCancel: () => void
  onSave: (dataUrl: string) => void
}

const SIZE_PRESETS = [
  { id: 'square', label: 'Square post', width: 800, height: 800 },
  { id: 'portrait', label: 'Portrait poster', width: 700, height: 900 },
  { id: 'landscape', label: 'Landscape', width: 900, height: 650 },
  { id: 'story', label: 'Story', width: 500, height: 900 },
]

const FONT_FAMILIES = [
  'Arial',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Impact',
  'Comic Sans MS',
]

const SHAPES = [
  { id: 'rect', label: 'Rectangle', glyph: '▭' },
  { id: 'circle', label: 'Circle', glyph: '●' },
  { id: 'triangle', label: 'Triangle', glyph: '▲' },
  { id: 'line', label: 'Line', glyph: '─' },
  { id: 'star', label: 'Star', glyph: '★' },
] as const

function isTextObject(obj: fabric.Object | null | undefined): obj is fabric.Textbox {
  return !!obj && obj.type === 'textbox'
}

function isImageObject(obj: fabric.Object | null | undefined): boolean {
  return !!obj && obj.type === 'image'
}

function isLineObject(obj: fabric.Object | null | undefined): obj is fabric.Line {
  return !!obj && obj.type === 'line'
}

/** Points for a 5-pointed star, centered on its own local origin. */
function starPoints(spikes: number, outerRadius: number, innerRadius: number) {
  const points: { x: number; y: number }[] = []
  const step = Math.PI / spikes
  let rot = -Math.PI / 2
  for (let i = 0; i < spikes; i++) {
    points.push({ x: Math.cos(rot) * outerRadius, y: Math.sin(rot) * outerRadius })
    rot += step
    points.push({ x: Math.cos(rot) * innerRadius, y: Math.sin(rot) * innerRadius })
    rot += step
  }
  return points
}

export default function DesignCanvasModal({ saving, galleryImages, onCancel, onSave }: Props) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [size, setSize] = useState<(typeof SIZE_PRESETS)[number] | null>(null)
  const [ready, setReady] = useState(false)
  const [activeObject, setActiveObject] = useState<fabric.Object | null>(null)
  const [showGallery, setShowGallery] = useState(false)
  const [showShapes, setShowShapes] = useState(false)
  const [backgroundColor, setBackgroundColor] = useState('#ffffff')
  // Bumped whenever the active object's own properties change, so controls re-render
  // without needing to track every individual fabric property in React state.
  const [, forceRefresh] = useState(0)

  useEffect(() => {
    if (!size) return
    const canvasEl = canvasElRef.current
    if (!canvasEl) return

    const canvas = new fabric.Canvas(canvasEl, {
      backgroundColor,
      width: size.width,
      height: size.height,
    })
    fabricCanvasRef.current = canvas

    const syncActive = () => {
      setActiveObject(canvas.getActiveObject() ?? null)
      forceRefresh((n) => n + 1)
    }
    canvas.on('selection:created', syncActive)
    canvas.on('selection:updated', syncActive)
    canvas.on('selection:cleared', syncActive)
    canvas.on('object:modified', syncActive)

    setReady(true)

    return () => {
      canvas.dispose()
      fabricCanvasRef.current = null
      setReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  const addText = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    const text = new fabric.Textbox('Double-click to edit', {
      left: canvas.getWidth() / 2 - 90,
      top: canvas.getHeight() / 2 - 15,
      width: 180,
      fontSize: 32,
      fontFamily: 'Arial',
      fill: '#111111',
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    canvas.renderAll()
    setActiveObject(text)
  }

  const addImageFromUrl = (url: string) => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' }).then((img) => {
      const maxDim = Math.min(canvas.getWidth(), canvas.getHeight()) * 0.7
      const scale = Math.min(maxDim / (img.width || 1), maxDim / (img.height || 1), 1)
      img.set({
        left: canvas.getWidth() / 2 - ((img.width || 0) * scale) / 2,
        top: canvas.getHeight() / 2 - ((img.height || 0) * scale) / 2,
        scaleX: scale,
        scaleY: scale,
      })
      canvas.add(img)
      canvas.setActiveObject(img)
      canvas.renderAll()
      setActiveObject(img)
    })
  }

  const addShape = (kind: (typeof SHAPES)[number]['id']) => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    const cx = canvas.getWidth() / 2
    const cy = canvas.getHeight() / 2
    const color = '#aa3bff'
    let obj: fabric.Object

    switch (kind) {
      case 'rect':
        obj = new fabric.Rect({ left: cx - 60, top: cy - 40, width: 120, height: 80, fill: color })
        break
      case 'circle':
        obj = new fabric.Circle({ left: cx - 50, top: cy - 50, radius: 50, fill: color })
        break
      case 'triangle':
        obj = new fabric.Triangle({ left: cx - 50, top: cy - 45, width: 100, height: 90, fill: color })
        break
      case 'line':
        obj = new fabric.Line([cx - 60, cy, cx + 60, cy], { stroke: color, strokeWidth: 5 })
        break
      case 'star':
        obj = new fabric.Polygon(starPoints(5, 60, 28), { left: cx - 60, top: cy - 60, fill: color })
        break
    }

    canvas.add(obj)
    canvas.setActiveObject(obj)
    canvas.renderAll()
    setActiveObject(obj)
  }

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => addImageFromUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  const deleteActive = () => {
    const canvas = fabricCanvasRef.current
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    canvas.remove(obj)
    canvas.discardActiveObject()
    canvas.renderAll()
    setActiveObject(null)
  }

  const bringForward = () => {
    const canvas = fabricCanvasRef.current
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    canvas.bringObjectForward(obj)
    canvas.renderAll()
  }

  const sendBackward = () => {
    const canvas = fabricCanvasRef.current
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    canvas.sendObjectBackwards(obj)
    canvas.renderAll()
  }

  const updateActiveText = (props: Partial<fabric.TextboxProps>) => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !isTextObject(activeObject)) return
    activeObject.set(props)
    canvas.renderAll()
    forceRefresh((n) => n + 1)
  }

  // Lines only have a stroke color; every other shape (and text) uses fill.
  const getActiveColor = (): string => {
    if (!activeObject) return '#aa3bff'
    if (isLineObject(activeObject)) return (activeObject.stroke as string) ?? '#aa3bff'
    return ((activeObject as fabric.Object & { fill?: string }).fill as string) ?? '#aa3bff'
  }

  const updateActiveColor = (color: string) => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !activeObject) return
    activeObject.set(isLineObject(activeObject) ? { stroke: color } : { fill: color })
    canvas.renderAll()
    forceRefresh((n) => n + 1)
  }

  const updateBackground = (color: string) => {
    setBackgroundColor(color)
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    canvas.set('backgroundColor', color)
    canvas.renderAll()
  }

  const handleSave = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    canvas.discardActiveObject()
    canvas.renderAll()
    onSave(canvas.toDataURL({ format: 'png', multiplier: 1 }))
  }

  if (!size) {
    return (
      <div className="editor-overlay" role="dialog" aria-modal="true">
        <div className="design-size-picker">
          <h2>Start a new design</h2>
          <p>Pick a canvas size to begin.</p>
          <div className="design-size-options">
            {SIZE_PRESETS.map((preset) => (
              <button key={preset.id} type="button" onClick={() => setSize(preset)}>
                <span
                  className="design-size-swatch"
                  style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
                />
                {preset.label}
                <small>
                  {preset.width}×{preset.height}
                </small>
              </button>
            ))}
          </div>
          <div className="editor-actions">
            <button type="button" className="editor-cancel" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true">
      <div className="editor-modal design-modal">
        <div className="design-workspace">
          <div className="editor-canvas-wrap">
            {!ready && <div className="editor-loading">Preparing canvas…</div>}
            <canvas ref={canvasElRef} />
          </div>

          <div className="design-side-panel">
            <div className="editor-tool-group design-tool-group">
              <button type="button" onClick={addText}>
                + Text
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                + Upload image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={onFileSelected}
              />
              <button
                type="button"
                className={showGallery ? 'editor-tool-active' : ''}
                onClick={() => setShowGallery((v) => !v)}
              >
                + From gallery
              </button>
              <button
                type="button"
                className={showShapes ? 'editor-tool-active' : ''}
                onClick={() => setShowShapes((v) => !v)}
              >
                + Shapes
              </button>
            </div>

            {showShapes && (
              <div className="design-shapes-strip">
                {SHAPES.map((shape) => (
                  <button
                    key={shape.id}
                    type="button"
                    className="design-shape-button"
                    title={shape.label}
                    onClick={() => addShape(shape.id)}
                  >
                    {shape.glyph}
                  </button>
                ))}
              </div>
            )}

            {showGallery && (
              <div className="design-gallery-strip">
                {galleryImages.length === 0 && <p>No previous images yet.</p>}
                {galleryImages.map((img) => (
                  <button
                    key={img.name}
                    type="button"
                    className="design-gallery-thumb"
                    title={img.prompt ?? ''}
                    onClick={() => addImageFromUrl(img.image)}
                  >
                    <img src={img.image} alt={img.prompt ?? ''} />
                  </button>
                ))}
              </div>
            )}

            <label className="design-field">
              <span>Canvas background</span>
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => updateBackground(e.target.value)}
              />
            </label>

            {activeObject && !isImageObject(activeObject) && (
              <div className="design-text-properties">
                <label className="design-field">
                  <span>Color</span>
                  <input
                    type="color"
                    value={getActiveColor()}
                    onChange={(e) => updateActiveColor(e.target.value)}
                  />
                </label>
              </div>
            )}

            {activeObject && isTextObject(activeObject) && (
              <div className="design-text-properties">
                <label className="design-field">
                  <span>Font</span>
                  <select
                    value={activeObject.fontFamily ?? 'Arial'}
                    onChange={(e) => updateActiveText({ fontFamily: e.target.value })}
                  >
                    {FONT_FAMILIES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="design-field">
                  <span>Size</span>
                  <input
                    type="number"
                    min={8}
                    max={200}
                    value={activeObject.fontSize ?? 32}
                    onChange={(e) => updateActiveText({ fontSize: Number(e.target.value) })}
                  />
                </label>
                <div className="design-text-toggles">
                  <button
                    type="button"
                    className={activeObject.fontWeight === 'bold' ? 'editor-tool-active' : ''}
                    onClick={() =>
                      updateActiveText({
                        fontWeight: activeObject.fontWeight === 'bold' ? 'normal' : 'bold',
                      })
                    }
                  >
                    B
                  </button>
                  <button
                    type="button"
                    className={activeObject.fontStyle === 'italic' ? 'editor-tool-active' : ''}
                    onClick={() =>
                      updateActiveText({
                        fontStyle: activeObject.fontStyle === 'italic' ? 'normal' : 'italic',
                      })
                    }
                  >
                    I
                  </button>
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      className={activeObject.textAlign === align ? 'editor-tool-active' : ''}
                      onClick={() => updateActiveText({ textAlign: align })}
                    >
                      {align === 'left' ? '⯇' : align === 'right' ? '⯈' : '≡'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeObject && (
              <div className="editor-tool-group design-tool-group">
                <button type="button" onClick={bringForward}>
                  Bring forward
                </button>
                <button type="button" onClick={sendBackward}>
                  Send backward
                </button>
                <button type="button" onClick={deleteActive}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="editor-actions">
          <button type="button" className="editor-cancel" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="editor-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save design'}
          </button>
        </div>
      </div>
    </div>
  )
}
