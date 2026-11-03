import { isUndefined } from '@pruvious/utils'
import { extname, join } from 'pathe'
import { stringifyImageTransformOptions, type ImageVariantOptions } from './images.shared'
import { joinPublicUploadURL, optimizableImageTypes } from './utils.shared'

/**
 * Resolves the full URL `path` of an upload based on its relative path in the media library.
 *
 * @example
 * ```ts
 * const url = resolveUploadPath('/images/photo.jpg')
 * //=> '/uploads/images/photo.jpg'
 * ```
 */
export function resolveUploadPath(path: string): string {
  const runtimeConfig = useRuntimeConfig()
  return join(runtimeConfig.app.baseURL, runtimeConfig.public.pruvious.uploadsBasePath, path)
}

/**
 * Resolves the public URL of an original upload.
 * Points directly at the storage driver when `pruvious.uploads.publicURL` is set,
 * otherwise falls back to `resolveUploadPath()`.
 *
 * Use it for original files only. Image variants are generated on demand and must go through `resolveUploadPath()`.
 *
 * @example
 * ```ts
 * // With `publicURL: 'https://s3.example.com/my-bucket/'`
 * const url = resolvePublicUploadPath('/images/photo.jpg')
 * //=> 'https://s3.example.com/my-bucket/images/photo.jpg'
 * ```
 */
export function resolvePublicUploadPath(path: string): string {
  const { uploadsPublicURL } = useRuntimeConfig().public.pruvious
  return uploadsPublicURL ? joinPublicUploadURL(uploadsPublicURL, path) : resolveUploadPath(path)
}

/**
 * Resolves the thumbnail URL path for a given image `upload`.
 * If the image is smaller than or equal to 320x320 pixels, it returns the original image URL.
 * Otherwise, it constructs and returns the URL for a 320x320 pixel thumbnail version of the image.
 *
 * @example
 * ```ts
 * const thumbnailUrl = resolveThumbnailPath({
 *   imageWidth: 800,
 *   imageHeight: 600,
 *   path: '/images/photo.jpg',
 * })
 * //=> '/uploads/images/photo_oextjpg_w320_h320_contain.webp'
 * ```
 */
export function resolveThumbnailPath(upload: { imageWidth: number; imageHeight: number; path: string }): string {
  if (upload.imageWidth <= 320 && upload.imageHeight <= 320) {
    return resolveUploadPath(upload.path)
  }
  const ext = extname(upload.path)
  const oext = ext ? '_oext' + extname(upload.path).slice(1) : ''
  return resolveUploadPath(upload.path.slice(0, -ext.length) + oext + '_w320_h320_contain.webp')
}

/**
 * Resolves the full URL of a transformed image variant for the given `upload`.
 * Falls back to the original upload URL when the upload's MIME type is not
 * optimizable (e.g. icons, BMP) so consumers can render any image without
 * additional checks.
 *
 * @example
 * ```ts
 * resolveImageVariantPath(
 *   { path: '/photos/sunset.jpg', mime: 'image/jpeg' },
 *   { format: 'webp', width: 320, height: 320, fit: 'contain' },
 * )
 * //=> '/uploads/photos/sunset_oextjpg_w320_h320_contain.webp'
 * ```
 */
export function resolveImageVariantPath(upload: { path: string; mime: string }, options: ImageVariantOptions): string {
  if (isUndefined(optimizableImageTypes[upload.mime])) {
    return resolvePublicUploadPath(upload.path)
  }
  const originalExtension = extname(upload.path)
  const base = originalExtension ? upload.path.slice(0, -originalExtension.length) : upload.path
  return resolveUploadPath(base + stringifyImageTransformOptions({ ...options, originalExtension }))
}

/**
 * Responsive `<img>` attributes resolved by `resolveResponsiveImage()`.
 */
export interface ResponsiveImage {
  /**
   * The `src` attribute: the smallest candidate at least `768px` wide, or the largest candidate when all are smaller.
   */
  src: string

  /**
   * The `srcset` attribute with width descriptors (e.g. `'/uploads/a_oextjpg_w256_q80.webp 256w, ...'`).
   */
  srcset: string

  /**
   * Intrinsic width of the original image, for the `width` attribute.
   */
  width: number

  /**
   * Intrinsic height of the original image, for the `height` attribute.
   */
  height: number
}

/**
 * Resolves `src` and `srcset` for an image `upload` from the responsive `ladder` (`pruvious.images.responsive`).
 *
 * - Ladder widths smaller than the original become variant candidates. Images are never upscaled.
 * - The original is added as the largest candidate when it is smaller than the largest ladder width
 *   (and no ladder width matches it exactly). Larger originals are capped at the largest ladder width.
 * - `options.widths` limits the ladder to a subset of its widths, and the largest listed width caps the srcset.
 *   Widths outside the ladder are ignored, since the upload route only serves configured variants.
 *
 * Returns `null` when the image should be rendered as-is: SVG, GIF or non-optimizable images,
 * missing intrinsic dimensions, or no ladder width smaller than the original.
 *
 * @example
 * ```ts
 * resolveResponsiveImage(
 *   { path: '/hero.png', mime: 'image/png', imageWidth: 1000, imageHeight: 500 },
 *   responsiveImages,
 * )
 * //=> {
 * //   src: '/uploads/hero_oextpng_w768_q80.webp',
 * //   srcset: '/uploads/hero_oextpng_w256_q80.webp 256w, ..., /uploads/hero.png 1000w',
 * //   width: 1000,
 * //   height: 500,
 * // }
 * ```
 */
export function resolveResponsiveImage(
  upload: { path: string; mime: string; imageWidth?: number | null; imageHeight?: number | null },
  ladder: { widths: number[]; variants: Required<ImageVariantOptions>[] },
  options?: { widths?: number[] },
): ResponsiveImage | null {
  const width = upload.imageWidth ?? 0
  const height = upload.imageHeight ?? 0

  if (
    isUndefined(optimizableImageTypes[upload.mime]) ||
    upload.mime === 'image/svg+xml' ||
    upload.mime === 'image/gif' ||
    !(width > 0) ||
    !(height > 0)
  ) {
    return null
  }

  const steps = ladder.widths
    .map((w, i) => ({ width: w, variant: ladder.variants[i]! }))
    .filter(({ width: w }) => !options?.widths || options.widths.includes(w))
  const candidates: { url: string; width: number }[] = steps
    .filter(({ width: w }) => w <= width)
    .map(({ width: w, variant }) => ({ url: resolveImageVariantPath(upload, variant), width: w }))

  if (candidates.length === 0) {
    return null
  }

  const largest = candidates[candidates.length - 1]!.width

  if (largest < width && steps.some(({ width: w }) => w > width)) {
    candidates.push({ url: resolvePublicUploadPath(upload.path), width })
  }

  const src = (candidates.find((c) => c.width >= 768) ?? candidates[candidates.length - 1]!).url

  return {
    src,
    srcset: candidates.map((c) => `${c.url} ${c.width}w`).join(', '),
    width,
    height,
  }
}
