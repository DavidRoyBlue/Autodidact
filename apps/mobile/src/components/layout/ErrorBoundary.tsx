import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from '../typography/AppText';
import { Button } from '../interactive/Button';
import { Card } from '../display/Card';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
          <Card variant="default">
            <View className="items-center gap-3">
              <AppText variant="body" weight="semibold" className="text-center">
                Something went wrong
              </AppText>
              <AppText variant="muted" className="text-center">
                An unexpected error occurred. Please try again.
              </AppText>
              <Button variant="ghost" size="md" onPress={() => this.setState({ hasError: false })}>
                Try again
              </Button>
            </View>
          </Card>
        </View>
      );
    }
    return this.props.children;
  }
}
