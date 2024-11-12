import { abortable } from '@jcoreio/abortable'

export function safeIterateReadableStream<T>(
  stream: ReadableStream<T>,
  signal: AbortSignal
) {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T, void> {
      let reader: ReadableStreamDefaultReader<T> | undefined

      function onAbort() {
        cleanup().catch(() => {})
      }
      async function doCleanup() {
        if (!reader) return
        try {
          signal.removeEventListener('abort', onAbort)
          await reader.cancel()
        } finally {
          reader.releaseLock()
        }
      }
      let cleanupResult: [Promise<void>] | undefined
      function cleanup() {
        return (cleanupResult || (cleanupResult = [doCleanup()]))[0]
      }

      return {
        async next() {
          if (!reader) {
            signal.addEventListener('abort', onAbort)
            reader = stream.getReader()
          }
          const result = await abortable(
            reader.read().then(
              async (result) => {
                if (result.done) await cleanup()
                return result
              },
              async (error) => {
                await cleanup()
                throw error
              }
            ),
            signal
          )
          return result.done ? { done: true, value: undefined } : result
        },
        async return() {
          await cleanup()
          return { done: true, value: undefined }
        },
        async throw() {
          await cleanup()
          return { done: true, value: undefined }
        },
      }
    },
  }
}
