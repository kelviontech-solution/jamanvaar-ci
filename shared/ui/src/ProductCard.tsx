import React from 'react';
import { MenuItem } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import { Plus } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { sound } from './SoundManager';

export interface ProductCardProps {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
  onSelectDetails?: (item: MenuItem) => void;
  className?: string;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  item,
  onAdd,
  onSelectDetails,
  className = ''
}) => {
  const hasModifiers = item.modifierGroupIds && item.modifierGroupIds.length > 0;

  return (
    <div
      onClick={() => {
        sound.play('click');
        if (onSelectDetails) onSelectDetails(item);
      }}
      className={`group relative bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between cursor-pointer active:scale-[0.99] select-none ${className}`}
    >
      {/* Top Media Area */}
      <div className="relative w-full h-44 sm:h-48 bg-[#F4EFE6] overflow-hidden">
        <img
          src={item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'}
          alt={item.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';
          }}
        />

        {/* Top SKU Badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span className="bg-[#0B253A]/85 backdrop-blur-md text-white text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
            {item.sku}
          </span>
        </div>

        {/* Top Kitchen Station Badge */}
        <div className="absolute top-2.5 right-2.5">
          <span className="bg-black/60 backdrop-blur-md text-white text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md">
            {item.kitchenStation || 'Kitchen'}
          </span>
        </div>

        {/* Dietary Indicator on Bottom Left of Image */}
        <div className="absolute bottom-2.5 left-2.5">
          <StatusBadge status={item.dietaryType} type="dietary" />
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-[#0B253A] line-clamp-1 group-hover:text-[#E66817] transition-colors">
            {item.name}
          </h3>
          <p className="text-xs sm:text-sm text-[#4A5568] mt-1 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        </div>

        {/* Price & Add Action Row */}
        <div className="mt-4 pt-3 border-t border-[#F3EFE6] flex items-center justify-between">
          <div>
            <div className="text-lg sm:text-xl font-black text-[#E66817]">
              {formatINR(item.price)}
              {hasModifiers && <span className="text-xs font-normal text-[#4A5568] ml-1">+</span>}
            </div>
            {hasModifiers && (
              <span className="text-[10px] text-[#8C9BAE] font-medium block">
                Customizable
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              sound.play('add');
              onAdd(item);
            }}
            className="w-10 h-10 rounded-full bg-[#E66817] hover:bg-[#F27A2B] active:bg-[#D1560D] text-white flex items-center justify-center shadow-md shadow-[#E66817]/25 transition-transform active:scale-90"
            title="Add to Cart"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
