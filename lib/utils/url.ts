interface UrlComponents {
  protocol?: string
  hostname: string
  pathname?: string
  search?: string
  hash?: string
  port?: string | number
}

export function urlunparse(components: UrlComponents): string {
  const { protocol = "https", hostname, pathname = "", search = "", hash = "", port } = components

  let url = `${protocol}://${hostname}`

  if (port) {
    url += `:${port}`
  }

  url += pathname

  if (search) {
    url += `?${search}`
  }

  if (hash) {
    url += `#${hash}`
  }

  return url
}
