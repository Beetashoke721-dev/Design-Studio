import { useEffect, useRef, useState } from 'react'
import * as fabric from 'fabric'
import './ImageEditorModal.css'

interface Props {
  imageUrl: string
  saving: boolean
  onCancel: () => void
  onSave: (dataUrl: string) => void
}

const MAX_CANVAS_SIZE = 520

export default function ImageEditorModal({ imageUrl, saving, onCancel, onSave }: Props) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null)
  const imageObjRef = useRef<fabric.FabricImage | null>(null)
  const cropRectRef = useRef<fabric.Rect | null>(null)

  const [ready, setReady] = useState(false)
  const [cropping, setCropping] = useState(false)
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [saturation, setSaturation] = useState(0)

  useEffect(() => {
    const canvasEl = canvasElRef.current
    if (!canvasEl) return
    let disposed = false

    const canvas = new fabric.Canvas(canvasEl, { backgroundColor: '#ffffff' })
    fabricCanvasRef.current = canvas

    fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' }).then((img) => {
      if (disposed) return
      const scale = Math.min(MAX_CANVAS_SIZE / img.width, MAX_CANVAS_SIZE / img.height, 1)
      canvas.setDimensions({ width: img.width * scale, height: img.height * scale })
      img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale, selectable: false, evented: false })
      canvas.add(img)
      canvas.renderAll()
      imageObjRef.current = img
      setReady(true)
    })

    return () => {
      disposed = true
      canvas.dispose()
      fabricCanvasRef.current = null
      imageObjRef.current = null
      cropRectRef.current = null
    }
  }, [imageUrl])

  const applyFilters = (b: number, c: number, s: number) => {
    const img = imageObjRef.current
    if (!img) return
    img.filters = [
      new fabric.filters.Brightness({ brightness: b }),
      new fabric.filters.Contrast({ contrast: c }),
      new fabric.filters.Saturation({ saturation: s }),
    ]
    img.applyFilters()
    fabricCanvasRef.current?.renderAll()
  }

  const rotate = () => {
    const canvas = fabricCanvasRef.current
    const img = imageObjRef.current
    if (!canvas || !img) return
    img.rotate(((img.angle ?? 0) + 90) % 360)
    canvas.centerObject(img)
    canvas.renderAll()
  }

  const addText = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    const text = new fabric.Textbox('Double-click to edit', {
      left: canvas.getWidth() / 2 - 80,
      top: canvas.getHeight() / 2 - 15,
      fontSize: 24,
      fill: '#ffffff',
      stroke: '#000000',
      strokeWidth: 0.5,
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    canvas.renderAll()
  }

  const toggleCrop = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    if (cropping) {
      if (cropRectRef.current) canvas.remove(cropRectRef.current)
      cropRectRef.current = null
      setCropping(false)
      return
    }
    const rect = new fabric.Rect({
      left: canvas.getWidth() * 0.1,
      top: canvas.getHeight() * 0.1,
      width: canvas.getWidth() * 0.8,
      height: canvas.getHeight() * 0.8,
      fill: 'rgba(170, 59, 255, 0.15)',
      stroke: '#aa3bff',
      strokeDashArray: [6, 4],
      cornerColor: '#aa3bff',
      transparentCorners: false,
    })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    canvas.renderAll()
    cropRectRef.current = rect
    setCropping(true)
  }

  const applyCrop = () => {
    const canvas = fabricCanvasRef.current
    const rect = cropRectRef.current
    const img = imageObjRef.current
    if (!canvas || !rect || !img) return

    const bounds = rect.getBoundingRect()
    canvas.remove(rect)
    cropRectRef.current = null
    setCropping(false)

    const dataUrl = canvas.toDataURL({
      format: 'png',
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      multiplier: 1,
    })

    fabric.FabricImage.fromURL(dataUrl).then((cropped) => {
      canvas.remove(img)
      canvas.setDimensions({ width: bounds.width, height: bounds.height })
      cropped.set({ left: 0, top: 0, selectable: false, evented: false })
      canvas.insertAt(0, cropped)
      imageObjRef.current = cropped
      canvas.renderAll()
    })
  }

  const handleSave = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    canvas.discardActiveObject()
    canvas.renderAll()
    onSave(canvas.toDataURL({ format: 'png', multiplier: 1 }))
  }

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true">
      <div className="editor-modal">
        <div className="editor-canvas-wrap">
          {!ready && <div className="editor-loading">Loading image…</div>}
          <canvas ref={canvasElRef} />
        </div>

        <div className="editor-toolbar">
          <div className="editor-tool-group">
            <button type="button" onClick={rotate} disabled={!ready}>
              Rotate 90°
            </button>
            <button type="button" onClick={addText} disabled={!ready}>
              Add text
            </button>
            <button
              type="button"
              className={cropping ? 'editor-tool-active' : ''}
              onClick={toggleCrop}
              disabled={!ready}
            >
              {cropping ? 'Cancel crop' : 'Crop'}
            </button>
            {cropping && (
              <button type="button" onClick={applyCrop}>
                Apply crop
              </button>
            )}
          </div>

          <label className="editor-slider">
            <span>Brightness</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={brightness}
              disabled={!ready}
              onChange={(e) => {
                const v = Number(e.target.value)
                setBrightness(v)
                applyFilters(v, contrast, saturation)
              }}
            />
          </label>
          <label className="editor-slider">
            <span>Contrast</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={contrast}
              disabled={!ready}
              onChange={(e) => {
                const v = Number(e.target.value)
                setContrast(v)
                applyFilters(brightness, v, saturation)
              }}
            />
          </label>
          <label className="editor-slider">
            <span>Saturation</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={saturation}
              disabled={!ready}
              onChange={(e) => {
                const v = Number(e.target.value)
                setSaturation(v)
                applyFilters(brightness, contrast, v)
              }}
            />
          </label>
        </div>

        <div className="editor-actions">
          <button type="button" className="editor-cancel" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="editor-save"
            onClick={handleSave}
            disabled={!ready || saving}
          >
            {saving ? 'Saving…' : 'Save edited image'}
          </button>
        </div>
      </div>
    </div>
  )
}
