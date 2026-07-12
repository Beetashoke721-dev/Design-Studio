import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useFrappeGetCall, useFrappePostCall, type FrappeError } from 'frappe-react-sdk'
import AppNav from '../components/AppNav'
import { getErrorMessage } from '../lib/errors'
import './chat.css'

interface ConversationRow {
  name: string
  title: string
  model: string
  modified: string
}

interface MessageRow {
  name: string
  role: 'User' | 'Assistant'
  content: string
  creation: string
}

interface SendMessageResponse {
  conversation: string
  title: string
  model: string
  reply: string
}

interface ModelOption {
  id: string
  label: string
  provider: 'anthropic' | 'google'
  configured: boolean
}

interface DisplayMessage {
  key: string
  role: 'User' | 'Assistant'
  content: string
}

export default function Chat() {
  const [activeConversation, setActiveConversation] = useState<string | null>(null)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: conversationsData, mutate: mutateConversations } = useFrappeGetCall<{
    message: ConversationRow[]
  }>('design_studio.api.chatbot.list_conversations')

  const { data: messagesData } = useFrappeGetCall<{ message: MessageRow[] }>(
    'design_studio.api.chatbot.get_messages',
    { conversation: activeConversation },
    activeConversation ? undefined : null,
  )

  const { data: modelsData } = useFrappeGetCall<{ message: ModelOption[] }>(
    'design_studio.api.chatbot.get_available_models',
  )

  const { call: sendMessage } = useFrappePostCall<{ message: SendMessageResponse }>(
    'design_studio.api.chatbot.send_message',
  )

  const conversations = conversationsData?.message ?? []
  const models = modelsData?.message ?? []
  const hasAnyConfigured = models.some((m) => m.configured)

  // Default to the first model whose API key is actually configured.
  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      setSelectedModel(models.find((m) => m.configured)?.id ?? models[0].id)
    }
  }, [models, selectedModel])

  useEffect(() => {
    if (activeConversation && messagesData?.message) {
      setMessages(
        messagesData.message.map((m) => ({ key: m.name, role: m.role, content: m.content })),
      )
    }
  }, [activeConversation, messagesData])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const startNewChat = () => {
    setActiveConversation(null)
    setMessages([])
    setError(null)
  }

  const selectConversation = (c: ConversationRow) => {
    setActiveConversation(c.name)
    setSelectedModel(c.model)
    setError(null)
  }

  const submitMessage = async () => {
    const text = input.trim()
    if (!text || sending || !selectedModel) return

    setError(null)
    setInput('')
    setMessages((prev) => [...prev, { key: `local-${Date.now()}`, role: 'User', content: text }])
    setSending(true)

    try {
      const res = await sendMessage({
        message: text,
        conversation: activeConversation ?? undefined,
        model: selectedModel,
      })
      setMessages((prev) => [
        ...prev,
        { key: `local-${Date.now()}-reply`, role: 'Assistant', content: res.message.reply },
      ])
      if (!activeConversation) {
        setActiveConversation(res.message.conversation)
      }
    } catch (err) {
      setError(getErrorMessage(err as FrappeError) ?? 'Could not reach the model. Please try again.')
    } finally {
      setSending(false)
      // A conversation may have been created server-side even if the model call
      // itself failed, so refresh the sidebar regardless of outcome.
      mutateConversations()
    }
  }

  const modelLocked = messages.length > 0
  const activeModelLabel = models.find((m) => m.id === selectedModel)?.label ?? selectedModel

  return (
    <div className="app-page">
      <AppNav />
      <div className="chat-layout">
        <aside className="chat-sidebar">
          <button type="button" className="chat-new-button" onClick={startNewChat}>
            + New chat
          </button>
          <div className="chat-conversation-list">
            {conversations.map((c) => (
              <button
                key={c.name}
                type="button"
                className={
                  'chat-conversation-item' + (c.name === activeConversation ? ' active' : '')
                }
                onClick={() => selectConversation(c)}
              >
                {c.title || 'Untitled chat'}
              </button>
            ))}
          </div>
        </aside>

        <main className="chat-main">
          <div className="chat-model-bar">
            {modelLocked ? (
              <span className="chat-model-locked">Model: {activeModelLabel}</span>
            ) : (
              <select
                className="chat-model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                <optgroup label="Claude (Anthropic)">
                  {models
                    .filter((m) => m.provider === 'anthropic')
                    .map((m) => (
                      <option key={m.id} value={m.id} disabled={!m.configured}>
                        {m.label}
                        {!m.configured ? ' — needs API key' : ''}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Gemini (Google)">
                  {models
                    .filter((m) => m.provider === 'google')
                    .map((m) => (
                      <option key={m.id} value={m.id} disabled={!m.configured}>
                        {m.label}
                        {!m.configured ? ' — needs API key' : ''}
                      </option>
                    ))}
                </optgroup>
              </select>
            )}
          </div>

          <div className="chat-messages" ref={scrollRef}>
            {messages.length === 0 && !hasAnyConfigured && (
              <div className="chat-empty">
                No model is configured yet. Ask an administrator to add an API key in AI Settings.
              </div>
            )}
            {messages.length === 0 && hasAnyConfigured && (
              <div className="chat-empty">Ask anything to get started.</div>
            )}
            {messages.map((m) => (
              <div key={m.key} className={`chat-bubble chat-bubble--${m.role.toLowerCase()}`}>
                {m.content}
              </div>
            ))}
            {sending && <div className="chat-bubble chat-bubble--assistant chat-bubble--pending">Thinking…</div>}
          </div>

          {error && <div className="chat-error">{error}</div>}

          <form
            className="chat-input-bar"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              submitMessage()
            }}
          >
            <textarea
              className="chat-input"
              placeholder="Type a message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submitMessage()
                }
              }}
              rows={1}
            />
            <button
              type="submit"
              className="chat-send-button"
              disabled={sending || !input.trim() || !selectedModel}
            >
              Send
            </button>
          </form>
        </main>
      </div>
    </div>
  )
}
