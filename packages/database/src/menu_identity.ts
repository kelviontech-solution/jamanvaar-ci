/** Unicode letters/marks survive normalization: Gujarati and Hindi dishes must not collapse to an empty identity. */
export const normalizeMenuText = (value: string) => (value || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
export const safeMenuImage = (value: string) => !value || /^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value) || /^data:image\/(png|jpeg|webp);base64,/i.test(value);
export function menuItemBranchIntersection(items: Array<{ branchIds?: string[] }>): string[] | undefined {
  const restricted = items.filter(item => item.branchIds?.length);
  if (!restricted.length) return undefined;
  return restricted[0].branchIds!.filter(id => restricted.every(item => item.branchIds!.includes(id)));
}
