import React, { useState } from 'react';
import { LoyaltyTier, LoyaltyReward } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { CustomerRepository } from '@jamanvaar/database';
import { Plus, Trash2, Edit2 } from 'lucide-react';

interface LoyaltyProgramModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

/**
 * Manages loyalty tiers and the rewards catalog — the previous system was a
 * single flat loyaltyPoints number with no tiers and nothing specific to
 * redeem points against (just an implicit "1 pt = ₹1" assumption).
 */
export const LoyaltyProgramModal: React.FC<LoyaltyProgramModalProps> = ({ isOpen, onClose, showToast }) => {
  const [tiers, setTiers] = useState<LoyaltyTier[]>(() => CustomerRepository.getTiers());
  const [rewards, setRewards] = useState<LoyaltyReward[]>(() => CustomerRepository.getRewards());
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [tierDraft, setTierDraft] = useState<{ name: string; minLifetimeSpend: string; pointsMultiplier: string; perks: string }>({
    name: '', minLifetimeSpend: '0', pointsMultiplier: '1', perks: ''
  });
  const [newReward, setNewReward] = useState({ name: '', description: '', pointsCost: '100' });

  const refresh = () => {
    setTiers(CustomerRepository.getTiers());
    setRewards(CustomerRepository.getRewards());
  };

  const startEditTier = (tier: LoyaltyTier) => {
    setEditingTierId(tier.id);
    setTierDraft({
      name: tier.name,
      minLifetimeSpend: String(tier.minLifetimeSpend),
      pointsMultiplier: String(tier.pointsMultiplier),
      perks: tier.perks.join(', ')
    });
  };

  const saveTier = () => {
    if (!editingTierId || !tierDraft.name.trim()) return;
    CustomerRepository.updateTier(editingTierId, {
      name: tierDraft.name.trim(),
      minLifetimeSpend: Number(tierDraft.minLifetimeSpend) || 0,
      pointsMultiplier: Number(tierDraft.pointsMultiplier) || 1,
      perks: tierDraft.perks.split(',').map((p) => p.trim()).filter(Boolean)
    });
    setEditingTierId(null);
    refresh();
    showToast('Tier updated');
  };

  const removeTier = (tier: LoyaltyTier) => {
    if (!window.confirm(`Delete tier "${tier.name}"? Customers at this tier will fall back to the next one below.`)) return;
    CustomerRepository.deleteTier(tier.id);
    refresh();
    showToast(`Deleted tier: ${tier.name}`);
  };

  const addReward = () => {
    if (!newReward.name.trim() || !newReward.pointsCost) return;
    CustomerRepository.createReward({
      name: newReward.name.trim(),
      description: newReward.description.trim(),
      pointsCost: Number(newReward.pointsCost) || 0,
      isActive: true
    });
    setNewReward({ name: '', description: '', pointsCost: '100' });
    refresh();
    showToast('Reward added to catalog');
  };

  const toggleReward = (reward: LoyaltyReward) => {
    CustomerRepository.updateReward(reward.id, { isActive: !reward.isActive });
    refresh();
  };

  const removeReward = (reward: LoyaltyReward) => {
    if (!window.confirm(`Remove reward "${reward.name}" from the catalog?`)) return;
    CustomerRepository.deleteReward(reward.id);
    refresh();
    showToast(`Removed reward: ${reward.name}`);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Loyalty Program Settings" maxWidth="lg">
      <div className="space-y-6 py-1">
        {/* Tiers */}
        <div className="space-y-2">
          <h4 className="font-black text-xs text-jaman-navy uppercase tracking-wide">Spend Tiers</h4>
          <div className="space-y-1.5">
            {tiers.map((tier) => (
              <div key={tier.id} className="p-3 bg-jaman-cream border border-jaman-border rounded-xl">
                {editingTierId === tier.id ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={tierDraft.name}
                      onChange={(e) => setTierDraft((d) => ({ ...d, name: e.target.value }))}
                      placeholder="Tier name"
                      className="bg-white border border-jaman-border rounded-lg px-2 py-1.5 text-xs font-bold"
                    />
                    <input
                      type="number"
                      value={tierDraft.minLifetimeSpend}
                      onChange={(e) => setTierDraft((d) => ({ ...d, minLifetimeSpend: e.target.value }))}
                      placeholder="Min lifetime spend (₹)"
                      className="bg-white border border-jaman-border rounded-lg px-2 py-1.5 text-xs font-mono"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={tierDraft.pointsMultiplier}
                      onChange={(e) => setTierDraft((d) => ({ ...d, pointsMultiplier: e.target.value }))}
                      placeholder="Points multiplier"
                      className="bg-white border border-jaman-border rounded-lg px-2 py-1.5 text-xs font-mono"
                    />
                    <input
                      value={tierDraft.perks}
                      onChange={(e) => setTierDraft((d) => ({ ...d, perks: e.target.value }))}
                      placeholder="Perks, comma separated"
                      className="bg-white border border-jaman-border rounded-lg px-2 py-1.5 text-xs"
                    />
                    <div className="col-span-2 flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingTierId(null)}>Cancel</Button>
                      <Button variant="primary" size="sm" onClick={saveTier}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="font-black px-2 py-0.5 rounded-lg text-[10px] border shrink-0"
                        style={{ color: tier.colorHex, borderColor: tier.colorHex, background: `${tier.colorHex}14` }}
                      >
                        {tier.name}
                      </span>
                      <span className="text-[11px] text-slate-500 truncate">
                        ₹{tier.minLifetimeSpend.toLocaleString('en-IN')}+ · {tier.pointsMultiplier}x points · {tier.perks.join(', ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEditTier(tier)} className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-jaman-saffron cursor-pointer">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removeTier(tier)} className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Rewards Catalog */}
        <div className="space-y-2">
          <h4 className="font-black text-xs text-jaman-navy uppercase tracking-wide">Rewards Catalog</h4>
          <div className="space-y-1.5">
            {rewards.map((reward) => (
              <div key={reward.id} className="p-3 bg-jaman-cream border border-jaman-border rounded-xl flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-xs text-jaman-navy truncate">{reward.name} — {reward.pointsCost} pts</div>
                  <div className="text-[10px] text-slate-500 truncate">{reward.description}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => toggleReward(reward)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                      reward.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {reward.isActive ? 'Active' : 'Paused'}
                  </button>
                  <button onClick={() => removeReward(reward)} className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-white border border-dashed border-jaman-border rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              value={newReward.name}
              onChange={(e) => setNewReward((d) => ({ ...d, name: e.target.value }))}
              placeholder="Reward name"
              className="bg-jaman-ivory border border-jaman-border rounded-lg px-2 py-1.5 text-xs font-bold sm:col-span-1"
            />
            <input
              value={newReward.description}
              onChange={(e) => setNewReward((d) => ({ ...d, description: e.target.value }))}
              placeholder="Description"
              className="bg-jaman-ivory border border-jaman-border rounded-lg px-2 py-1.5 text-xs sm:col-span-2"
            />
            <input
              type="number"
              value={newReward.pointsCost}
              onChange={(e) => setNewReward((d) => ({ ...d, pointsCost: e.target.value }))}
              placeholder="Points"
              className="bg-jaman-ivory border border-jaman-border rounded-lg px-2 py-1.5 text-xs font-mono"
            />
            <button
              onClick={addReward}
              className="sm:col-span-4 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-jaman-navy hover:bg-jaman-darkBorder text-white text-xs font-bold rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Reward
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
