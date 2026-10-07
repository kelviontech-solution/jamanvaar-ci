import React from 'react';
import { Category } from '@jamanvaar/types';
import { MenuCategoryIcon } from './MenuCategoryIcon';
import { sound } from './SoundManager';

export interface CategoryCardProps {
  category: Category;
  isSelected?: boolean;
  onSelect: (category: Category) => void;
  className?: string;
  /** Pre-resolved localized name (see @jamanvaar/utils localizedName) —
   *  falls back to category.name when omitted, so existing callers that
   *  don't pass this see no change at all. */
  displayName?: string;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  isSelected = false,
  onSelect,
  className = '',
  displayName
}) => {
  return (
    <button
      type="button"
      onClick={() => {
        sound.play('click');
        onSelect(category);
      }}
      className={`px-4 py-2.5 rounded-xl font-bold text-sm sm:text-base flex items-center gap-2.5 transition-all duration-200 whitespace-nowrap select-none ${
        isSelected
          ? 'bg-[#0B253A] text-white shadow-md shadow-[#0B253A]/20 scale-[1.02]'
          : 'bg-white text-[#0B253A] border border-[#EBE6DD] hover:bg-[#F8F6F0]'
      } ${className}`}
    >
      <MenuCategoryIcon name={category.name} iconName={category.iconName} />
      <span>{displayName || category.name}</span>
    </button>
  );
};
