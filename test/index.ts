import { describe, it } from 'mocha'
import { expect } from 'chai'
import { safeIterateReadableStream } from '../src/index'
import { withResolvers } from './withResolvers'

function isAbortError(error: any) {
  return error?.name === 'AbortError'
}

describe(`safeIterateReadableStream`, function () {
  it(`breaks when signal is aborted`, async function () {
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(1)
        controller.enqueue(2)
        await new Promise(() => {})
      },
    })
    const ac = new AbortController()
    let i = 0
    try {
      for await (const elem of safeIterateReadableStream(stream, ac.signal)) {
        expect(elem).to.equal(++i)
        if (elem >= 2) ac.abort()
      }
    } catch (error) {
      if (!isAbortError(error)) throw error
    }
    expect(stream.locked).to.be.false
  })
  it(`cleans up after error reading stream`, async function () {
    const stream = new ReadableStream({
      async pull(controller) {
        controller.error(new Error('test'))
      },
    })
    const ac = new AbortController()
    try {
      for await (const elem of safeIterateReadableStream(stream, ac.signal)) {
        elem
      }
    } catch (error) {
      expect(error).to.deep.equal(new Error('test'))
    }
    expect(stream.locked).to.be.false
  })

  it(`breaks when signal is aborted`, async function () {
    const aborted = withResolvers<void>()
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(1)
        controller.enqueue(2)
        await aborted.promise
        controller.enqueue(3)
      },
    })
    const ac = new AbortController()
    let i = 0
    try {
      for await (const elem of safeIterateReadableStream(stream, ac.signal)) {
        expect(elem).to.equal(++i)
        if (elem >= 2) {
          ac.abort()
          aborted.resolve()
        }
      }
    } catch (error) {
      if (!isAbortError(error)) throw error
    }
    expect(stream.locked).to.be.false
  })
  it(`cancels reader when iteratee returns`, async function () {
    let i = 0
    const stream = new ReadableStream({
      async pull(controller) {
        controller.enqueue(++i)
      },
    })
    const ac = new AbortController()
    let j = 0
    for await (const elem of safeIterateReadableStream(stream, ac.signal)) {
      expect(elem).to.equal(++j)
      if (elem > 2) break
    }
    expect(stream.locked).to.be.false
  })
  it(`cancels reader when iteratee throws`, async function () {
    let i = 0
    const stream = new ReadableStream({
      async pull(controller) {
        controller.enqueue(++i)
      },
    })
    const ac = new AbortController()
    let j = 0
    try {
      for await (const elem of safeIterateReadableStream(stream, ac.signal)) {
        expect(elem).to.equal(++j)
        if (elem > 2) throw new Error('test')
      }
    } catch (error) {
      expect(error).to.deep.equal(new Error('test'))
    }
    expect(stream.locked).to.be.false
  })
})
