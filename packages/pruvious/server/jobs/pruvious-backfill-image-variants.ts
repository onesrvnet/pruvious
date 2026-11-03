import { defineJob, queueJob, queueResponsiveImageOptimization, selectFrom } from '#pruvious/server'

/**
 * Queues the missing responsive ladder variants (`pruvious.images.responsive`) for existing image uploads.
 *
 * Each run handles `batchSize` image uploads with an `id` greater than `afterId`, then schedules the
 * next batch `delay` milliseconds later. Start it with `queueImageVariantBackfill()`.
 */
export default defineJob({
  retry: { count: 3, delay: 5000 },
  handler: async ({ afterId, batchSize, delay }: { afterId: number; batchSize: number; delay: number }) => {
    const uploads = await selectFrom('Uploads')
      .select('id')
      .where('category', '=', 'image')
      .where('id', '>', afterId)
      .orderBy('id', 'asc')
      .limit(batchSize)
      .withCustomContextData({ _allowUploadsQueries: true })
      .all()

    if (!uploads.success) {
      throw new Error(uploads.runtimeError || 'Database query failed')
    }

    let queued = 0

    for (const { id } of uploads.data) {
      queued += (await queueResponsiveImageOptimization(id)).length
    }

    const lastId = uploads.data[uploads.data.length - 1]?.id ?? afterId
    const done = uploads.data.length < batchSize

    if (!done) {
      await queueJob('pruvious-backfill-image-variants', {
        afterId: lastId,
        batchSize,
        delay,
        scheduledAt: Date.now() + delay,
      })
    }

    return { processed: uploads.data.length, queued, lastId, done }
  },
})
