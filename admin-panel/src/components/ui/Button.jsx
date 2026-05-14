import { cn } from '../../lib/utils';

export function Button({ className, variant = 'primary', size = 'default', ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50',
        {
          'bg-cyan-600 text-white hover:bg-cyan-700 shadow-[0_0_20px_rgba(6,182,212,0.15)]': variant === 'primary',
          'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700': variant === 'secondary',
          'bg-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800': variant === 'ghost',
          'bg-red-600 text-white hover:bg-red-700 shadow-[0_0_20px_rgba(220,38,38,0.15)]': variant === 'danger',
          'h-10 px-4 py-2': size === 'default',
          'h-8 px-3 text-sm': size === 'sm',
          'h-12 px-8': size === 'lg',
          'h-10 w-10 p-0': size === 'icon',
        },
        className
      )}
      {...props}
    />
  );
}
