<template></template>

<script lang="ts" setup>
import { dashboardBasePath, dashboardMiddleware } from '#pruvious/dashboard/route'

definePageMeta({
  path: dashboardBasePath + '_redirect',
  middleware: [(to) => dashboardMiddleware(to, 'default')],
})

const route = useRoute()

onBeforeMount(() => navigateTo(route.query.to ? String(route.query.to) : dashboardBasePath, { replace: true }))
</script>
