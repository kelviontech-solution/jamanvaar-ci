import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal, Button, Input } from '../../components/ui';
import { APP_CODES, type FeatureRecord, type FeatureCategoryRecord } from '../../api/types';

export function FeatureFormModal({
  feature,
  categories,
  allFeatures,
  onClose,
  onSaved
}: {
  feature?: FeatureRecord;
  categories: FeatureCategoryRecord[];
  allFeatures: FeatureRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(feature?.code ?? '');
  const [name, setName] = useState(feature?.name ?? '');
  const [description, setDescription] = useState(feature?.description ?? '');
  const [categoryId, setCategoryId] = useState(feature?.categoryId ?? categories[0]?.id ?? '');
  const [appCode, setAppCode] = useState<string>(feature?.appCode ?? '');
  const [dependsOn, setDependsOn] = useState<string[]>(feature?.dependsOnFeatureIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleDependency(id: string) {
    setDependsOn((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = { name, description, categoryId, appCode: appCode || null, dependsOnFeatureIds: dependsOn };
      if (feature) {
        await api.patch(`/api/v1/features/${feature.id}`, payload);
      } else {
        await api.post('/api/v1/features', { ...payload, code });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save feature');
    } finally {
      setSubmitting(false);
    }
  }

  const dependencyCandidates = allFeatures.filter((f) => f.id !== feature?.id);

  return (
    <Modal
      title={feature ? `Edit Feature: ${feature.name}` : 'New Feature'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : feature ? 'Save Changes' : 'Create Feature'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
        <div className="field">
          <label>Code {feature && <span className="form-note">(immutable once created)</span>}</label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!feature} required placeholder="e.g. advancedTableAnalytics" />
        </div>
        <div className="field">
          <label>Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div className="field">
          <label>Category</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>App Code (optional — links this feature to a physical application)</label>
          <select value={appCode} onChange={(e) => setAppCode(e.target.value)}>
            <option value="">— None —</option>
            {APP_CODES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Depends On (features that must be enabled for this one to work)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--jv-border)', borderRadius: 8, padding: 8 }}>
            {dependencyCandidates.map((f) => (
              <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={dependsOn.includes(f.id)} onChange={() => toggleDependency(f.id)} />
                {f.name}
              </label>
            ))}
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Modal>
  );
}
