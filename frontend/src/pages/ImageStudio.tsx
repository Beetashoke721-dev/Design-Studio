import { useEffect, useState } from 'react'
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

interface ImageModelOption {
  id: string
  label: string
  provider: 'google' | 'huggingface'
  configured: boolean
}

export default function ImageStudio() {
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editPromptFor, setEditPromptFor] = useState<string | null>(null)
  const [editPromptText, setEditPromptText] = useState('')
  const [editModel, setEditModel] = useState('')
  const [editingImage, setEditingImage] = useState<string | null>(null)
  const [manualEditTarget, setManualEditTarget] = useState<ImageRow | null>(null)
  const [savingManualEdit, setSavingManualEdit] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data, mutate } = useFrappeGetCall<{ message: ImageRow[] }>(
    'design_studio.api.image_studio.list_images',
  )
  const { data: modelsData } = useFrappeGetCall<{ message: ImageModelOption[] }>(
    'design_studio.api.image_studio.get_available_image_models',
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
  const models = modelsData?.message ?? []

  // Default to the first model whose API key is actually configured.
  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      setSelectedModel(models.find((m) => m.configured)?.id ?? models[0].id)
    }
  }, [models, selectedModel])

  const submitGenerate = async (e: FormEvent) => {
    e.preventDefault()
    const text = prompt.trim()
    if (!text || generating || !selectedModel) return
    setGenerating(true)
    setError(null)
    try {
      await generateImage({ prompt: text, model: selectedModel })
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
      await editImage({ image, prompt: text, model: editModel || undefined })
      setEditPromptFor(null)
      setEditPromptText('')
      mutate()
    } catch (err) {
      setError(getErrorMessage(err as FrappeError) ?? 'Could not edit the image. Please try again.')
    } finally {
      setEditingImage(null)
    }
  }

  // Default the edit model to whichever model generated this image, falling
  // back to the currently selected generate-model if that one isn't set up.
  const openEditPrompt = (img: ImageRow) => {
    const isOpen = editPromptFor === img.name
    setEditPromptFor(isOpen ? null : img.name)
    if (!isOpen) {
      const sourceModel = img.model && models.some((m) => m.id === img.model) ? img.model : ''
      setEditModel(sourceModel || selectedModel)
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
        <div className="studio-model-bar">
          <select
            className="studio-model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <optgroup label="Google">
              {models
                .filter((m) => m.provider === 'google')
                .map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.configured}>
                    {m.label}
                    {!m.configured ? ' — needs API key' : ''}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Hugging Face">
              {models
                .filter((m) => m.provider === 'huggingface')
                .map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.configured}>
                    {m.label}
                    {!m.configured ? ' — needs API token' : ''}
                  </option>
                ))}
            </optgroup>
          </select>
        </div>

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
            disabled={generating || !prompt.trim() || !selectedModel}
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
                <button type="button" onClick={() => openEditPrompt(img)}>
                  Edit with AI
                </button>
              </div>
              {editPromptFor === img.name && (
                <div className="studio-edit-wrap">
                  <form
                    className="studio-edit-prompt"
                    onSubmit={(e) => {
                      e.preventDefault()
                      submitEdit(img.name)
                    }}
                  >
                    <select
                      className="studio-edit-model-select"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id} disabled={!m.configured}>
                          {m.provider === 'google' ? 'Gemini' : 'Hugging Face'}
                          {!m.configured ? ' — needs key' : ''}
                        </option>
                      ))}
                    </select>
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
                  {models.find((m) => m.id === editModel)?.provider === 'huggingface' && (
                    <p className="studio-edit-hint">
                      Hugging Face can't edit existing pixels — it regenerates a new image from the
                      original description plus your instruction.
                    </p>
                  )}
                </div>
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
