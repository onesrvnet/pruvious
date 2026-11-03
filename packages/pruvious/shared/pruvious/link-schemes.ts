/**
 * Shared helpers for non-HTTP link schemes (e.g. `mailto:` and `tel:`).
 *
 * Used by the dashboard link pickers (to accept typed scheme links) and the server validator
 * (to check them), so the two always agree on what is allowed.
 *
 * This file must stay free of runtime imports so it can be bundled on both sides.
 */

/**
 * Link schemes that link fields and editor links accept by default (besides `rel://` and `http(s)://`).
 */
export const DEFAULT_LINK_SCHEMES: readonly string[] = ['mailto', 'tel']

/**
 * Schemes that are never accepted, even when listed in `allowSchemes`.
 * `http`, `https` and `rel` have their own validation paths.
 */
const BLOCKED_SCHEMES = ['javascript', 'data', 'vbscript', 'file', 'blob', 'http', 'https', 'rel']

const SCHEME_REGEX = /^([a-z][a-z0-9+.-]*):/i
const INVALID_CHARS = /[\s<>"'`\\\x00-\x1f\x7f]/
const EMAIL_REGEX = /^[^\s@,;?<>"']+@[^\s@,;?<>"']+\.[^\s@,;?<>"']+$/
const TEL_REGEX = /^\+?[0-9().-]+(;[a-z0-9-]+(=[a-z0-9.+-]*)?)*$/i

/**
 * Returns the lowercase scheme of `value` (e.g. `'mailto'`), or `null` if it has none.
 */
export function getLinkScheme(value: string): string | null {
  const match = SCHEME_REGEX.exec(value)
  return match ? match[1]!.toLowerCase() : null
}

/**
 * Normalizes an `allowSchemes` option into a lowercase list without blocked schemes.
 * `undefined` resolves to `DEFAULT_LINK_SCHEMES`.
 */
export function resolveLinkSchemes(allowSchemes: readonly string[] | undefined): string[] {
  return (allowSchemes ?? DEFAULT_LINK_SCHEMES)
    .map((scheme) => scheme.toLowerCase().replace(/:$/, ''))
    .filter((scheme) => !BLOCKED_SCHEMES.includes(scheme))
}

/**
 * Checks whether `value` is a well-formed link using one of the `schemes`.
 *
 * - `mailto:` needs at least one email address (comma-separated), optionally followed by `?headers`.
 * - `tel:` needs a phone number made of digits, an optional leading `+`, and `-`, `.`, `(`, `)`.
 * - Other schemes need a non-empty body without whitespace or HTML-unsafe characters.
 */
export function isValidSchemeLink(value: string, schemes: readonly string[]): boolean {
  const scheme = getLinkScheme(value)

  if (!scheme || !schemes.includes(scheme)) {
    return false
  }

  const body = value.slice(scheme.length + 1)

  if (!body || INVALID_CHARS.test(body)) {
    return false
  }

  if (scheme === 'mailto') {
    const addresses = body.split('?')[0]!
    return addresses.split(',').every((address) => EMAIL_REGEX.test(decodeSafe(address)))
  }

  if (scheme === 'tel') {
    return TEL_REGEX.test(body)
  }

  return true
}

/**
 * Turns text typed into a dashboard link picker into a scheme link, if possible.
 *
 * - Explicit scheme links (`mailto:a@b.c`, `tel:+49 30 123`) are returned with whitespace removed from `tel:` numbers.
 * - A bare email address (`a@b.c`) becomes `mailto:a@b.c` when `mailto` is allowed.
 *
 * Returns `null` when the text is not a valid link for the allowed `schemes`.
 */
export function toSchemeLink(text: string, schemes: readonly string[]): string | null {
  let value = text.trim()

  if (!value) {
    return null
  }

  const scheme = getLinkScheme(value)

  if (scheme === 'tel') {
    value = 'tel:' + value.slice(4).replace(/\s+/g, '')
  } else if (!scheme && schemes.includes('mailto') && EMAIL_REGEX.test(value)) {
    value = `mailto:${value}`
  } else if (scheme && value.slice(0, scheme.length) !== scheme) {
    value = scheme + value.slice(scheme.length)
  }

  return isValidSchemeLink(value, schemes) ? value : null
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
