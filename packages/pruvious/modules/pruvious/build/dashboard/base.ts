import { useNuxt } from 'nuxt/kit'

/**
 * Generates the `#pruvious/dashboard/base.ts` file content.
 */
export function getDashboardBaseFileContent() {
  const nuxt = useNuxt()
  const pruviousOptions = nuxt.options.runtimeConfig.pruvious

  return [
    `/**`,
    ` * The base path for the dashboard.`,
    ` * This setting comes from the Nuxt config \`pruvious.dashboard.basePath\` and is formatted to always start and end with a forward slash.`,
    ` */`,
    `export const dashboardBasePath = '${pruviousOptions.dashboard.basePath}'`,
    ``,
    `/**`,
    ` * Controls which stylesheets are retained in the dashboard by filtering based on selector content.`,
    ` * Any stylesheet without rules containing these strings will be automatically disabled.`,
    ` */`,
    `export const filterStylesheets = ${JSON.stringify(pruviousOptions.dashboard.filterStylesheets)}`,
    ``,
  ].join('\n')
}

/**
 * Generates the `#pruvious/dashboard/route.ts` file content.
 *
 * Dashboard pages use `dashboardBasePath` and `dashboardMiddleware` in `definePageMeta`.
 * Nuxt copies page meta into the route table of the app entry, so these imports must not pull in the
 * `#pruvious/dashboard` index. Otherwise the whole dashboard is preloaded on every public page.
 */
export function getDashboardRouteFileContent(middlewareFile: string) {
  return [
    `export { dashboardBasePath } from './base'`,
    `export { type DashboardMiddleware, type DashboardMiddlewareContext, dashboardMiddleware } from '${middlewareFile}'`,
    ``,
  ].join('\n')
}
