import React, { useState } from 'react';
import { User, StaffShiftSchedule, AttendanceStatus, DeliveryRider } from '@jamanvaar/types';
import { StaffRepository, StaffScheduleRepository, RiderRepository } from '@jamanvaar/database';
import {
  Plus,
  Shield,
  Edit2,
  Trash2,
  UserCheck,
  Phone,
  Mail,
  Key,
  Calendar,
  Clock,
  LogIn,
  LogOut,
  Bike
} from 'lucide-react';
import { ScheduleShiftModal } from './ScheduleShiftModal';
import { RiderModal } from './RiderModal';

interface StaffRolesModuleProps {
  users: User[];
  onOpenStaffModal: (usr?: User | null) => void;
  showToast: (msg: string) => void;
  onRequestConfirm?: (dialog: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    isDanger: boolean;
    onConfirm: () => void;
  }) => void;
}

export const StaffRolesModule: React.FC<StaffRolesModuleProps> = ({
  users,
  onOpenStaffModal,
  showToast,
  onRequestConfirm
}) => {
  const todayKey = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftToEdit, setShiftToEdit] = useState<StaffShiftSchedule | null>(null);
  const [isRiderModalOpen, setIsRiderModalOpen] = useState(false);
  const [riderToEdit, setRiderToEdit] = useState<DeliveryRider | null>(null);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const schedulesForDay = StaffScheduleRepository.getSchedules().filter((s) => s.date === selectedDate);
  const attendanceForDay = StaffScheduleRepository.getAttendanceForDate(selectedDate);
  const riders = RiderRepository.getAllRiders();

  const handleDeleteRider = (rider: DeliveryRider) => {
    if (!window.confirm(`Remove rider "${rider.name}" from the roster?`)) return;
    RiderRepository.deleteRider(rider.id);
    refresh();
    showToast(`Removed rider: ${rider.name}`);
  };

  const toggleRiderActive = (rider: DeliveryRider) => {
    RiderRepository.updateRider(rider.id, { isActive: !rider.isActive });
    refresh();
  };

  const attendanceStatusFor = (userId: string): AttendanceStatus | null => {
    const rec = attendanceForDay.find((a) => a.userId === userId);
    return rec?.status || null;
  };

  const handleDeleteShift = (shift: StaffShiftSchedule) => {
    if (!window.confirm(`Remove ${shift.userName}'s shift on ${shift.date}?`)) return;
    StaffScheduleRepository.deleteSchedule(shift.id);
    refresh();
    showToast('Shift removed');
  };

  const handleClockIn = (usr: User) => {
    StaffScheduleRepository.clockIn(usr.id, usr.fullName);
    refresh();
    showToast(`${usr.fullName} clocked in`);
  };

  const handleClockOut = (usr: User) => {
    StaffScheduleRepository.clockOut(usr.id, usr.fullName);
    refresh();
    showToast(`${usr.fullName} clocked out`);
  };

  const handleMarkAttendance = (usr: User, status: AttendanceStatus) => {
    StaffScheduleRepository.markAttendance(usr.id, usr.fullName, selectedDate, status);
    refresh();
    showToast(`${usr.fullName} marked ${status.replace('_', ' ').toLowerCase()}`);
  };

  const handleDeleteStaff = (usr: User) => {
    if (onRequestConfirm) {
      onRequestConfirm({
        isOpen: true,
        title: 'Remove Staff Account',
        message: `Are you sure you want to deactivate and remove staff access for "${usr.fullName}"?`,
        confirmText: 'Remove Staff',
        isDanger: true,
        onConfirm: () => {
          StaffRepository.deleteUser(usr.id);
          showToast(`Staff removed: ${usr.fullName}`);
        }
      });
    } else {
      if (window.confirm(`Remove staff access for "${usr.fullName}"?`)) {
        StaffRepository.deleteUser(usr.id);
        showToast(`Staff removed: ${usr.fullName}`);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy tracking-tight">
              Staff & Role-Based Access (RBAC)
            </h1>
            <span className="bg-emerald-50 text-emerald-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-200/70">
              SECURE PERMISSIONS
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage owner PINs, cashier logins, manager overrides, and kitchen credentials.
          </p>
        </div>
        <button
          onClick={() => onOpenStaffModal(null)}
          className="px-3.5 py-2 rounded-xl bg-jaman-saffron hover:bg-[#EA580C] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Staff Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <span className="text-[11px] font-black uppercase text-slate-500">TOTAL TEAM</span>
          <div className="text-2xl font-black text-jaman-navy font-mono">{users.length} Active</div>
          <span className="text-[10px] text-slate-400 font-medium">Registered Staff Accounts</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <span className="text-[11px] font-black uppercase text-slate-500">OWNERS & MANAGERS</span>
          <div className="text-2xl font-black text-jaman-navy font-mono">
            {users.filter((u) => u.roleId === 'role-super-admin' || u.roleId === 'role-manager').length}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Full System Authority</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <span className="text-[11px] font-black uppercase text-slate-500">CASHIERS</span>
          <div className="text-2xl font-black text-jaman-navy font-mono">
            {users.filter((u) => u.roleId === 'role-cashier').length}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">POS Register Terminal</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <span className="text-[11px] font-black uppercase text-slate-500">CAPTAINS & SERVICE</span>
          <div className="text-2xl font-black text-jaman-navy font-mono">
            {users.filter((u) => u.roleId === 'role-captain').length}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Floor Order Taking</span>
        </div>
      </div>

      {users.length === 0 && (
        <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-jaman-border">
          <p className="text-sm font-bold text-jaman-navy">No staff yet.</p>
          <p className="text-xs text-slate-500 mt-1">
            Add your first employee — creating one issues a working PIN for POS, Captain, KDS and Kiosk.
          </p>
        </div>
      )}

      {/* Staff Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {users.map((usr: User) => (
          <div
            key={usr.id}
            className="p-5 bg-white rounded-2xl border border-jaman-border shadow-2xs space-y-3 hover:shadow-xs transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center font-black text-sm border border-[#FDBA74]/40">
                {usr.fullName[0]}
              </div>
              <span className="bg-jaman-cream text-jaman-navy font-black text-[10px] px-2.5 py-1 rounded-lg uppercase tracking-wider border border-jaman-border">
                {StaffRepository.getRoleName(usr.roleId)}
              </span>
            </div>

            <div>
              <h4 className="font-extrabold text-sm text-jaman-navy">{usr.fullName}</h4>
              <span className="text-xs text-slate-400 font-medium">
                @{usr.username}{usr.phone ? ` • ${usr.phone}` : ''}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-emerald-800 font-bold text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                ACTIVE
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onOpenStaffModal(usr)}
                  className="p-1.5 text-jaman-saffron hover:bg-[#FFF4ED] rounded-lg transition-colors cursor-pointer"
                  title="Edit Staff"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteStaff(usr)}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  title="Delete Staff"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Schedule & Attendance — previously nonexistent: StaffRepository only
          managed login accounts, with no concept of a work roster or whether
          someone actually showed up. */}
      <div className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-2xs">
        <div className="p-4 bg-jaman-cream border-b border-jaman-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-jaman-saffron" />
            <span className="font-extrabold text-sm text-jaman-navy">Schedule & Attendance</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
            />
            <button
              onClick={() => { setShiftToEdit(null); setIsShiftModalOpen(true); }}
              className="px-3 py-1.5 rounded-xl bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule Shift</span>
            </button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Shifts scheduled for the selected day */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              Shifts on {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </h4>
            {schedulesForDay.length === 0 ? (
              <div className="p-4 bg-jaman-cream rounded-xl text-center text-xs text-slate-400">
                No shifts scheduled for this day.
              </div>
            ) : (
              <div className="space-y-1.5">
                {schedulesForDay.map((shift) => (
                  <div key={shift.id} className="p-2.5 bg-jaman-cream border border-jaman-border rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock className="w-3.5 h-3.5 text-jaman-saffron shrink-0" />
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-jaman-navy truncate">{shift.userName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {shift.startTime}–{shift.endTime}{shift.roleLabel ? ` · ${shift.roleLabel}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { setShiftToEdit(shift); setIsShiftModalOpen(true); }}
                        className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-jaman-saffron cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteShift(shift)}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attendance for the selected day */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Attendance</h4>
            <div className="space-y-1.5">
              {users.map((usr) => {
                const status = attendanceStatusFor(usr.id);
                const attRecord = attendanceForDay.find((a) => a.userId === usr.id);
                return (
                  <div key={usr.id} className="p-2.5 bg-jaman-cream border border-jaman-border rounded-xl flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-jaman-navy truncate">{usr.fullName}</div>
                      <div className="text-[10px] text-slate-500">
                        {attRecord?.clockInAt
                          ? `In ${new Date(attRecord.clockInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}${attRecord.clockOutAt ? ` · Out ${new Date(attRecord.clockOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                          : 'Not clocked in'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedDate === todayKey && (
                        <>
                          <button
                            onClick={() => handleClockIn(usr)}
                            title="Clock In"
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-pointer"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleClockOut(usr)}
                            title="Clock Out"
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <select
                        value={status || ''}
                        onChange={(e) => handleMarkAttendance(usr, e.target.value as AttendanceStatus)}
                        className="bg-white border border-jaman-border rounded-lg px-1.5 py-1 text-[10px] font-bold cursor-pointer"
                      >
                        <option value="" disabled>Mark…</option>
                        <option value="PRESENT">Present</option>
                        <option value="LATE">Late</option>
                        <option value="ABSENT">Absent</option>
                        <option value="ON_LEAVE">On Leave</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Riders — previously a DELIVERY order had an orderType and
          nothing else: no roster, no assignment, no dispatch tracking. */}
      <div className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-2xs">
        <div className="p-4 bg-jaman-cream border-b border-jaman-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bike className="w-4 h-4 text-jaman-saffron" />
            <span className="font-extrabold text-sm text-jaman-navy">Delivery Riders ({riders.length})</span>
          </div>
          <button
            onClick={() => { setRiderToEdit(null); setIsRiderModalOpen(true); }}
            className="px-3 py-1.5 rounded-xl bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Rider</span>
          </button>
        </div>
        {riders.length === 0 ? (
          <div className="py-10 text-center px-4">
            <p className="text-xs text-slate-400">No riders on the roster yet. Add one to assign deliveries to a real person instead of leaving delivery orders untracked.</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {riders.map((rider) => (
              <div key={rider.id} className="p-3 bg-jaman-cream border border-jaman-border rounded-xl flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-xs text-jaman-navy truncate">{rider.name}</div>
                  <div className="text-[10px] text-slate-500">{rider.phone} · {rider.vehicleType.replace('_', ' ')}{rider.vehicleNumber ? ` · ${rider.vehicleNumber}` : ''}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleRiderActive(rider)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${rider.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}
                  >
                    {rider.isActive ? 'Active' : 'Inactive'}
                  </button>
                  <button onClick={() => { setRiderToEdit(rider); setIsRiderModalOpen(true); }} className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-jaman-saffron cursor-pointer">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteRider(rider)} className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ScheduleShiftModal
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        users={users}
        shiftToEdit={shiftToEdit}
        defaultDate={selectedDate}
        onSaved={() => { refresh(); showToast(shiftToEdit ? 'Shift updated' : 'Shift scheduled'); }}
      />

      <RiderModal
        isOpen={isRiderModalOpen}
        onClose={() => setIsRiderModalOpen(false)}
        riderToEdit={riderToEdit}
        onSaved={() => { refresh(); showToast(riderToEdit ? 'Rider updated' : 'Rider added'); }}
      />
    </div>
  );
};
