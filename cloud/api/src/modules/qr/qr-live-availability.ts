/** Shared by the guest menu and admin diagnosis, so a status card explains the same live restriction. */
export function qrLiveRestriction(
  item: Record<string, any>,
  override: Record<string, any> | undefined,
  hiddenCategories: Set<string>,
  branchId: string | null
): string | null {
  const stock = override?.stockQuantity ?? item.stockQuantity;
  if (typeof stock === 'number' && stock <= 0) return 'Out of stock';
  if (override?.isAvailable === false) return 'Switched off for this branch';
  if (item.deleted === true) return 'Removed from the menu';
  if (item.archivedAt) return 'Archived';
  if (item.isAvailable === false) return 'Marked unavailable for the whole restaurant';
  if (item.isQrOrderingEnabled === false || item.isDigitalMenuVisible === false) return 'Hidden from QR ordering';
  if (hiddenCategories.has(item.categoryId)) return 'Its category is hidden or inactive';
  if (Array.isArray(item.salesChannels) && !item.salesChannels.includes('QR')) return 'Not sold through QR ordering';
  if (Array.isArray(item.branchIds) && item.branchIds.length && !item.branchIds.includes(branchId)) return 'Not sold in this branch';
  return null;
}
