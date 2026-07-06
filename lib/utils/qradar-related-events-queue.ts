const relatedEventsQueueByKey = new Map<string, Promise<void>>()

// Run QRadar related-events tasks sequentially per queue key.
export async function enqueueQRadarRelatedEventsTask<T>(
  queueKey: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = relatedEventsQueueByKey.get(queueKey) || Promise.resolve()

  const runTask = previous
    .catch(() => undefined)
    .then(() => task())

  const tail = runTask
    .then(() => undefined)
    .catch(() => undefined)

  relatedEventsQueueByKey.set(queueKey, tail)

  try {
    return await runTask
  } finally {
    if (relatedEventsQueueByKey.get(queueKey) === tail) {
      relatedEventsQueueByKey.delete(queueKey)
    }
  }
}
