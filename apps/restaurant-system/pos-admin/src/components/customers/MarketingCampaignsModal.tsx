import React, { useState } from 'react';
import { MarketingCampaign, CustomerSegmentFilter, LoyaltyTier } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { MarketingRepository, CustomerRepository } from '@jamanvaar/database';
import { Plus, Send, Trash2, Users as UsersIcon } from 'lucide-react';

interface MarketingCampaignsModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

const EMPTY_FILTER: CustomerSegmentFilter = {};

export const MarketingCampaignsModal: React.FC<MarketingCampaignsModalProps> = ({ isOpen, onClose, showToast }) => {
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>(() => MarketingRepository.getCampaigns());
  const [tiers] = useState<LoyaltyTier[]>(() => CustomerRepository.getTiers());
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('Hi {{name}}! ');
  const [filter, setFilter] = useState<CustomerSegmentFilter>(EMPTY_FILTER);
  const [sendQueue, setSendQueue] = useState<{ campaign: MarketingCampaign; phones: string[]; index: number } | null>(null);

  const refresh = () => setCampaigns(MarketingRepository.getCampaigns());

  const matchCount = MarketingRepository.getMatchingCustomers(filter).length;

  const resetCreateForm = () => {
    setCreating(false);
    setName('');
    setMessageTemplate('Hi {{name}}! ');
    setFilter(EMPTY_FILTER);
  };

  const handleCreate = () => {
    if (!name.trim() || !messageTemplate.trim()) return;
    MarketingRepository.createCampaign({ name: name.trim(), messageTemplate: messageTemplate.trim(), segmentFilter: filter });
    resetCreateForm();
    refresh();
    showToast('Campaign created');
  };

  const handleDelete = (campaign: MarketingCampaign) => {
    if (!window.confirm(`Delete campaign "${campaign.name}"?`)) return;
    MarketingRepository.deleteCampaign(campaign.id);
    refresh();
    showToast('Campaign deleted');
  };

  const startSending = (campaign: MarketingCampaign) => {
    const matches = MarketingRepository.getMatchingCustomers(campaign.segmentFilter);
    const remaining = matches.filter((c) => !campaign.sentToPhones.includes(c.phone));
    if (remaining.length === 0) {
      showToast('Everyone in this segment has already been sent to');
      return;
    }
    setSendQueue({ campaign, phones: remaining.map((c) => c.phone), index: 0 });
  };

  const sendCurrentAndAdvance = () => {
    if (!sendQueue) return;
    const phone = sendQueue.phones[sendQueue.index];
    const customer = CustomerRepository.getByPhone(phone);
    if (customer) {
      const message = MarketingRepository.renderMessage(sendQueue.campaign.messageTemplate, customer);
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`, '_blank');
      MarketingRepository.markSent(sendQueue.campaign.id, phone);
    }
    if (sendQueue.index + 1 >= sendQueue.phones.length) {
      showToast(`Campaign "${sendQueue.campaign.name}" send queue complete`);
      setSendQueue(null);
      refresh();
    } else {
      setSendQueue({ ...sendQueue, index: sendQueue.index + 1 });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Marketing Campaigns" maxWidth="lg">
      {sendQueue ? (
        <div className="space-y-4 py-1">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
            No WhatsApp Business API is connected — each send still opens a WhatsApp chat you confirm and tap send on yourself. This queue just steps you through the whole segment instead of picking recipients one at a time.
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">Sending "{sendQueue.campaign.name}"</div>
            <div className="text-lg font-black text-[#0B253A]">{sendQueue.index + 1} of {sendQueue.phones.length}</div>
            <div className="text-xs text-slate-500 mt-1">
              Next: {CustomerRepository.getByPhone(sendQueue.phones[sendQueue.index])?.name || sendQueue.phones[sendQueue.index]}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button variant="ghost" onClick={() => setSendQueue(null)}>Stop</Button>
            <Button variant="primary" onClick={sendCurrentAndAdvance}>
              <Send className="w-4 h-4" /> Open WhatsApp & Next
            </Button>
          </div>
        </div>
      ) : creating ? (
        <div className="space-y-4 py-1">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Campaign Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diwali VIP Offer"
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#E66817]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Message Template * (use {'{{name}}'} to merge the guest's name)</label>
            <textarea
              rows={3}
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#E66817]"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-600">Audience Segment</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Minimum Tier</span>
                <select
                  value={filter.minTierId || ''}
                  onChange={(e) => setFilter((f) => ({ ...f, minTierId: e.target.value || undefined }))}
                  className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-lg px-2 py-1.5 text-xs font-bold"
                >
                  <option value="">Any tier</option>
                  {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}+</option>)}
                </select>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Min Lifetime Spend (₹)</span>
                <input
                  type="number"
                  value={filter.minLifetimeSpend ?? ''}
                  onChange={(e) => setFilter((f) => ({ ...f, minLifetimeSpend: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="Any"
                  className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-lg px-2 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Inactive For (days)</span>
                <input
                  type="number"
                  value={filter.inactiveForDays ?? ''}
                  onChange={(e) => setFilter((f) => ({ ...f, inactiveForDays: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="Any"
                  className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-lg px-2 py-1.5 text-xs font-mono"
                />
              </div>
              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!filter.birthdayThisMonth}
                    onChange={(e) => setFilter((f) => ({ ...f, birthdayThisMonth: e.target.checked || undefined }))}
                  />
                  Birthday this month
                </label>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#0B253A] bg-[#FFF4ED] border border-[#FDBA74] rounded-lg px-2.5 py-1.5 w-fit">
              <UsersIcon className="w-3.5 h-3.5 text-[#E66817]" />
              {matchCount} customer{matchCount === 1 ? '' : 's'} match this segment
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="ghost" onClick={resetCreateForm}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate}>Create Campaign</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 py-1">
          <div className="flex justify-end">
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0B253A] hover:bg-[#1E3A4C] text-white text-xs font-bold rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> New Campaign
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-[#FAF7F2] rounded-xl">
              No campaigns yet. Create one to target a real customer segment instead of messaging one guest at a time.
            </div>
          ) : (
            <div className="space-y-1.5">
              {campaigns.map((c) => {
                const matches = MarketingRepository.getMatchingCustomers(c.segmentFilter).length;
                return (
                  <div key={c.id} className="p-3 bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-[#0B253A] truncate">{c.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {matches} in segment · {c.sentToPhones.length} sent · {c.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => startSending(c)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Send className="w-3 h-3" /> Send
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
