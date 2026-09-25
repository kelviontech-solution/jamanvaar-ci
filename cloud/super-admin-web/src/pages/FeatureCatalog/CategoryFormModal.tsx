import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal, Button, Input } from '../../components/ui';
import type { FeatureCategoryRecord } from '../../api/types';

export function CategoryFormModal({
  category,
  onClose,
  onSaved
}: {
  category?: FeatureCategoryRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(category?.code ?? '');
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (category) {
        await api.patch(`/api/v1/feature-categories/${category.id}`, { name, description, sortOrder: Number(sortOrder) });
      } else {
        await api.post('/api/v1/feature-categories', { code, name, description, sortOrder: Number(sortOrder) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save category');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={category ? `Edit Category: ${category.name}` : 'New Feature Category'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : category ? 'Save Changes' : 'Create Category'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field">
          <label>Code {category && <span className="form-note">(immutable once created)</span>}</label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!category} required placeholder="e.g. pos_billing" />
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
          <label>Sort Order</label>
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} required />
        </div>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Modal>
  );
}
