import React, { useState, useEffect } from 'react';
import { User as UserType } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { StaffRepository } from '@jamanvaar/database';

interface StaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffToEdit: UserType | null;
  onSaved: () => void;
}

export const StaffModal: React.FC<StaffModalProps> = ({
  isOpen,
  onClose,
  staffToEdit,
  onSaved
}) => {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('CASHIER');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (staffToEdit) {
      setFullName(staffToEdit.fullName);
      setUsername(staffToEdit.username);
      setEmail(staffToEdit.email);
      setPhone(staffToEdit.phone || '');
      setRoleId(staffToEdit.roleId || 'CASHIER');
      setIsActive(staffToEdit.isActive ?? true);
    } else {
      setFullName('');
      setUsername('');
      setEmail('');
      setPhone('');
      setRoleId('CASHIER');
      setIsActive(true);
    }
  }, [staffToEdit, isOpen]);

  const handleNameChange = (val: string) => {
    setFullName(val);
    if (!staffToEdit) {
      setUsername(val.toLowerCase().replace(/[^a-z0-9]+/g, ''));
      setEmail(`${val.toLowerCase().replace(/[^a-z0-9]+/g, '')}@jamanvaar.local`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!fullName || !username) {
      setFormError('Full name and username are required.');
      return;
    }

    if (staffToEdit) {
      StaffRepository.updateUser(staffToEdit.id, {
        fullName,
        username,
        email: email || `${username}@jamanvaar.local`,
        phone,
        roleId,
        isActive
      });
    } else {
      StaffRepository.createUser({
        fullName,
        username,
        email: email || `${username}@jamanvaar.local`,
        phone: phone || '+91 9800000000',
        roleId,
        isActive
      });
    }

    onSaved();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={staffToEdit ? `Edit Employee: ${staffToEdit.fullName}` : 'Add New Staff Member'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Full Employee Name *</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Amit Dave"
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
              <option value="OWNER">👑 Restaurant Owner</option>
              <option value="MANAGER">👔 Store Manager</option>
              <option value="CASHIER">💵 Cashier</option>
              <option value="CAPTAIN">🤵 Captain / Waiter</option>
              <option value="CHEF">👨‍🍳 Kitchen Chef</option>
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
            <label className="block text-xs font-bold text-slate-600 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. staff@jamanvaar.local"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            <span>Active Employee (Permitted to log in and operate)</span>
          </label>
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
            {staffToEdit ? 'Save Changes' : 'Create Staff Member'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
