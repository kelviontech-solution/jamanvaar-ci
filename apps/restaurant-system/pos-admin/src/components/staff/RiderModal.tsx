import React, { useEffect, useState } from 'react';
import { DeliveryRider } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { RiderRepository } from '@jamanvaar/database';

interface RiderModalProps {
  isOpen: boolean;
  onClose: () => void;
  riderToEdit: DeliveryRider | null;
  onSaved: () => void;
}

export const RiderModal: React.FC<RiderModalProps> = ({ isOpen, onClose, riderToEdit, onSaved }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState<DeliveryRider['vehicleType']>('BIKE');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (riderToEdit) {
      setName(riderToEdit.name);
      setPhone(riderToEdit.phone);
      setVehicleType(riderToEdit.vehicleType);
      setVehicleNumber(riderToEdit.vehicleNumber || '');
    } else {
      setName('');
      setPhone('');
      setVehicleType('BIKE');
      setVehicleNumber('');
    }
    setFormError('');
  }, [isOpen, riderToEdit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim() || !phone.trim()) {
      setFormError('Rider name and phone are required.');
      return;
    }

    if (riderToEdit) {
      RiderRepository.updateRider(riderToEdit.id, { name: name.trim(), phone: phone.trim(), vehicleType, vehicleNumber: vehicleNumber.trim() || undefined });
    } else {
      RiderRepository.createRider({ name: name.trim(), phone: phone.trim(), vehicleType, vehicleNumber: vehicleNumber.trim() || undefined, isActive: true });
    }
    onSaved();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={riderToEdit ? 'Edit Rider' : 'Add Delivery Rider'} maxWidth="sm">
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {formError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl px-3 py-2">{formError}</div>
        )}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Rider Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Phone *</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Vehicle</label>
            <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value as DeliveryRider['vehicleType'])} className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold">
              <option value="BIKE">Motorbike</option>
              <option value="SCOOTER">Scooter</option>
              <option value="BICYCLE">Bicycle</option>
              <option value="CAR">Car</option>
              <option value="ON_FOOT">On Foot</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Vehicle No. (optional)</label>
            <input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:border-[#E66817]" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">{riderToEdit ? 'Save Changes' : 'Add Rider'}</Button>
        </div>
      </form>
    </Modal>
  );
};
