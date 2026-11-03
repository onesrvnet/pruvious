<template>
  <div>
    <PruviousImage
      :image="image"
      :loading="loading"
      :responsive="responsive"
      :sizes="sizes"
      :variant="variant"
      :widths="widths"
      fetchpriority="high"
      class="test-image"
    />
    <pre id="resolved">{{ JSON.stringify(resolved) }}</pre>
    <PruviousPicture
      :image="image"
      :loading="loading"
      :responsive="responsive"
      :sizes="sizes"
      :widths="widths"
      class="test-picture"
    />
  </div>
</template>

<script lang="ts" setup>
import { resolveResponsiveImage, responsiveImages } from '#pruvious/app'

// Renders `<PruviousImage>` and `<PruviousPicture>` from query parameters for the responsive image e2e tests.
const query = useRoute().query
const str = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined)

const image = {
  path: str('path') ?? '/test.png',
  mime: str('mime') ?? 'image/png',
  imageWidth: Number(str('w') ?? 0),
  imageHeight: Number(str('h') ?? 0),
  images: str('images')?.split(',') ?? [],
  etag: str('etag') ?? null,
}
const loading = (str('loading') ?? 'lazy') as 'lazy' | 'eager'
const responsive = str('responsive') !== 'false'
const sizes = str('sizes')
const variant = str('variant') as any
const widths = str('widths')?.split(',').map(Number)

// `resolveResponsiveImage()` with an optional `publicURL` override (the test server has no `uploads.publicURL`)
const resolved = responsiveImages
  ? resolveResponsiveImage(image, responsiveImages, { widths, publicURL: str('publicURL') })
  : null
</script>
