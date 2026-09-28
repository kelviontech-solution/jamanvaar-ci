import React, { useState, useEffect } from 'react';
import { User as UserType } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { StaffRepository, StaffScheduleRepository } from '@jamanvaar/database';
import { copyText } from '@jamanvaar/utils';
import { Check, Copy, KeyRound } from 'lucide-react';

interface StaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffToEdit: UserType | null;
  onSaved: () => void;
}

/**
 * BUG-005/006/009/010/011: this used to offer a fixed, hardcoded set of role values
 * (OWNER/MANAGER/CASHIER/CAPTAIN/CHEF) that matched none of the real role ids
 * (`role-cashier`, `role-manager`, ...), so Edit Employee always fell back to the first
 * option — "Restaurant Owner" — even for a cashier, and saving without touching the
 * dropdown silently promoted that employee. The dropdown now lists this restaurant's
 * real roles. It also no longer invents an "@jamanvaar.local" email, and issues (or
 * resets) a real, working PIN — shown once — which is the "assign PIN to staff from
 * Restaurant Admin" the owner asked for.
 */
export const StaffModal: React.FC<StaffModalProps> = ({
  isOpen,
  onClose,
  staffToEdit,
  onSaved
}) => {
  const roles = StaffRepository.getAllRoles();
  // B2-012: this defaulted to roles[0]?.id, which happens to be 'role-super-admin' /
  // "Super Admin / Owner" — the *most* privileged role, given by accident to any new
  // employee whose creator didn't touch the dropdown. Fail-safe default is the other way
  // round: the least-privileged role in the list (Kitchen Chef, view-only), same principle
  // BUG-084 already applied to the platform-side team-invite dialog. This also covers the
  // "staffToEdit.roleId is falsy" fallback a few lines down, which had the identical bug.
  const leastPrivilegedRoleId = roles[roles.length - 1]?.id ?? roles[0]?.id ?? '';
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState(leastPrivilegedRoleId);
  const [isActive, setIsActive] = useState(true);
  const [hourlyPay, setHourlyPay] = useState('');
  const [formError, setFormError] = useState('');
  const [issuedPin, setIssuedPin] = useState<string | null>(null);
  const [pinCopied, setPinCopied] = useState(false);

  useEffect(() => {
    setIssuedPin(null);
    setPinCopied(false);
    if (staffToEdit) {
      setFullName(staffToEdit.fullName);
      setUsername(staffToEdit.username);
      setEmail(staffToEdit.email || '');
      setPhone(staffToEdit.phone || '');
      setRoleId(staffToEdit.roleId || leastPrivilegedRoleId);
      setIsActive(staffToEdit.isActive ?? true);
      const rate = StaffScheduleRepository.getPayRates()[staffToEdit.id];
      setHourlyPay(rate ? String(rate) : '');
    } else {
      setFullName('');
      setUsername('');
      setEmail('');
      setPhone('');
      setRoleId(leastPrivilegedRoleId);
      setIsActive(true);
      setHourlyPay('');
    }
  }, [staffToEdit, isOpen]);

  const handleNameChange = (val: string) => {
    setFullName(val);
    if (!staffToEdit) {
      setUsername(val.toLowerCase().replace(/[^a-z0-9]+/g, ''));
    }
  };

  const handleResetPin = async () => {
    if (!staffToEdit) return;
    const result = await StaffRepository.resetPin(staffToEdit.id);
    if (result) {
      setIssuedPin(result.issuedPin);
      setPinCopied(false);
    }
  };

  const handleCopyPin = async () => {
    if (!issuedPin) return;
    if (await copyText(issuedPin)) {
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!fullName || !username) {
      setFormError('Full name and username are required.');
      return;
    }
    if (!roleId) {
      setFormError('Choose a role.');
      return;
    }

    if (staffToEdit) {
      StaffRepository.updateUser(staffToEdit.id, {
        fullName,
        username,
        email,
        phone,
        roleId,
        isActive
      });
      StaffScheduleRepository.setPayRate(staffToEdit.id, Number(hourlyPay));
      onSaved();
      onClose();
    } else {
      const created = await StaffRepository.createUser({
        fullName,
        username,
        email,
        phone,
        roleId,
        isActive
      });
      // Show the new PIN once instead of closing immediately — this is the only moment it
      // is ever available in plaintext, so the admin needs a chance to note it down.
      StaffScheduleRepository.setPayRate(created.id, Number(hourlyPay));
      setIssuedPin(created.issuedPin ?? null);
      onSaved();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={staffToEdit ? `Edit Employee: ${staffToEdit.fullName}` : 'Add New Staff Member'}
      maxWidth="md"
    >
      {issuedPin ? (
        <div className="space-y-4 py-1">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-2">
            <p className="text-xs font-bold text-emerald-800">
              {staffToEdit ? 'New PIN issued.' : 'Staff member created.'} This PIN is shown only once — note it down now.
            </p>
            <div className="text-3xl font-black tracking-[0.3em] text-jaman-navy font-mono">{issuedPin}</div>
            <button
              type="button"
              onClick={handleCopyPin}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
            >
              {pinCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {pinCopied ? 'Copied' : 'Copy PIN'}
            </button>
            <p className="text-[11px] text-emerald-700">
              This PIN logs {fullName || 'this staff member'} into POS, Captain, KDS and Kiosk. It can be reset any time from here.
            </p>
          </div>
          <div className="flex justify-end pt-2 border-t border-slate-200">
            <Button
              variant="primary"
              onClick={() => {
                onSaved();
                onClose();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Full Employee Name *</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Employee's full name"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Username / Login ID *</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. amitdave"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Assigned Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Contact Phone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98250 12345"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Email Address (optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@example.com"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Pay per hour, in rupees (optional)</label>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={hourlyPay}
            onChange={(e) => setHourlyPay(e.target.value)}
            placeholder="e.g. 120"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
          />
          <p className="text-[11px] text-slate-500 mt-1">Used only for the labour cost report. Kept on this computer; it is never sent to POS, Captain or KDS.</p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            <span>Active Employee (Permitted to log in and operate)</span>
          </label>
          {staffToEdit && (
            <button
              type="button"
              onClick={handleResetPin}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-jaman-saffron hover:text-[#EA580C] cursor-pointer shrink-0"
              title="Issue a new PIN for this staff member"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Reset PIN
            </button>
          )}
        </div>

        {formError && (
          <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="submit"
            className="px-4 py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            {staffToEdit ? 'Save Changes' : 'Create Staff Member & Issue PIN'}
          </button>
        </div>
      </form>
      )}
    </Modal>
  );
};
