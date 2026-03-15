import { View } from 'react-native';
import SkeletonRow from './SkeletonRow';

export default function ListSkeleton() {
  return (
    <View className="flex-1 justify-start bg-black">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}
