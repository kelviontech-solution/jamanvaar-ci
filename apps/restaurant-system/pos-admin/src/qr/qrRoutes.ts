export function safeQrDestination(value: string | null) {
  return value && /^\/qr\/admin\/(?:\?[a-zA-Z0-9_=&%-]*)?$/.test(value) ? value : '/qr/admin/';
}

/** Resolve a linked branch only against the authenticated account's active branch list. */
export function qrWorkspaceBranch(
  role: string,
  assigned: string | null | undefined,
  current: string | null,
  branches: readonly { id: string; status: string }[],
  requested: string | null
) {
  const accessible = branches.filter((branch) => branch.status === 'ACTIVE' && (role === 'OWNER' || branch.id === assigned));
  if (requested && !accessible.some((branch) => branch.id === requested))
    throw new Error('The linked branch is unavailable to this account. Sign in to the correct restaurant or choose an accessible branch.');
  const branch = requested ?? (role === 'OWNER' ? (current ?? (accessible.length === 1 ? accessible[0].id : 'all')) : assigned);
  if (!branch || (branch !== 'all' && !accessible.some((row) => row.id === branch)) || (branch === 'all' && role !== 'OWNER'))
    throw new Error('The saved branch is unavailable. Choose an active branch for this account.');
  return branch;
}
