import React from 'react';

export interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: string; isPositive: boolean };
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  className = ''
}) => {
  return (
    <div className={`bg-white rounded-2xl p-4 sm:p-5 border border-[#EBE6DD] shadow-sm flex items-center justify-between ${className}`}>
      <div>
        <p className="text-xs font-semibold text-[#8C9BAE] uppercase tracking-wider">
          {title}
        </p>
        <div className="text-2xl sm:text-3xl font-black text-[#0B253A] mt-1">
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-[#4A5568] mt-1">
            {subtitle}
          </p>
        )}
        {trend && (
          <span className={`inline-flex items-center text-xs font-bold mt-1.5 ${trend.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {trend.isPositive ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>

      {icon && (
        <div className="w-12 h-12 rounded-xl bg-[#FBF9F5] border border-[#EBE6DD] flex items-center justify-center text-[#E66817]">
          {icon}
        </div>
      )}
    </div>
  );
};
