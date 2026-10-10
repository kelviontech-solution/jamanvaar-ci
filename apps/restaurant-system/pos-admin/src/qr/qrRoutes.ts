export function safeQrDestination(value: string | null) {
  return value && /^\/qr\/admin\/(?:\?[a-zA-Z0-9_=&%-]*)?$/.test(value)
    ? value
    : "/qr/admin/";
}
