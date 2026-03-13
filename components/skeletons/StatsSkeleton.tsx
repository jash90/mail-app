import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

export default function StatsSkeleton() {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View className="flex-1 px-4 pt-4">
      <View className="mb-4 flex-row gap-3">
        {[1, 2, 3].map((i) => (
          <Animated.View key={i} style={animatedStyle} className="h-20 flex-1 rounded-xl bg-zinc-900" />
        ))}
      </View>
      {[1, 2, 3].map((i) => (
        <Animated.View key={i} style={animatedStyle} className="mb-4 h-32 rounded-xl bg-zinc-900" />
      ))}
    </View>
  );
}
