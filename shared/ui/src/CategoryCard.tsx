import React from 'react';
import { Category } from '@jamanvaar/types';
import * as Icons from 'lucide-react';
import { sound } from './SoundManager';

export interface CategoryCardProps {
  category: Category;
  isSelected?: boolean;
  onSelect: (category: Category) => void;
  className?: string;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  isSelected = false,
  onSelect,
  className = ''
}) => {
  // Dynamically resolve icon if provided
  const IconComponent = (category.iconName && (Icons as any)[category.iconName])
    ? (Icons as any)[category.iconName]
    : Icons.Utensils;

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
      <IconComponent className={`w-4 h-4 ${isSelected ? 'text-[#E66817]' : 'text-[#4A5568]'}`} />
      <span>{category.name}</span>
    </button>
  );
};
