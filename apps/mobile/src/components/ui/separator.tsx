import * as React from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/utils';

const Separator = React.forwardRef<
  React.ElementRef<typeof View>,
  React.ComponentPropsWithoutRef<typeof View> & { orientation?: 'horizontal' | 'vertical' }
>(({ className, orientation = 'horizontal', ...props }, ref) => (
  <View
    ref={ref}
    className={cn('bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
    {...props}
  />
));
Separator.displayName = 'Separator';

export { Separator };
