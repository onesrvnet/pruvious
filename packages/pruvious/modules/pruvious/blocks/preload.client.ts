import { blockComponents } from '#pruvious/app/blocks'

/**
 * Loads the components of all blocks found in the provided route `data`.
 *
 * Called before client-side navigation updates the route state.
 * A page that stays mounted between two routes then swaps to the new blocks in one render, instead of
 * removing the old blocks and showing the new ones one by one as their components load.
 *
 * Errors are ignored, so a failed import never blocks the navigation.
 */
export async function preloadBlockComponents(data: unknown): Promise<void> {
  const names = new Set<string>()
  collectBlockNames(data, names, new WeakSet())

  await Promise.all(
    [...names].map((name) => {
      const component = (blockComponents as Record<string, () => any>)[name]?.()
      return component?.__asyncLoader?.().catch(() => {})
    }),
  )
}

function collectBlockNames(value: unknown, names: Set<string>, seen: WeakSet<object>) {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return
  }

  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) {
      collectBlockNames(item, names, seen)
    }
    return
  }

  const key = (value as Record<string, unknown>).$key
  if (typeof key === 'string' && key in blockComponents) {
    names.add(key)
  }

  for (const item of Object.values(value)) {
    collectBlockNames(item, names, seen)
  }
}
