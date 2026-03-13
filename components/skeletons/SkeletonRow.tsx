import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

export default function SkeletonRow() {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View className="w-full border-b border-gray-700 px-1 py-3">
      <View className="flex-row items-center justify-between">
        <Animated.View style={animatedStyle} className="h-4 w-[40%] rounded bg-gray-700" />
        <Animated.View style={animatedStyle} className="h-3 w-[60px] rounded bg-gray-700" />
      </View>
      <Animated.View style={animatedStyle} className="mt-2 h-3 w-[70%] rounded bg-gray-700" />
      <Animated.View style={animatedStyle} className="mt-1.5 h-3 w-[90%] rounded bg-gray-700" />
    </View>
  );
}
