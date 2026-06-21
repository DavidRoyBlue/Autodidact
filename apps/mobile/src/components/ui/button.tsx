import * as React from 'react';
import { Pressable } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'flex-row items-center justify-center rounded-md active:opacity-75',
  {
    variants: {
      variant: {
        primary: 'bg-primary',
        danger: 'bg-destructive',
        ghost: 'bg-transparent border border-border',
      },
      size: {
        sm: 'px-3 py-2 h-9',
        md: 'px-4 py-3 h-11',
        lg: 'px-4 py-4 h-[52px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

const buttonTextVariants = cva('font-semibold', {
  variants: {
    variant: {
      primary: 'text-primary-foreground',
      danger: 'text-primary-foreground',
      ghost: 'text-foreground',
    },
    size: { sm: 'text-md', md: 'text-md', lg: 'text-md' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

type ButtonProps = React.ComponentPropsWithoutRef<typeof Pressable> &
  VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  ({ className, variant, size, disabled, ...props }, ref) => (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        ref={ref}
        className={cn(buttonVariants({ variant, size }), disabled && 'opacity-40', className)}
        disabled={disabled}
        {...props}
      />
    </TextClassContext.Provider>
  ),
);
Button.displayName = 'Button';

export { Button, buttonVariants, buttonTextVariants };
export type { ButtonProps };
