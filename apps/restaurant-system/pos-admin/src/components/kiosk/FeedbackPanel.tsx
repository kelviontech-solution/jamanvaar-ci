import React from 'react';
import { Order } from '@jamanvaar/types';
import { FeedbackRepository } from '@jamanvaar/database';
import { KpiCard } from '@jamanvaar/ui';
import { formatTime } from '@jamanvaar/utils';
import { Star, Clock, MessageSquare } from 'lucide-react';

/**
 * Relocated from kiosk-admin's Feedback tab — genuinely kiosk-specific (feedback is only ever
 * submitted through the customer kiosk), so this panel is rendered only when KIOSK_ADMIN is
 * enabled, unlike the other relocated panels in this merge.
 */
export const FeedbackPanel: React.FC<{ orders: Order[] }> = ({ orders }) => {
  const feedbacks = FeedbackRepository.getAll();
  const avgRating = feedbacks.length > 0 ? (feedbacks.reduce((sum, fb) => sum + fb.rating, 0) / feedbacks.length).toFixed(1) : null;
  const ordersWithReadyTiming = orders.filter(
    (o) => (o.orderStatus === 'READY' || o.orderStatus === 'SERVED' || o.orderStatus === 'COMPLETED') && o.timeline?.some((t) => t.status === 'READY')
  );
  const onTimeOrders = ordersWithReadyTiming.filter((o) => {
    const readyEntry = o.timeline!.find((t) => t.status === 'READY')!;
    const elapsedMin = (new Date(readyEntry.timestamp).getTime() - new Date(o.createdAt).getTime()) / 60000;
    return elapsedMin <= (o.estimatedWaitMinutes || 15);
  }).length;
  const serviceSpeedScore = ordersWithReadyTiming.length > 0 ? Math.round((onTimeOrders / ordersWithReadyTiming.length) * 100) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Customer Experience & Feedback</h1>
        <p className="text-sm text-[#4A5568] mt-1">
          Real-time ratings, service speed impressions, and customer reviews submitted via the kiosk.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          title="Average Rating"
          value={avgRating !== null ? `${avgRating} / 5.0` : 'No ratings yet'}
          subtitle="Based on kiosk submissions"
          icon={<Star className="w-5 h-5 text-amber-500 fill-amber-500" />}
        />
        <KpiCard
          title="Service Speed Score"
          value={serviceSpeedScore !== null ? `${serviceSpeedScore}%` : 'No data yet'}
          subtitle="Orders ready within estimate"
          icon={<Clock className="w-5 h-5" />}
        />
        <KpiCard
          title="Total Reviews"
          value={feedbacks.length}
          subtitle="Customer feedback entries"
          icon={<MessageSquare className="w-5 h-5" />}
        />
      </div>

      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm divide-y divide-[#F3EFE6]">
        {feedbacks.map((fb) => (
          <div key={fb.id} className="py-4 space-y-2 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex text-amber-500">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-4 h-4 ${s <= fb.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                    />
                  ))}
                </div>
                <span className="text-xs font-bold text-jaman-navy">{fb.rating} Stars</span>
                <span className="text-xs text-[#8C9BAE]">• {fb.kioskId}</span>
              </div>
              <span className="text-xs text-[#8C9BAE]">{formatTime(fb.createdAt)}</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {fb.tags.map((tg: string) => (
                <span key={tg} className="bg-jaman-ivory border border-jaman-border px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-jaman-navy">
                  ✓ {tg}
                </span>
              ))}
            </div>

            {fb.comments && (
              <p className="text-xs text-[#4A5568] bg-jaman-ivory p-3 rounded-xl border border-jaman-border">
                "{fb.comments}"
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
