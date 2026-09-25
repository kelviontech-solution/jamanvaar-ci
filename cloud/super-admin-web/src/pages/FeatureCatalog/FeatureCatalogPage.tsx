import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '../../api/client';
import type { FeatureCategoryRecord, FeatureRecord } from '../../api/types';
import { Card, Button, PageHeader, EmptyState, SkeletonTable, ConfirmModal, Badge } from '../../components/ui';
import { CategoryFormModal } from './CategoryFormModal';
import { FeatureFormModal } from './FeatureFormModal';
import '../../components/shared.css';

export function FeatureCatalogPage() {
  const [categories, setCategories] = useState<FeatureCategoryRecord[] | null>(null);
  const [features, setFeatures] = useState<FeatureRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryModal, setCategoryModal] = useState<{ category?: FeatureCategoryRecord } | null>(null);
  const [featureModal, setFeatureModal] = useState<{ feature?: FeatureRecord } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeatureRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<FeatureCategoryRecord[]>('/api/v1/feature-categories'),
      api.get<FeatureRecord[]>('/api/v1/features')
    ])
      .then(([cats, feats]) => {
        setCategories([...cats].sort((a, b) => a.sortOrder - b.sortOrder));
        setFeatures(feats);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load feature catalog'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(feature: FeatureRecord) {
    try {
      await api.patch(`/api/v1/features/${feature.id}`, { isActive: !feature.isActive });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update feature');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/features/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteTarget(null);
      setError(err instanceof ApiError ? err.message : 'Failed to delete feature');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Feature Catalog"
        subtitle="The database-backed catalog of every feature and category the platform recognises. Edits apply immediately across Plans, Entitlements and Application controls, with no deploy."
        actions={
          <>
            <Button variant="ghost" onClick={() => setCategoryModal({})}>+ New Category</Button>
            <Button variant="primary" onClick={() => setFeatureModal({})} disabled={!categories || categories.length === 0}>+ New Feature</Button>
          </>
        }
      />

      {error && <div className="page-error">{error}</div>}
      {loading && !features && <SkeletonTable rows={8} cols={5} />}

      {categories && features &&
        (categories.length === 0 ? (
          <EmptyState title="No categories yet" description="Create a category before adding features." />
        ) : (
          categories.map((cat) => {
            const catFeatures = features.filter((f) => f.categoryId === cat.id);
            return (
              <Card key={cat.id} style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderBottom: '1px solid var(--jv-border)' }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 14, color: '#0B253A' }}>{cat.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{cat.description}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setCategoryModal({ category: cat })}>Edit Category</Button>
                </div>
                {catFeatures.length === 0 ? (
                  <div style={{ padding: 20 }}><span className="muted">No features in this category yet.</span></div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {catFeatures.map((f) => (
                        <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 20px' }}>
                            <div style={{ fontWeight: 700, color: '#1e293b' }}>{f.name}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{f.description}</div>
                          </td>
                          <td style={{ padding: '10px 20px' }}>{f.appCode && <Badge tone="accent">{f.appCode}</Badge>}</td>
                          <td style={{ padding: '10px 20px' }}>
                            <Badge tone={f.isActive ? 'success' : 'neutral'}>{f.isActive ? 'Active' : 'Inactive'}</Badge>
                          </td>
                          <td style={{ padding: '10px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <Button variant="ghost" size="sm" onClick={() => setFeatureModal({ feature: f })}>Edit</Button>
                            <Button variant="ghost" size="sm" onClick={() => toggleActive(f)}>{f.isActive ? 'Deactivate' : 'Activate'}</Button>
                            <Button variant="danger" size="sm" onClick={() => setDeleteTarget(f)}>Delete</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            );
          })
        ))}

      {categoryModal && (
        <CategoryFormModal
          category={categoryModal.category}
          onClose={() => setCategoryModal(null)}
          onSaved={() => {
            setCategoryModal(null);
            load();
          }}
        />
      )}
      {featureModal && categories && features && (
        <FeatureFormModal
          feature={featureModal.feature}
          categories={categories}
          allFeatures={features}
          onClose={() => setFeatureModal(null)}
          onSaved={() => {
            setFeatureModal(null);
            load();
          }}
        />
      )}
      <ConfirmModal
        title="Delete Feature"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? This cannot be undone. Deletion is refused while the feature is active or while another feature still depends on it.`
            : ''
        }
        confirmLabel="Delete"
        tone="danger"
        isOpen={!!deleteTarget}
        isPending={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
