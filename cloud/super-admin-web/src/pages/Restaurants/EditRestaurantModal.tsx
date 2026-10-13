import React, { useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { RestaurantListItem } from '../../api/types';
import { Button, ModalShell } from '../../components/ui';
import { X, Building, MapPin, FileText, Palette } from 'lucide-react';

interface RestaurantBranding {
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  displayName?: string | null;
}

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
    brandingProfile?: RestaurantBranding | null;
  };
  onClose: () => void;
  onUpdated?: () => void;
  onSaved?: () => void;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function EditRestaurantModal({ restaurant, onClose, onUpdated, onSaved }: EditRestaurantModalProps) {
  const [name, setName] = useState(restaurant.name);
  const [legalName, setLegalName] = useState(restaurant.legalName || '');
  const [city, setCity] = useState(restaurant.city || '');
  const [state, setState] = useState(restaurant.state || '');
  const [address, setAddress] = useState(restaurant.address || '');
  const [gstin, setGstin] = useState(restaurant.gstin || '');
  const [fssaiNumber, setFssaiNumber] = useState(restaurant.fssaiNumber || '');
  const branding = restaurant.brandingProfile || {};
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl || '');
  const [primaryColor, setPrimaryColor] = useState(branding.primaryColor || '');
  const [accentColor, setAccentColor] = useState(branding.accentColor || '');
  const [whiteLabelName, setWhiteLabelName] = useState(branding.displayName || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Restaurant name is required');
      return;
    }
    if (primaryColor.trim() && !HEX_COLOR.test(primaryColor.trim())) {
      setError('Primary color must be a 6-digit hex code, e.g. #0B253A');
      return;
    }
    if (accentColor.trim() && !HEX_COLOR.test(accentColor.trim())) {
      setError('Accent color must be a 6-digit hex code, e.g. #E66817');
      return;
    }
    const hasBrandingChange = logoUrl.trim() || primaryColor.trim() || accentColor.trim() || whiteLabelName.trim();
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
        fssaiNumber: fssaiNumber.trim() || undefined,
        ...(hasBrandingChange
          ? {
              branding: {
                ...(logoUrl.trim() ? { logoUrl: logoUrl.trim() } : {}),
                ...(primaryColor.trim() ? { primaryColor: primaryColor.trim() } : {}),
                ...(accentColor.trim() ? { accentColor: accentColor.trim() } : {}),
                ...(whiteLabelName.trim() ? { displayName: whiteLabelName.trim() } : {})
              }
            }
          : {})
      });
      if (onUpdated) onUpdated();
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      // BUG-054: surface the actual reason (e.g. "GSTIN must be 15 characters...") instead of
      // the generic "Validation failed" the API returns as the top-level message.
      setError(err instanceof ApiError ? err.issues?.[0]?.message || err.message : 'Failed to update restaurant');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} label="Edit Restaurant Profile" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--jv-text)' }}>Edit Restaurant Profile</h2>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--jv-text-muted)' }}>
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

          <div className="form-section-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Palette className="w-3.5 h-3.5" />
            <span>White-Label Branding (optional)</span>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--jv-text-muted)' }}>
            Shown on this restaurant's own customer-facing Kiosk / QR ordering screens. Leave blank to keep the
            default JAMANVAAR look — the restaurant owner can also set these from their own Settings page.
          </p>
          <div>
            <label className="label">Custom Display Name</label>
            <input
              type="text"
              className="input"
              value={whiteLabelName}
              onChange={(e) => setWhiteLabelName(e.target.value)}
              placeholder="Leave blank to use the restaurant's own name"
            />
          </div>
          <div>
            <label className="label">Logo URL</label>
            <input
              type="text"
              className="input"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.png"
            />
          </div>
          <div className="form-grid">
            <div>
              <label className="label">Primary Color</label>
              <input
                type="text"
                className="input"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#0B253A"
                maxLength={7}
              />
            </div>
            <div>
              <label className="label">Accent Color</label>
              <input
                type="text"
                className="input"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#E66817"
                maxLength={7}
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
    </ModalShell>
  );
}
