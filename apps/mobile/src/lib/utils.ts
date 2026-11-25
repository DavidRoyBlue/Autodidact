import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind.config.js adds font sizes tailwind-merge doesn't know; without this it
// reads `text-h1` as a color and drops `text-foreground` (black text on dark).
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['md', 'h1', 'h2', 'h3'] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
