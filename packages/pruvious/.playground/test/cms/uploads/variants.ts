import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { $deleteAsAdmin, $fetchRaw, $postAsAdmin, $postFormData } from '../utils'

describe('generated image variants', () => {
  const storage = 'packages/pruvious/.playground/test/tmp/.uploads'
  const cdn = 'https://cdn.example.com/bucket/'
  const call = (body: Record<string, any>) => $postAsAdmin('/api/test/image-variants', body) as Promise<any>
  const upload = async (name: string, query = '') => {
    const file = new File([fs.readFileSync('packages/pruvious/.playground/test/files/test-og.png')], name)
    const result: any = await $postFormData(`/api/uploads${query}`, { '': file })
    expect(result[0].success).toBe(true)
    return result[0].details.id as number
  }

  /**
   * Renders the test page and returns the `resolveResponsiveImage()` result for the given upload fields.
   */
  async function resolve(params: Record<string, string | number>) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
    const { data } = await $fetchRaw(`/test/responsive-image?${qs}`)
    const json = String(data)
      .match(/<pre id="resolved">([\s\S]*?)<\/pre>/)![1]!
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
    return JSON.parse(json) as { src: string; srcset: string }
  }

  function candidates(srcset: string): Record<string, string> {
    return Object.fromEntries(
      srcset.split(', ').map((candidate) => {
        const [url, width] = candidate.split(' ')
        return [width!, url!]
      }),
    )
  }

  let id = 0

  test('setup: upload an image', async () => {
    id = await upload('variants-a.png')
  })

  test('a variant generated on the first request is registered on the upload', async () => {
    expect((await call({ op: 'record', id })).images).toEqual([])

    const res = await $fetchRaw('/uploads/variants-a_oextpng_w512.webp')
    expect(res.status).toBe(200)
    expect(fs.existsSync(`${storage}/variants-a-oextpng-w512.webp`)).toBe(true)
    expect((await call({ op: 'record', id })).images).toEqual(['_oextpng_w512.webp'])
  })

  test('generated variants link to the public URL, others stay on /uploads/', async () => {
    const { images, etag } = await call({ op: 'record', id })
    const resolved = await resolve({
      path: '/variants-a.png',
      mime: 'image/png',
      w: 1200,
      h: 630,
      images: images.join(','),
      etag,
      publicURL: cdn,
    })
    const urls = candidates(resolved.srcset)
    const v = etag.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)

    // The bucket key is the normalized storage path of the variant
    expect(urls['512w']).toBe(`${cdn}variants-a-oextpng-w512.webp?v=${v}`)
    expect(fs.existsSync(`${storage}/variants-a-oextpng-w512.webp`)).toBe(true)
    expect(urls['256w']).toBe(`/uploads/variants-a_oextpng_w256.webp?v=${v}`)
    expect(urls['1200w']).toBe(`${cdn}variants-a.png?v=${v}`)
  })

  test('without a public URL, generated variants still go through /uploads/', async () => {
    const { images } = await call({ op: 'record', id })
    const resolved = await resolve({
      path: '/variants-a.png',
      mime: 'image/png',
      w: 1200,
      h: 630,
      images: images.join(','),
    })
    expect(candidates(resolved.srcset)['512w']).toBe('/uploads/variants-a_oextpng_w512.webp')
  })

  test('pregenerating queues the missing ladder widths up to the image width', async () => {
    const result = await call({ op: 'pregenerate', id })
    expect(result.queued).toEqual(['_oextpng_w256.webp', '_oextpng_w768.webp', '_oextpng_w1024.webp'])
    expect([...result.images].sort()).toEqual(
      ['_oextpng_w1024.webp', '_oextpng_w256.webp', '_oextpng_w512.webp', '_oextpng_w768.webp'].sort(),
    )
    expect(fs.existsSync(`${storage}/variants-a-oextpng-w1024.webp`)).toBe(true)

    // Nothing left to queue
    expect((await call({ op: 'pregenerate', id })).queued).toEqual([])
  })

  test('replacing an upload deletes its variants and clears the record', async () => {
    const newId = await upload('variants-a.png', '?overwrite=true')
    expect(fs.existsSync(`${storage}/variants-a-oextpng-w512.webp`)).toBe(false)
    expect(fs.existsSync(`${storage}/variants-a-oextpng-w1024.webp`)).toBe(false)
    expect((await call({ op: 'record', id: newId })).images).toEqual([])
    id = newId
  })

  test('deleting an upload deletes its variants', async () => {
    expect((await $fetchRaw('/uploads/variants-a_oextpng_w256.webp')).status).toBe(200)
    expect(fs.existsSync(`${storage}/variants-a-oextpng-w256.webp`)).toBe(true)

    await $deleteAsAdmin(`/api/uploads/${id}`)
    expect(fs.existsSync(`${storage}/variants-a-oextpng-w256.webp`)).toBe(false)
    expect(fs.existsSync(`${storage}/variants-a.png`)).toBe(false)
  })

  test('backfill queues missing ladder variants for existing images in batches', async () => {
    const backfillId = await upload('variants-b.png')
    const result = await call({ op: 'backfill' })

    expect(result.runs).toBeGreaterThan(1)
    expect(
      result.jobs
        .filter((job: any) => job.id === backfillId)
        .map((job: any) => job.width)
        .sort((a: number, b: number) => a - b),
    ).toEqual([256, 512, 768, 1024])

    await $deleteAsAdmin(`/api/uploads/${backfillId}`)
  })
})
