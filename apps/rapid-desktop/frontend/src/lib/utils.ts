import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS classes, resolving conflicts.
 * This is the standard shadcn/ui utility function.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
