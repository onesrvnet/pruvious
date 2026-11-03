import { describe, expect, test } from 'vitest'
import { $422, $deleteAsAdmin, $getAsAdmin, $postAsAdmin } from '../utils'

describe('mailto: and tel: links', () => {
  const link = '/api/collections/fields?returning=link'
  const linkInternalOnly = '/api/collections/fields?returning=linkInternalOnly'
  const linkNoHash = '/api/collections/fields?returning=linkNoHash'
  const linkNoQuery = '/api/collections/fields?returning=linkNoQuery'
  const linkNoSchemes = '/api/collections/fields?returning=linkNoSchemes'
  const linkMailtoOnly = '/api/collections/fields?returning=linkMailtoOnly'
  const editor = '/api/collections/fields?returning=editor'
  const editorNoSchemes = '/api/collections/fields?returning=editorNoSchemes'
  const richTextLinks = '/api/collections/fields?returning=richTextLinks'

  // linkField
  test('link: accepts mailto: and tel: by default', async () => {
    expect(await $postAsAdmin(link, { link: { url: 'mailto:info@example.com' } })).toEqual([
      { link: { url: 'mailto:info@example.com', target: '', rel: '' } },
    ])
    expect(await $postAsAdmin(link, { link: { url: 'tel:+49-30-123456' } })).toEqual([
      { link: { url: 'tel:+49-30-123456', target: '', rel: '' } },
    ])
  })

  test('link: accepts mailto: with multiple addresses and headers', async () => {
    const url = 'mailto:a@example.com,b@example.com?subject=Hello%20there'
    expect(await $postAsAdmin(link, { link: { url } })).toEqual([{ link: { url, target: '', rel: '' } }])
  })

  test('link: keeps the target as given', async () => {
    expect(await $postAsAdmin(link, { link: { url: 'mailto:info@example.com', target: '_self' } })).toEqual([
      { link: { url: 'mailto:info@example.com', target: '_self', rel: '' } },
    ])
  })

  test('link: populated value passes mailto: through unchanged', async () => {
    const created = (await $postAsAdmin('/api/collections/fields?returning=id', {
      link: { url: 'mailto:abuse@example.com' },
    })) as [{ id: number }]
    expect(await $getAsAdmin(`/api/collections/fields/${created[0].id}?select=link&populate=t`)).toEqual({
      link: { url: 'mailto:abuse@example.com', target: '', rel: '' },
    })
  })

  test('link: rejects malformed mailto: and tel:', async () => {
    expect(await $postAsAdmin(link, { link: { url: 'mailto:' } })).toEqual(
      $422([{ 'link.url': 'This is not a valid `mailto` link' }]),
    )
    expect(await $postAsAdmin(link, { link: { url: 'mailto:not-an-email' } })).toEqual(
      $422([{ 'link.url': 'This is not a valid `mailto` link' }]),
    )
    expect(await $postAsAdmin(link, { link: { url: 'mailto:a@example.com<script>' } })).toEqual(
      $422([{ 'link.url': 'This is not a valid `mailto` link' }]),
    )
    expect(await $postAsAdmin(link, { link: { url: 'tel:call-me' } })).toEqual(
      $422([{ 'link.url': 'This is not a valid `tel` link' }]),
    )
    expect(await $postAsAdmin(link, { link: { url: 'tel:+49 30 123' } })).toEqual(
      $422([{ 'link.url': 'This is not a valid `tel` link' }]),
    )
  })

  test('link: rejects schemes that are not allowed', async () => {
    expect(await $postAsAdmin(link, { link: { url: 'sms:+4930123' } })).toEqual(
      $422([{ 'link.url': 'Only internal and external links are allowed' }]),
    )
    expect(await $postAsAdmin(link, { link: { url: 'javascript:alert(1)' } })).toEqual(
      $422([{ 'link.url': 'Only internal and external links are allowed' }]),
    )
  })

  test('link: allowSchemes is independent of allowExternal, allowHash and allowQuery', async () => {
    expect(await $postAsAdmin(linkInternalOnly, { linkInternalOnly: { url: 'mailto:info@example.com' } })).toEqual([
      { linkInternalOnly: { url: 'mailto:info@example.com', target: '', rel: '' } },
    ])
    expect(await $postAsAdmin(linkNoQuery, { linkNoQuery: { url: 'mailto:info@example.com?subject=Hi' } })).toEqual([
      { linkNoQuery: { url: 'mailto:info@example.com?subject=Hi', target: '', rel: '' } },
    ])
    expect(await $postAsAdmin(linkNoHash, { linkNoHash: { url: 'tel:+4930123' } })).toEqual([
      { linkNoHash: { url: 'tel:+4930123', target: '', rel: '' } },
    ])
  })

  test('link: allowSchemes: [] rejects mailto: and tel:', async () => {
    expect(await $postAsAdmin(linkNoSchemes, { linkNoSchemes: { url: 'mailto:info@example.com' } })).toEqual(
      $422([{ 'linkNoSchemes.url': 'Only internal and external links are allowed' }]),
    )
    expect(await $postAsAdmin(linkNoSchemes, { linkNoSchemes: { url: 'tel:+4930123' } })).toEqual(
      $422([{ 'linkNoSchemes.url': 'Only internal and external links are allowed' }]),
    )
    expect(await $postAsAdmin(linkNoSchemes, { linkNoSchemes: { url: 'https://example.com' } })).toEqual([
      { linkNoSchemes: { url: 'https://example.com', target: '', rel: '' } },
    ])
  })

  test('link: allowSchemes: [mailto] rejects tel:', async () => {
    expect(await $postAsAdmin(linkMailtoOnly, { linkMailtoOnly: { url: 'mailto:info@example.com' } })).toEqual([
      { linkMailtoOnly: { url: 'mailto:info@example.com', target: '', rel: '' } },
    ])
    expect(await $postAsAdmin(linkMailtoOnly, { linkMailtoOnly: { url: 'tel:+4930123' } })).toEqual(
      $422([{ 'linkMailtoOnly.url': 'Only internal and external links are allowed' }]),
    )
  })

  // editorField
  test('editor: accepts mailto: and tel: links', async () => {
    const html = '<p>Mail <a href="mailto:dsa@example.com">dsa@</a> or call <a href="tel:+4930123">us</a></p>'
    expect(await $postAsAdmin(editor, { editor: html })).toEqual([{ editor: html }])
  })

  test('editor: populated value keeps mailto: links', async () => {
    const html = '<p><a href="mailto:tco@example.com">tco@</a></p>'
    const created = (await $postAsAdmin('/api/collections/fields?returning=id', { editor: html })) as [{ id: number }]
    expect(await $getAsAdmin(`/api/collections/fields/${created[0].id}?select=editor&populate=t`)).toEqual({
      editor: html,
    })
  })

  test('editor: rejects malformed mailto:', async () => {
    expect(await $postAsAdmin(editor, { editor: '<p><a href="mailto:nope">x</a></p>' })).toEqual(
      $422([{ editor: 'This is not a valid `mailto` link' }]),
    )
  })

  test('editor: allowSchemes: [] rejects mailto:', async () => {
    expect(
      await $postAsAdmin(editorNoSchemes, { editorNoSchemes: '<p><a href="mailto:info@example.com">x</a></p>' }),
    ).toEqual($422([{ editorNoSchemes: 'Only internal and external links are allowed' }]))
  })

  // richTextField
  test('richText: accepts mailto: and tel: links', async () => {
    const html = '<a href="mailto:info@example.com">info@</a> <a href="tel:+4930123">call</a>'
    expect(await $postAsAdmin(richTextLinks, { richTextLinks: html })).toEqual([{ richTextLinks: html }])
  })

  test('richText: rejects malformed tel:', async () => {
    expect(await $postAsAdmin(richTextLinks, { richTextLinks: '<a href="tel:abc">x</a>' })).toEqual(
      $422([{ richTextLinks: 'This is not a valid `tel` link' }]),
    )
  })

  // copyTranslation
  test('copyTranslation: leaves mailto: and tel: links untouched', async () => {
    const editorHtml = '<p><a href="mailto:abuse@example.com">abuse@</a> <a href="tel:+4930123">call</a></p>'
    const created = (await $postAsAdmin('/api/collections/link-translations?returning=id', {
      language: 'en',
      link: { url: 'mailto:info@example.com', target: '', rel: '' },
      editor: editorHtml,
    })) as [{ id: number }]
    const id = created[0].id

    const copy = (await $getAsAdmin(
      `/api/collections/link-translations/${id}/copy-translation?targetLanguage=de&operation=create`,
    )) as any
    expect(copy.link).toEqual({ url: 'mailto:info@example.com', target: '', rel: '' })
    expect(copy.editor).toBe(editorHtml)
    expect(copy.language).toBe('de')

    await $deleteAsAdmin(`/api/collections/link-translations/${id}`)
  })
})
