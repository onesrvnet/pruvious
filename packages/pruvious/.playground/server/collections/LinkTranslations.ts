import { copyTranslationDefault, defineCollection, editorField, linkField } from '#pruvious/server'

export default defineCollection({
  translatable: true,
  fields: {
    link: linkField({}),
    editor: editorField({ links: true }),
  },
  copyTranslation: copyTranslationDefault,
  ui: { hidden: true },
})
