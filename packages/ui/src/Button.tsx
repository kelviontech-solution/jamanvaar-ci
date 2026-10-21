import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'touch';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-xl transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 select-none';

  const variants = {
    primary: 'bg-[#0B253A] text-white hover:bg-[#133E5E] focus-visible:ring-[#0B253A] shadow-sm',
    // Darker than the decorative saffron (#E66817, 3.3:1 with white text): white on #BF540F is 4.7:1, the same brand orange Restaurant Admin already uses for actions.
    accent: 'bg-[#BF540F] text-white hover:bg-[#A9480C] active:bg-[#933E0A] focus-visible:ring-[#BF540F] shadow-md shadow-[#BF540F]/20',
    secondary: 'bg-white text-[#0B253A] border border-[#EBE6DD] hover:bg-[#F8F6F0] focus-visible:ring-[#0B253A] shadow-sm',
    outline: 'bg-transparent text-[#0B253A] border-2 border-[#0B253A] hover:bg-[#0B253A]/5 focus-visible:ring-[#0B253A]',
    danger: 'bg-[#DC2626] text-white hover:bg-[#B91C1C] focus-visible:ring-[#DC2626]',
    ghost: 'bg-transparent text-[#4A5568] hover:bg-black/5 hover:text-[#0B253A]'
  };

  const sizes = {
    sm: 'min-h-11 px-3 py-2 text-sm gap-1.5',
    md: 'min-h-11 px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3.5 text-base gap-2.5',
    xl: 'px-8 py-4 text-lg gap-3',
    touch: 'px-8 py-5 text-xl font-bold rounded-2xl gap-3 shadow-lg' // Touch-optimized for customer kiosk
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <svg aria-hidden="true" className="animate-spin -ml-1 mr-2 h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
      ) : leftIcon ? (
        <span className="flex-shrink-0">{leftIcon}</span>
      ) : null}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
    </button>
  );
};
