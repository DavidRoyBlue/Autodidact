import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { AppText } from '../typography/AppText';

/** The teacher's bubble while a reply is on its way. */
export function TypingIndicator() {
  const pulse = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View className="self-start flex-row items-center gap-3 rounded-lg rounded-bl-sm border border-border bg-assistant-bubble px-4 py-3">
      <Animated.View style={{ opacity: pulse }} className="flex-row gap-1">
        {[0, 1, 2].map((i) => (
          <View key={i} className="h-2 w-2 rounded-full bg-primary" />
        ))}
      </Animated.View>
      <AppText variant="caption">Your teacher is thinking</AppText>
    </View>
  );
}
