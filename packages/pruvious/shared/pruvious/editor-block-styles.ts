/**
 * Shared helpers for `editorField` block styles and text alignment.
 *
 * Used by both the dashboard editor (to parse and serialize classes) and the server validator
 * (to whitelist classes on block tags), so the two always agree on what is allowed.
 *
 * This file must stay free of runtime imports so it can be bundled on both sides.
 */

import type { EditorAlignment, EditorBlockKey, EditorBlockStyle } from '../../server/fields/editor'

/**
 * Block keys that can carry block style classes.
 */
export const STYLEABLE_BLOCK_KEYS: readonly EditorBlockKey[] = [
  'paragraph',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
] as const

/**
 * Block keys that can be aligned.
 */
export const ALIGNABLE_BLOCK_KEYS: readonly EditorBlockKey[] = [
  'paragraph',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
] as const

export const EDITOR_ALIGNMENTS: readonly EditorAlignment[] = ['left', 'center', 'right', 'justify'] as const

export const DEFAULT_ALIGNMENT_CLASSES: Record<EditorAlignment, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
}

/**
 * Maps an HTML block tag to its editor block key.
 * Only tags that can carry a `class` attribute are listed.
 */
export const STYLEABLE_TAG_TO_BLOCK_KEY: Record<string, EditorBlockKey> = {
  p: 'paragraph',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  ul: 'bulletList',
  ol: 'orderedList',
  blockquote: 'blockquote',
  pre: 'codeBlock',
}

/**
 * Splits a class value into unique, non-empty class names.
 */
export function splitClasses(value: string | string[] | undefined | null): string[] {
  if (!value) {
    return []
  }

  const parts = Array.isArray(value) ? value.flatMap((v) => v.split(/\s+/)) : value.split(/\s+/)
  return [...new Set(parts.filter(Boolean))]
}

/**
 * Returns the block keys a style can be applied to.
 */
export function resolveStyleBlocks(style: Pick<EditorBlockStyle, 'blocks'>): EditorBlockKey[] {
  return style.blocks && style.blocks.length > 0
    ? style.blocks.filter((key) => STYLEABLE_BLOCK_KEYS.includes(key))
    : [...STYLEABLE_BLOCK_KEYS]
}

/**
 * Returns the enabled alignments for the `alignment` option.
 */
export function resolveAlignments(alignment: boolean | EditorAlignment[] | undefined): EditorAlignment[] {
  if (alignment === true) {
    return [...EDITOR_ALIGNMENTS]
  }

  if (Array.isArray(alignment)) {
    return EDITOR_ALIGNMENTS.filter((a) => alignment.includes(a))
  }

  return []
}

/**
 * Returns the class used for each enabled alignment.
 */
export function resolveAlignmentClasses(
  alignment: boolean | EditorAlignment[] | undefined,
  alignmentClasses: Partial<Record<EditorAlignment, string>> | undefined,
): Partial<Record<EditorAlignment, string>> {
  const result: Partial<Record<EditorAlignment, string>> = {}

  for (const a of resolveAlignments(alignment)) {
    const cls = splitClasses(alignmentClasses?.[a] ?? DEFAULT_ALIGNMENT_CLASSES[a])

    if (cls.length > 0) {
      result[a] = cls.join(' ')
    }
  }

  return result
}

/**
 * Builds the set of class names allowed on each styleable block key.
 */
export function buildAllowedBlockClasses(options: {
  blockStyles?: Record<string, Pick<EditorBlockStyle, 'class' | 'blocks'>>
  alignment?: boolean | EditorAlignment[]
  alignmentClasses?: Partial<Record<EditorAlignment, string>>
}): Map<EditorBlockKey, Set<string>> {
  const map = new Map<EditorBlockKey, Set<string>>()
  const add = (key: EditorBlockKey, classes: string[]) => {
    if (classes.length === 0) return
    const set = map.get(key) ?? new Set<string>()
    for (const c of classes) set.add(c)
    map.set(key, set)
  }

  for (const style of Object.values(options.blockStyles ?? {})) {
    const classes = splitClasses(style.class)

    for (const key of resolveStyleBlocks(style)) {
      add(key, classes)
    }
  }

  const alignClasses = Object.values(resolveAlignmentClasses(options.alignment, options.alignmentClasses)).flatMap(
    (c) => splitClasses(c),
  )

  for (const key of ALIGNABLE_BLOCK_KEYS) {
    add(key, alignClasses)
  }

  return map
}

/**
 * Builds the `class` attribute value for a block from its active styles and alignment.
 * Returns `null` when there are no classes.
 */
export function buildBlockClass(
  styleKeys: string[],
  align: EditorAlignment | null,
  blockStyles: Record<string, Pick<EditorBlockStyle, 'class'>>,
  alignmentClasses: Partial<Record<EditorAlignment, string>>,
): string | null {
  const classes: string[] = []

  for (const key of styleKeys) {
    const style = blockStyles[key]
    if (style) classes.push(...splitClasses(style.class))
  }

  if (align && alignmentClasses[align]) {
    classes.push(...splitClasses(alignmentClasses[align]))
  }

  const unique = [...new Set(classes)]
  return unique.length > 0 ? unique.join(' ') : null
}

/**
 * Reads the active styles and alignment from a block element's class names.
 * A style is active only when all of its classes are present. Unknown classes are dropped.
 */
export function parseBlockClass(
  classNames: string[],
  blockKey: EditorBlockKey,
  blockStyles: Record<string, Pick<EditorBlockStyle, 'class' | 'blocks'>>,
  alignmentClasses: Partial<Record<EditorAlignment, string>>,
): { styles: string[]; align: EditorAlignment | null } {
  const present = new Set(classNames)
  const styles: string[] = []
  let align: EditorAlignment | null = null

  for (const [key, style] of Object.entries(blockStyles)) {
    const classes = splitClasses(style.class)

    if (classes.length > 0 && resolveStyleBlocks(style).includes(blockKey) && classes.every((c) => present.has(c))) {
      styles.push(key)
    }
  }

  if (ALIGNABLE_BLOCK_KEYS.includes(blockKey)) {
    for (const [a, cls] of Object.entries(alignmentClasses) as [EditorAlignment, string][]) {
      const classes = splitClasses(cls)

      if (classes.length > 0 && classes.every((c) => present.has(c))) {
        align = a
        break
      }
    }
  }

  return { styles, align }
}
