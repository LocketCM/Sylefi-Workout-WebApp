import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// cn() — standard shadcn helper. Lets you merge Tailwind classes without conflicts.
// Example: cn('px-2 py-1', condition && 'bg-primary', className)
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
