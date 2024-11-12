# @jcoreio/safe-iterate-readable-stream

avoid pitfalls when async iterating a ReadableStream

[![CircleCI](https://circleci.com/gh/jcoreio/safe-iterate-readable-stream.svg?style=svg)](https://circleci.com/gh/jcoreio/safe-iterate-readable-stream)
[![Coverage Status](https://codecov.io/gh/jcoreio/safe-iterate-readable-stream/branch/master/graph/badge.svg)](https://codecov.io/gh/jcoreio/safe-iterate-readable-stream)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![npm version](https://badge.fury.io/js/%40jcoreio%2Fsafe-iterate-readable-stream.svg)](https://badge.fury.io/js/%40jcoreio%2Fsafe-iterate-readable-stream)

Long-lived promises are dangerous. At JCore Systems, we have a lot of places we wrap pubsub in async iterables or `ReadableStream`s. This means we're creating
promises that can be indefinitely pending until the next pubsub event comes in.

It's extremely easy to cause memory and resource leaks with long-lived promises like this. Even if you use `Promise.race([resultPromise, abortPromise(signal)])`
to make sure a next event promise rejects right away if you abort a signal, [it still leaks memory](https://github.com/nodejs/node/issues/17469). The handlers
that were waiting on the promise are still retained as long as `resultPromise` is pending, even after the other promise rejects.

To complicate matters with `ReadableStream`s, the builtin `ReadableStream[Symbol.asyncIterator]` implementation doesn't cancel the stream right away when the iterator
is `return()`ed if the last `next()` promise is still pending because the underlying read is waiting. If the read doesn't resolve until a pubsub event comes in,
the stream could be stuck open for an unbounded amount of time.

To avoid this danger, you have to either write the underlying operations to time out after a maximum amount of time (which still delays cleanup temporarily) or
use use carefully-written logic like `@jcoreio/safe-iterate-readable-stream` provides to guarantee timely cleanup when async operations are aborted.

## `safeIterateReadableStream(stream, signal)`

Returns an `AsyncIterable` that iterates over the given stream. If the iterator is `return()`ed, `throw()`n, or `signal` is aborted, it will close and reject
any outstanding `next()` promises immediately.

```ts
import { safeIterateReadableStream } from '@jcoreio/safe-iterate-readable-stream'

const stream = new ReadableStream({ ... })

const abortController = new AbortController()
const { signal } = abortController

for await (const chunk of safeIterateReadableStream(stream, signal)) {
  console.log(chunk)
}
```
