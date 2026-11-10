import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { $deleteAsAdmin, $getAsAdmin, $postAsAdmin, $postFormData } from '../utils'

/**
 * Single relation fields (`image`, `file`, `record`, `linkedBlocks`) load their records in batches when many
 * values are populated at once. Populating many rows together must give exactly the same result as populating
 * each row on its own.
 */
describe('populate batching', () => {
  const fields = 'image,imageCasted,file,fileCasted,record,recordPopulate,linkedBlocks'
  const uploadIds: number[] = []
  const patternIds: number[] = []
  const rowIds: number[] = []

  test('setup: uploads, patterns and rows', async () => {
    for (const name of ['test.png', 'test.svg', 'test.txt']) {
      const file = new File([fs.readFileSync(`packages/pruvious/.playground/test/files/${name}`)], `batch-${name}`)
      const result: any = await $postFormData('/api/uploads', { '': file })
      expect(result).toEqual([{ success: true, data: expect.any(Object), details: expect.any(Object) }])
      uploadIds.push(result[0].details.id)
    }

    for (const label of ['First', 'Second']) {
      const result = (await $postAsAdmin('/api/collections/patterns?returning=id', {
        language: 'en',
        subpath: null,
        title: `Batch pattern ${label}`,
        blocks: [
          { $key: 'Button', label },
          { $key: 'Nesting', slot: [{ $key: 'Button', label: `${label} inner` }] },
        ],
      })) as [{ id: number }]
      patternIds.push(result[0].id)
    }

    const [png, svg, txt] = uploadIds as [number, number, number]
    const [first, second] = patternIds as [number, number]

    // Mixed values: repeated ids, nulls, and different ids per field
    const rows = [
      { image: png, imageCasted: svg, file: txt, fileCasted: png, record: 1, recordPopulate: 3, linkedBlocks: first },
      { image: png, imageCasted: png, file: txt, fileCasted: txt, record: 1, recordPopulate: 3, linkedBlocks: first },
      {
        image: svg,
        imageCasted: null,
        file: png,
        fileCasted: null,
        record: 2,
        recordPopulate: 1,
        linkedBlocks: second,
      },
      {
        image: null,
        imageCasted: svg,
        file: null,
        fileCasted: svg,
        record: null,
        recordPopulate: null,
        linkedBlocks: null,
      },
      { image: svg, imageCasted: png, file: png, fileCasted: png, record: 3, recordPopulate: 2, linkedBlocks: second },
      { image: png, imageCasted: svg, file: svg, fileCasted: txt, record: 2, recordPopulate: 3, linkedBlocks: first },
    ]

    for (const row of rows) {
      const result = (await $postAsAdmin('/api/collections/relation-fields?returning=id', row)) as [{ id: number }]
      expect(result).toEqual([{ id: expect.any(Number) }])
      rowIds.push(result[0].id)
    }
  })

  test('populating many rows matches populating each row on its own', async () => {
    const single: Record<string, any>[] = []

    for (const id of rowIds) {
      single.push(await $getAsAdmin(`/api/collections/relation-fields/${id}?select=id,${fields}&populate=1`))
    }

    const many: any = await $getAsAdmin(
      `/api/collections/relation-fields?select=id,${fields}&where=id[in][${rowIds.join(',')}]&orderBy=id&perPage=100&populate=1`,
    )

    expect(many.records).toEqual(single)
  })

  test('populated values have the expected shape', async () => {
    const [png, svg] = uploadIds as [number, number]
    const [first] = patternIds as [number]
    const row: any = await $getAsAdmin(`/api/collections/relation-fields/${rowIds[0]}?select=${fields}&populate=1`)

    expect(row.image).toEqual(expect.objectContaining({ id: png, path: expect.any(String) }))
    expect(row.imageCasted).toEqual(expect.objectContaining({ id: svg, path: expect.any(String) }))
    expect(row.record).toEqual({ id: 1 })
    expect(row.recordPopulate).toEqual({
      id: 3,
      email: 'author@pruvious.com',
      roles: [{ id: 1, name: 'Author', permissions: expect.arrayContaining(['access-dashboard']) }],
    })
    expect(row.linkedBlocks).toEqual([
      { $key: 'Button', label: 'First' },
      expect.objectContaining({
        $key: 'Nesting',
        slot: [expect.objectContaining({ $key: 'Button', label: 'First inner' })],
      }),
    ])

    const empty: any = await $getAsAdmin(`/api/collections/relation-fields/${rowIds[3]}?select=${fields}&populate=1`)
    expect(empty).toEqual({
      image: null,
      imageCasted: expect.objectContaining({ id: svg }),
      file: null,
      fileCasted: expect.objectContaining({ id: svg }),
      record: null,
      recordPopulate: null,
      linkedBlocks: null,
    })

    expect(first).toEqual(expect.any(Number))
  })

  test('rows sharing a record get equal values', async () => {
    const many: any = await $getAsAdmin(
      `/api/collections/relation-fields?select=id,image,recordPopulate&where=id[in][${rowIds.join(',')}]&orderBy=id&perPage=100&populate=1`,
    )
    const [a, b] = many.records
    expect(a.image).toEqual(b.image)
    expect(a.recordPopulate).toEqual(b.recordPopulate)
  })

  test('cleanup', async () => {
    expect(await $deleteAsAdmin(`/api/collections/relation-fields?where=id[in][${rowIds.join(',')}]`)).toEqual(
      rowIds.length,
    )

    for (const id of patternIds) {
      expect(await $deleteAsAdmin(`/api/collections/patterns/${id}`)).toEqual(1)
    }

    for (const id of uploadIds) {
      expect(await $deleteAsAdmin(`/api/uploads/${id}`)).toEqual([expect.objectContaining({ success: true })])
    }
  })
})
