import {
  clearQueue,
  getQueue,
  parseBody,
  processQueue,
  queueImageVariantBackfill,
  queueResponsiveImageOptimization,
  selectFrom,
} from '#pruvious/server'

// Test helper for the responsive image variant e2e tests (playground only).
export default defineEventHandler(async (event) => {
  const input = await parseBody(event, 'object').then(({ input }) => input)

  const record = async (id: number) => {
    const query = await selectFrom('Uploads')
      .select(['images', 'etag'])
      .where('id', '=', id)
      .withCustomContextData({ _allowUploadsQueries: true })
      .first()
    return query.success ? query.data : null
  }

  if (input.op === 'record') {
    return record(input.id)
  }

  if (input.op === 'pregenerate') {
    const queued = await queueResponsiveImageOptimization(input.id)
    await processQueue('pruvious-optimize-image')

    // The automatic queue worker may still be finishing a job
    for (let i = 0; i < 30; i++) {
      const data = await record(input.id)
      if (queued.every((suffix) => data?.images.includes(suffix))) {
        return { queued, images: data!.images }
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return { queued, images: (await record(input.id))?.images ?? [] }
  }

  if (input.op === 'backfill') {
    await clearQueue(['pruvious-backfill-image-variants', 'pruvious-optimize-image'])
    await queueImageVariantBackfill({ batchSize: 2, delay: 0 })
    const runs = await processQueue('pruvious-backfill-image-variants')
    const optimizeJobs = await getQueue('pruvious-optimize-image')
    await clearQueue('pruvious-optimize-image')
    return {
      runs: runs.length,
      jobs: optimizeJobs.map((job: any) => ({ id: job.payload.uploadIdOrPath, width: job.payload.options.width })),
    }
  }

  throw createError({ statusCode: 400 })
})
