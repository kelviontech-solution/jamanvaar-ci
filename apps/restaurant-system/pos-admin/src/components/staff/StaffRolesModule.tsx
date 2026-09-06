import React from 'react';
import { User } from '@jamanvaar/types';
import { StaffRepository } from '@jamanvaar/database';
import {
  Plus,
  Shield,
  Edit2,
  Trash2,
  UserCheck,
  Phone,
  Mail,
  Key
} from 'lucide-react';

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
            <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">
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
          className="px-3.5 py-2 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Staff Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
          <span className="text-[11px] font-black uppercase text-slate-500">TOTAL TEAM</span>
          <div className="text-2xl font-black text-[#0B253A] font-mono">{users.length} Active</div>
          <span className="text-[10px] text-slate-400 font-medium">Registered Staff Accounts</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
          <span className="text-[11px] font-black uppercase text-slate-500">OWNERS & MANAGERS</span>
          <div className="text-2xl font-black text-[#0B253A] font-mono">
            {users.filter((u) => (u.roleId || '').includes('OWNER') || (u.roleId || '').includes('MANAGER')).length || 1}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Full System Authority</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
          <span className="text-[11px] font-black uppercase text-slate-500">CASHIERS</span>
          <div className="text-2xl font-black text-[#0B253A] font-mono">
            {users.filter((u) => (u.roleId || '').includes('CASHIER')).length || 1}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">POS Register Terminal</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
          <span className="text-[11px] font-black uppercase text-slate-500">CAPTAINS & SERVICE</span>
          <div className="text-2xl font-black text-[#0B253A] font-mono">
            {users.filter((u) => (u.roleId || '').includes('CAPTAIN') || (u.roleId || '').includes('WAITER')).length || 1}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Floor Order Taking</span>
        </div>
      </div>

      {/* Staff Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {users.map((usr: User) => (
          <div
            key={usr.id}
            className="p-5 bg-white rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-3 hover:shadow-xs transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-[#FFF4ED] text-[#E66817] flex items-center justify-center font-black text-sm border border-[#FDBA74]/40">
                {usr.fullName[0]}
              </div>
              <span className="bg-[#FAF7F2] text-[#0B253A] font-black text-[10px] px-2.5 py-1 rounded-lg uppercase tracking-wider border border-[#EBE6DD]">
                {usr.roleId || 'STAFF'}
              </span>
            </div>

            <div>
              <h4 className="font-extrabold text-sm text-[#0B253A]">{usr.fullName}</h4>
              <span className="text-xs text-slate-400 font-medium">
                @{usr.username} • {usr.phone}
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
                  className="p-1.5 text-[#E66817] hover:bg-[#FFF4ED] rounded-lg transition-colors cursor-pointer"
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
    </div>
  );
};
