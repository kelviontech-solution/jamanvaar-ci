import React, { useState, useEffect } from 'react';
import { DiningTable, TableStatus } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { TableRepository } from '@jamanvaar/database';

interface TableModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableToEdit: DiningTable | null;
  onSaved: () => void;
}

export const TableModal: React.FC<TableModalProps> = ({
  isOpen,
  onClose,
  tableToEdit,
  onSaved
}) => {
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [zone, setZone] = useState('Main Dining Hall');
  const [floor, setFloor] = useState('1');
  const [status, setStatus] = useState<TableStatus>('AVAILABLE');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (tableToEdit) {
      setTableNumber(tableToEdit.tableNumber);
      setCapacity(tableToEdit.capacity.toString());
      setZone(tableToEdit.zone || 'Main Dining Hall');
      setFloor((tableToEdit.floor || 1).toString());
      setStatus(tableToEdit.status);
      setIsActive(tableToEdit.isActive ?? true);
    } else {
      setTableNumber('');
      setCapacity('4');
      setZone('Main Dining Hall');
      setFloor('1');
      setStatus('AVAILABLE');
      setIsActive(true);
    }
  }, [tableToEdit, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber) return;

    if (tableToEdit) {
      TableRepository.updateTable(tableToEdit.id, {
        tableNumber,
        capacity: Number(capacity) || 4,
        zone,
        floor: Number(floor) || 1,
        status,
        isActive
      });
    } else {
      TableRepository.createTable({
        tableNumber,
        capacity: Number(capacity) || 4,
        zone,
        floor: Number(floor) || 1,
        status,
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
      title={tableToEdit ? `Edit Table: T-${tableToEdit.tableNumber}` : 'Add New Dining Table'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Table Number *</label>
            <input
              type="text"
              required
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="e.g. 15"
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-[#E66817]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Seating Capacity (Guests)</label>
            <input
              type="number"
              min="1"
              max="30"
              required
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-[#E66817]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Dining Zone / Section</label>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            >
              <option value="Main Dining Hall">Main Dining Hall</option>
              <option value="AC Family Section">AC Family Section</option>
              <option value="Garden Terrace">Garden Terrace</option>
              <option value="Banquet / Private">Banquet / Private Room</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Floor Level</label>
            <select
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            >
              <option value="1">Floor 1 (Ground)</option>
              <option value="2">Floor 2 (First)</option>
              <option value="3">Rooftop</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Initial Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TableStatus)}
            className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
          >
            <option value="AVAILABLE">🟢 AVAILABLE (Vacant)</option>
            <option value="OCCUPIED">🟠 OCCUPIED (Seated)</option>
            <option value="RESERVED">🔵 RESERVED</option>
            <option value="CLEANING">🟡 CLEANING / RESET</option>
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="submit"
            className="px-4 py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            {tableToEdit ? 'Save Changes' : 'Create Table'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
