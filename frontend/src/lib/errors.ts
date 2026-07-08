import type { FrappeError } from 'frappe-react-sdk'

// Some server messages (e.g. password strength feedback) are HTML meant for
// the desk's msgprint dialog. We only ever show plain text here, so strip tags
// rather than risk dangerouslySetInnerHTML on server-composed strings.
function stripHtml(input: string): string {
  return input
    .replace(/<li>/gi, '\n• ')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Frappe stuffs user-facing messages into `_server_messages` as a JSON-encoded array of JSON strings. */
export function getErrorMessage(error: FrappeError | null | undefined): string | null {
  if (!error) return null

  const serverMessages = error._server_messages
  if (serverMessages) {
    try {
      const parsed: string[] = JSON.parse(serverMessages)
      const messages = parsed
        .map((entry) => {
          try {
            return JSON.parse(entry).message as string
          } catch {
            return entry
          }
        })
        .filter(Boolean)
      if (messages.length) return stripHtml(messages.join('\n'))
    } catch {
      // fall through to generic message
    }
  }

  if (error.message && error.message !== 'There was an error.') return stripHtml(error.message)

  return 'Something went wrong. Please try again.'
}
