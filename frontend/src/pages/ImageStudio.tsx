import { useState } from 'react'
import type { FormEvent } from 'react'
import { useFrappeGetCall, useFrappePostCall, type FrappeError } from 'frappe-react-sdk'
import AppNav from '../components/AppNav'
import ImageEditorModal from '../components/ImageEditorModal'
import { getErrorMessage } from '../lib/errors'
import './image-studio.css'

interface ImageRow {
  name: string
  image: string
  prompt: string | null
  source_type: 'Generated' | 'AI Edit' | 'Manual Edit'
  parent_image: string | null
  model: string | null
  creation: string
}

interface ExportResponse {
  name: string
  pdf_file: string
}

export default function ImageStudio() {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editPromptFor, setEditPromptFor] = useState<string | null>(null)
  const [editPromptText, setEditPromptText] = useState('')
  const [editingImage, setEditingImage] = useState<string | null>(null)
  const [manualEditTarget, setManualEditTarget] = useState<ImageRow | null>(null)
  const [savingManualEdit, setSavingManualEdit] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data, mutate } = useFrappeGetCall<{ message: ImageRow[] }>(
    'design_studio.api.image_studio.list_images',
  )
  const { call: generateImage } = useFrappePostCall<{ message: ImageRow }>(
    'design_studio.api.image_studio.generate_image',
  )
  const { call: editImage } = useFrappePostCall<{ message: ImageRow }>(
    'design_studio.api.image_studio.edit_image',
  )
  const { call: saveManualEdit } = useFrappePostCall<{ message: ImageRow }>(
    'design_studio.api.image_studio.save_manual_edit',
  )
  const { call: exportPdf } = useFrappePostCall<{ message: ExportResponse }>(
    'design_studio.api.image_studio.export_pdf',
  )

  const images = data?.message ?? []

  const submitGenerate = async (e: FormEvent) => {
    e.preventDefault()
    const text = prompt.trim()
    if (!text || generating) return
    setGenerating(true)
    setError(null)
    try {
      await generateImage({ prompt: text })
      setPrompt('')
      mutate()
    } catch (err) {
      setError(getErrorMessage(err as FrappeError) ?? 'Could not generate the image. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const submitEdit = async (image: string) => {
    const text = editPromptText.trim()
    if (!text) return
    setEditingImage(image)
    setError(null)
    try {
      await editImage({ image, prompt: text })
      setEditPromptFor(null)
      setEditPromptText('')
      mutate()
    } catch (err) {
      setError(getErrorMessage(err as FrappeError) ?? 'Could not edit the image. Please try again.')
    } finally {
      setEditingImage(null)
    }
  }

  const submitManualEdit = async (dataUrl: string) => {
    if (!manualEditTarget) return
    setSavingManualEdit(true)
    setError(null)
    try {
      await saveManualEdit({ image: manualEditTarget.name, data_url: dataUrl })
      setManualEditTarget(null)
      mutate()
    } catch (err) {
      setError(
        getErrorMessage(err as FrappeError) ?? 'Could not save the edited image. Please try again.',
      )
    } finally {
      setSavingManualEdit(false)
    }
  }

  const toggleSelected = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const submitExport = async () => {
    if (selected.size === 0 || exporting) return
    setExporting(true)
    setError(null)
    try {
      // Preserve the order images appear in the gallery (newest first).
      const orderedNames = images.filter((img) => selected.has(img.name)).map((img) => img.name)
      const res = await exportPdf({ images: orderedNames })
      window.open(res.message.pdf_file, '_blank')
      setSelected(new Set())
    } catch (err) {
      setError(getErrorMessage(err as FrappeError) ?? 'Could not export the PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="app-page">
      <AppNav />
      <div className="studio-layout">
        <form className="studio-prompt-bar" onSubmit={submitGenerate}>
          <textarea
            className="studio-prompt-input"
            placeholder="Describe the image you want to generate…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={1}
          />
          <button
            type="submit"
            className="studio-generate-button"
            disabled={generating || !prompt.trim()}
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </form>

        {error && <div className="studio-error">{error}</div>}

        <div className="studio-export-bar">
          <span>{selected.size} selected</span>
          <button
            type="button"
            className="studio-export-button"
            disabled={selected.size === 0 || exporting}
            onClick={submitExport}
          >
            {exporting ? 'Exporting…' : 'Export as PDF'}
          </button>
        </div>

        <div className="studio-gallery">
          {images.length === 0 && (
            <div className="studio-empty">No images yet. Generate one above to get started.</div>
          )}
          {images.map((img) => (
            <div key={img.name} className="studio-card">
              <label className="studio-card-select">
                <input
                  type="checkbox"
                  checked={selected.has(img.name)}
                  onChange={() => toggleSelected(img.name)}
                />
              </label>
              <img className="studio-card-image" src={img.image} alt={img.prompt ?? img.source_type} />
              <div className="studio-card-meta">
                <span className="studio-card-tag">{img.source_type}</span>
                {img.prompt && <p className="studio-card-prompt">{img.prompt}</p>}
              </div>
              <div className="studio-card-actions">
                <button type="button" onClick={() => setManualEditTarget(img)}>
                  Manual edit
                </button>
                <button
                  type="button"
                  onClick={() => setEditPromptFor(editPromptFor === img.name ? null : img.name)}
                >
                  Edit with AI
                </button>
              </div>
              {editPromptFor === img.name && (
                <form
                  className="studio-edit-prompt"
                  onSubmit={(e) => {
                    e.preventDefault()
                    submitEdit(img.name)
                  }}
                >
                  <input
                    type="text"
                    placeholder="Describe the edit…"
                    value={editPromptText}
                    onChange={(e) => setEditPromptText(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" disabled={editingImage === img.name || !editPromptText.trim()}>
                    {editingImage === img.name ? 'Editing…' : 'Apply'}
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>

      {manualEditTarget && (
        <ImageEditorModal
          imageUrl={manualEditTarget.image}
          saving={savingManualEdit}
          onCancel={() => setManualEditTarget(null)}
          onSave={submitManualEdit}
        />
      )}
    </div>
  )
}
