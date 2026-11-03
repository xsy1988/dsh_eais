import type { Disposable } from './port.js'

export class SerialMountQueue {
  private tail: Promise<void> = Promise.resolve()
  private closed = false

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error('EAIS 挂载队列已关闭'))
    }
    const result = this.tail.then(work, work)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }

  async close(): Promise<void> {
    this.closed = true
    await this.tail
  }
}

export async function disposeAll(...resources: Array<Disposable | undefined>): Promise<void> {
  let firstError: unknown
  for (const resource of resources) {
    if (!resource) continue
    try {
      await resource.dispose()
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError) throw firstError
}

export async function disposeReverse(resources: Disposable[]): Promise<void> {
  let firstError: unknown
  for (const resource of [...resources].reverse()) {
    try {
      await resource.dispose()
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError) throw firstError
}
