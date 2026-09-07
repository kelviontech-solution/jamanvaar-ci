import React, { useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { RestaurantListItem } from '../../api/types';
import { Button } from '../../components/ui';
import { X, Building, MapPin, FileText } from 'lucide-react';

interface EditRestaurantModalProps {
  restaurant: {
    id: string;
    name: string;
    legalName?: string | null;
    city?: string | null;
    state?: string | null;
    address?: string | null;
    gstin?: string | null;
    fssaiNumber?: string | null;
  };
  onClose: () => void;
  onUpdated?: () => void;
  onSaved?: () => void;
}

export function EditRestaurantModal({ restaurant, onClose, onUpdated, onSaved }: EditRestaurantModalProps) {
  const [name, setName] = useState(restaurant.name);
  const [legalName, setLegalName] = useState(restaurant.legalName || '');
  const [city, setCity] = useState(restaurant.city || '');
  const [state, setState] = useState(restaurant.state || '');
  const [address, setAddress] = useState(restaurant.address || '');
  const [gstin, setGstin] = useState(restaurant.gstin || '');
  const [fssaiNumber, setFssaiNumber] = useState(restaurant.fssaiNumber || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Restaurant name is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/api/v1/restaurants/${restaurant.id}`, {
        name: name.trim(),
        legalName: legalName.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        address: address.trim() || undefined,
        gstin: gstin.trim() || undefined,
        fssaiNumber: fssaiNumber.trim() || undefined
      });
      if (onUpdated) onUpdated();
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update restaurant');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0B253A' }}>Edit Restaurant Profile</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>
              Update commercial identity and address for {restaurant.name}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="form-error">{error}</div>}

          <div className="form-section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building className="w-3.5 h-3.5" />
            <span>Commercial Profile</span>
          </div>

          <div className="form-grid">
            <div>
              <label className="label">Brand / Display Name *</label>
              <input
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Royal Darbar"
                required
              />
            </div>
            <div>
              <label className="label">Legal Entity Name</label>
              <input
                type="text"
                className="input"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. Royal Foods LLP"
              />
            </div>
          </div>

          <div className="form-section-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <MapPin className="w-3.5 h-3.5" />
            <span>Location & Address</span>
          </div>

          <div>
            <label className="label">Address</label>
            <input
              type="text"
              className="input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, Landmark, Area"
            />
          </div>

          <div className="form-grid">
            <div>
              <label className="label">City</label>
              <input
                type="text"
                className="input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Ahmedabad"
              />
            </div>
            <div>
              <label className="label">State</label>
              <input
                type="text"
                className="input"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="e.g. Gujarat"
              />
            </div>
          </div>

          <div className="form-section-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <FileText className="w-3.5 h-3.5" />
            <span>Compliance & Tax Numbers</span>
          </div>

          <div className="form-grid">
            <div>
              <label className="label">GSTIN (15 characters)</label>
              <input
                type="text"
                className="input"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="24AAAAA0000A1Z5"
                maxLength={15}
              />
            </div>
            <div>
              <label className="label">FSSAI Number (14 digits)</label>
              <input
                type="text"
                className="input"
                value={fssaiNumber}
                onChange={(e) => setFssaiNumber(e.target.value)}
                placeholder="14-digit FSSAI"
                maxLength={14}
              />
            </div>
          </div>

          <div className="modal-actions" style={{ marginTop: 12 }}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving Changes…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
