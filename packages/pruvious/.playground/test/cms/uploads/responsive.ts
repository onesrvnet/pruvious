import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { $fetchRaw, $postFormData } from '../utils'

describe('responsive images', () => {
  const ladder = [256, 512, 768, 1024, 1280, 1920, 2560]

  /**
   * Renders the test page and returns the attributes of the `<img>` with the given class
   * (`test-image` for `<PruviousImage>`, inside `<picture class="test-picture">` for `<PruviousPicture>`).
   */
  async function render(params: Record<string, string | number>, which: 'image' | 'picture' = 'image') {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
    const { status, data } = await $fetchRaw(`/test/responsive-image?${qs}`)
    expect(status).toBe(200)
    const html = String(data)
    const tag =
      which === 'image'
        ? html.match(/<img[^>]*class="test-image"[^>]*>/)?.[0]
        : html.match(/<picture[^>]*class="test-picture"[^>]*>[\s\S]*?(<img[^>]*>)/)?.[1]
    expect(tag).toBeDefined()
    const attr = (name: string) => tag!.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
    return {
      src: attr('src'),
      srcset: attr('srcset'),
      sizes: attr('sizes'),
      width: attr('width'),
      height: attr('height'),
      fetchpriority: attr('fetchpriority'),
    }
  }

  function descriptors(srcset: string | undefined): string[] {
    return (srcset ?? '').split(', ').map((candidate) => candidate.split(' ')[1]!)
  }

  test('renders ladder widths below the original plus the original', async () => {
    const img = await render({ path: '/photo.png', mime: 'image/png', w: 1200, h: 630 })
    expect(descriptors(img.srcset)).toEqual(['256w', '512w', '768w', '1024w', '1200w'])
    expect(img.srcset).toContain('/uploads/photo.png 1200w')
    expect(img.src).toMatch(/^\/uploads\/photo_.*w768.*\.webp$/)
    expect(img.width).toBe('1200')
    expect(img.height).toBe('630')
    expect(img.fetchpriority).toBe('high')
  })

  test('never upscales: large originals are capped at the largest ladder width', async () => {
    const img = await render({ path: '/huge.jpg', mime: 'image/jpeg', w: 4000, h: 3000 })
    expect(descriptors(img.srcset)).toEqual(ladder.map((w) => `${w}w`))
    expect(img.srcset).not.toContain('/uploads/huge.jpg ')
    expect(img.width).toBe('4000')
  })

  test('an original that matches a ladder width uses the variant, not the original', async () => {
    const img = await render({ path: '/exact.jpg', mime: 'image/jpeg', w: 1024, h: 512 })
    expect(descriptors(img.srcset)).toEqual(['256w', '512w', '768w', '1024w'])
    expect(img.srcset).not.toContain('/uploads/exact.jpg ')
  })

  test('small originals smaller than 768px use the largest candidate as src', async () => {
    const img = await render({ path: '/small.png', mime: 'image/png', w: 600, h: 300 })
    expect(descriptors(img.srcset)).toEqual(['256w', '512w', '600w'])
    expect(img.src).toBe('/uploads/small.png')
  })

  test('originals smaller than every ladder width render as-is', async () => {
    const img = await render({ path: '/icon.png', mime: 'image/png', w: 200, h: 200 })
    expect(img.srcset).toBeUndefined()
    expect(img.sizes).toBeUndefined()
    expect(img.src).toBe('/uploads/icon.png')
  })

  test('svg and gif are excluded', async () => {
    for (const [path, mime] of [
      ['/logo.svg', 'image/svg+xml'],
      ['/anim.gif', 'image/gif'],
    ]) {
      const img = await render({ path: path!, mime: mime!, w: 2000, h: 1000 })
      expect(img.srcset).toBeUndefined()
      expect(img.src).toBe(`/uploads${path}`)
    }
  })

  test('missing intrinsic dimensions render the original', async () => {
    const img = await render({ path: '/nodims.png', mime: 'image/png', w: 0, h: 0 })
    expect(img.srcset).toBeUndefined()
    expect(img.src).toBe('/uploads/nodims.png')
  })

  test('sizes defaults to "auto, 100vw" when lazy and "100vw" when eager', async () => {
    expect((await render({ path: '/a.png', mime: 'image/png', w: 1200, h: 600 })).sizes).toBe('auto, 100vw')
    expect((await render({ path: '/a.png', mime: 'image/png', w: 1200, h: 600, loading: 'eager' })).sizes).toBe('100vw')
    expect(
      (await render({ path: '/a.png', mime: 'image/png', w: 1200, h: 600, sizes: '(min-width: 1024px) 50vw, 100vw' }))
        .sizes,
    ).toBe('(min-width: 1024px) 50vw, 100vw')
  })

  test('responsive: false and an explicit variant keep the old behavior', async () => {
    const off = await render({ path: '/a.png', mime: 'image/png', w: 1200, h: 600, responsive: 'false' })
    expect(off.srcset).toBeUndefined()
    expect(off.src).toBe('/uploads/a.png')

    const variant = await render({ path: '/a.png', mime: 'image/png', w: 1200, h: 600, variant: 'mobile' })
    expect(variant.srcset).toBeUndefined()
    expect(variant.src).toMatch(/^\/uploads\/a_.*w768.*\.webp$/)
  })

  test('widths limits the ladder (capped at its largest width) and ignores unknown widths', async () => {
    const img = await render({ path: '/a.png', mime: 'image/png', w: 1200, h: 600, widths: '512,1024,999' })
    expect(descriptors(img.srcset)).toEqual(['512w', '1024w'])
  })

  test('<PruviousPicture> fallback img gets the same srcset', async () => {
    const img = await render({ path: '/photo.png', mime: 'image/png', w: 1200, h: 630 }, 'picture')
    expect(descriptors(img.srcset)).toEqual(['256w', '512w', '768w', '1024w', '1200w'])
    expect(img.sizes).toBe('auto, 100vw')
    expect(img.width).toBe('1200')
  })

  // Cache-Control
  let variantURL = ''

  test('setup: upload an image', async () => {
    const png = new File(
      [fs.readFileSync('packages/pruvious/.playground/test/files/test-og.png')],
      'responsive-cache.png',
    )
    const result: any = await $postFormData('/api/uploads', { '': png })
    expect(result[0].success).toBe(true)
    expect(result[0].details.path).toBe('/responsive-cache.png')

    const img = await render({ path: '/responsive-cache.png', mime: 'image/png', w: 1200, h: 630 })
    variantURL = img.srcset!.split(', ')[1]!.split(' ')[0]!
    expect(variantURL).toMatch(/w512/)
  })

  test('ladder variants are served with a long immutable Cache-Control', async () => {
    const res = await $fetchRaw(variantURL)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  test('originals are served with a short Cache-Control', async () => {
    const res = await $fetchRaw('/uploads/responsive-cache.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
  })

  test('widths outside the ladder return 404 without Cache-Control', async () => {
    const res = await $fetchRaw(variantURL.replace('w512', 'w500'))
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).not.toMatch(/immutable|max-age=3600/)
  })

  test('missing files return 404 without Cache-Control', async () => {
    const res = await $fetchRaw('/uploads/does-not-exist.png')
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).not.toMatch(/immutable|max-age=3600/)
  })
})
