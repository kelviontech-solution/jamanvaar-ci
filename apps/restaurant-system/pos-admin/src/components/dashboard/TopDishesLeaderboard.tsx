import React from 'react';
import { Utensils, Trophy, ArrowRight } from 'lucide-react';
import { formatINR } from '@jamanvaar/utils';
import { TopItemStat } from '@jamanvaar/business';

interface TopDishesLeaderboardProps {
  topDishes: TopItemStat[];
  onViewAll: () => void;
}

export const TopDishesLeaderboard: React.FC<TopDishesLeaderboardProps> = ({
  topDishes,
  onViewAll
}) => {
  const displayDishes = topDishes.slice(0, 5);

  return (
    <div className="dash-hero-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between h-full">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#E66817]" />
              <h3 className="font-black text-base text-[#0B253A] tracking-tight">
                Top Dishes
              </h3>
            </div>
            <p className="text-xs text-[#5A6878] mt-0.5 font-medium">
              Highest volume items ordered
            </p>
          </div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
            Top 5
          </span>
        </div>

        {/* List Content */}
        {displayDishes.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
              <Utensils className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-[#0B253A]">No dish sales recorded yet</p>
            <p className="text-xs text-slate-400 max-w-xs mt-1">
              Popular dishes will automatically rank here based on customer orders.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 mt-2">
            {displayDishes.map((dish, i) => {
              const isFirst = i === 0;
              const isSecond = i === 1;
              const isThird = i === 2;

              return (
                <div
                  key={dish.id || i}
                  className="py-3 flex items-center justify-between gap-3 group hover:bg-[#FAF7F2]/50 px-1 -mx-1 rounded-xl transition-colors"
                >
                  {/* Rank Badge & Dish Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                        isFirst
                          ? 'bg-[#FFF4ED] text-[#E66817] border border-[#FDBA74]/50'
                          : isSecond
                          ? 'bg-slate-100 text-slate-700'
                          : isThird
                          ? 'bg-[#FAF7F2] text-amber-800'
                          : 'text-slate-400 font-semibold'
                      }`}
                    >
                      #{i + 1}
                    </span>

                    <div className="min-w-0">
                      <p className="font-bold text-xs sm:text-[13px] text-[#0B253A] truncate group-hover:text-[#E66817] transition-colors">
                        {dish.name}
                      </p>
                      <p className="text-[11px] text-slate-400 font-medium">
                        {dish.quantitySold} {dish.quantitySold === 1 ? 'serving' : 'servings'} ordered
                      </p>
                    </div>
                  </div>

                  {/* Revenue */}
                  <div className="text-right shrink-0">
                    <span className="font-mono font-black text-xs sm:text-[13px] text-[#0B253A] block">
                      {formatINR(dish.grossRevenue)}
                    </span>
                    <span className="text-[10px] text-emerald-700 font-semibold">
                      Revenue
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer View All CTA */}
      <div className="pt-4 border-t border-slate-100 mt-3">
        <button
          type="button"
          onClick={onViewAll}
          className="w-full py-2.5 px-4 bg-[#FBF9F5] hover:bg-[#F4EFE6] text-xs font-bold text-[#0B253A] rounded-xl border border-[#EBE6DD] hover:border-[#D8D1C3] transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
        >
          <span>View All Ranked Dishes</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#E66817]" />
        </button>
      </div>
    </div>
  );
};
