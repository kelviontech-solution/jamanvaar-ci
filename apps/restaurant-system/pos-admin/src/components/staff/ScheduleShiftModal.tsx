import React, { useEffect, useState } from 'react';
import { User, StaffShiftSchedule } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { StaffScheduleRepository, StaffRepository } from '@jamanvaar/database';

interface ScheduleShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  shiftToEdit: StaffShiftSchedule | null;
  defaultDate: string;
  onSaved: () => void;
}

export const ScheduleShiftModal: React.FC<ScheduleShiftModalProps> = ({
  isOpen,
  onClose,
  users,
  shiftToEdit,
  defaultDate,
  onSaved
}) => {
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('18:00');
  const [roleLabel, setRoleLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (shiftToEdit) {
      setUserId(shiftToEdit.userId);
      setDate(shiftToEdit.date);
      setStartTime(shiftToEdit.startTime);
      setEndTime(shiftToEdit.endTime);
      setRoleLabel(shiftToEdit.roleLabel || '');
      setNotes(shiftToEdit.notes || '');
    } else {
      setUserId(users[0]?.id || '');
      setDate(defaultDate);
      setStartTime('10:00');
      setEndTime('18:00');
      setRoleLabel('');
      setNotes('');
    }
    setFormError('');
  }, [isOpen, shiftToEdit, defaultDate, users]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const user = users.find((u) => u.id === userId);
    if (!user) {
      setFormError('Select a staff member.');
      return;
    }
    if (!date || !startTime || !endTime) {
      setFormError('Date, start time, and end time are required.');
      return;
    }
    if (endTime <= startTime) {
      setFormError('End time must be after start time.');
      return;
    }

    if (shiftToEdit) {
      StaffScheduleRepository.updateSchedule(shiftToEdit.id, {
        userId: user.id,
        userName: user.fullName,
        date,
        startTime,
        endTime,
        roleLabel: roleLabel.trim() || undefined,
        notes: notes.trim() || undefined
      });
    } else {
      StaffScheduleRepository.createSchedule({
        userId: user.id,
        userName: user.fullName,
        date,
        startTime,
        endTime,
        roleLabel: roleLabel.trim() || undefined,
        notes: notes.trim() || undefined
      });
    }

    onSaved();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={shiftToEdit ? 'Edit Shift' : 'Schedule a Shift'} maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {formError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl px-3 py-2">
            {formError}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Staff Member *</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName} ({StaffRepository.getRoleName(u.roleId)})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Date *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Start *</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">End *</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Duty / Station (optional)</label>
          <input
            type="text"
            value={roleLabel}
            onChange={(e) => setRoleLabel(e.target.value)}
            placeholder="e.g. Floor Captain, Kitchen, Billing Counter"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-jaman-saffron"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Covering for weekend rush"
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-jaman-saffron"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">{shiftToEdit ? 'Save Changes' : 'Schedule Shift'}</Button>
        </div>
      </form>
    </Modal>
  );
};
