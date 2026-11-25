import * as React from 'react';
import { TextInput } from 'react-native';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<
  React.ElementRef<typeof TextInput>,
  React.ComponentPropsWithoutRef<typeof TextInput> & { className?: string }
>(({ className, placeholderClassName, ...props }, ref) => (
  <TextInput
    ref={ref}
    className={cn(
      'rounded-lg border border-input bg-card px-4 text-md text-foreground',
      // A multiline input grows with its text; a single line keeps the touch height.
      props.multiline ? 'min-h-12 py-3' : 'h-12',
      props.editable === false && 'opacity-50',
      className,
    )}
    placeholderClassName={cn('text-muted-foreground', placeholderClassName)}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
