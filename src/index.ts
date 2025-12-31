import { abortable } from '@jcoreio/abortable'

export function safeIterateReadableStream<T>(
  stream: ReadableStream<T>,
  signal?: AbortSignal
) {
  const abortController = new AbortController()
  if (signal?.aborted) abortController.abort(signal.reason)
  function onAbort() {
    abortController.abort(signal?.reason)
    signal?.removeEventListener('abort', onAbort)
  }
  signal?.addEventListener('abort', onAbort)
  const innerSignal = abortController.signal
  return {
    [Symbol.asyncIterator](): AsyncIterator<T, void> {
      let reader: ReadableStreamDefaultReader<T> | undefined

      function onInnerAbort() {
        cleanup().catch(() => {})
      }
      async function doCleanup() {
        if (!reader) return
        try {
          innerSignal.removeEventListener('abort', onInnerAbort)
          await reader.cancel(innerSignal.reason)
        } catch {
          // ignore
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
            innerSignal.addEventListener('abort', onInnerAbort)
            reader = stream.getReader()
            if (innerSignal.aborted) await reader.cancel(innerSignal.reason)
          }
          const result = await abortable(
            reader.read().then(
              async (result) => {
                if (result.done) await cleanup()
                return result
              },
              async (error: unknown) => {
                await cleanup()
                throw error
              }
            ),
            innerSignal
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
