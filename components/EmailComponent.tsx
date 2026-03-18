import React from 'react';
import { Pressable, Text, View } from 'react-native';

type EmailItemProps = {
  item: {
    name: string;
    email: string;
    subject: string;
    snippet: string;
    isUnread: boolean;
    isNewsletter?: boolean;
    isAutoReply?: boolean;
    sentAt: string;
    importance: number; // 1-5
  };
  onPress?: () => void;
  onLongPress?: () => void;
};

const TIER_STYLES = {
  5: { name: 'text-xl', subject: 'text-sm', snippet: 'text-sm text-gray-300' },
  4: { name: 'text-lg', subject: 'text-xs', snippet: 'text-xs text-gray-300' },
  3: {
    name: 'text-base',
    subject: 'text-xs',
    snippet: 'text-xs text-gray-400',
  },
  2: { name: 'text-sm', subject: 'text-xs', snippet: 'text-xs text-gray-500' },
  1: { name: 'text-sm', subject: 'text-xs', snippet: 'text-xs text-gray-500' },
} as const;

const EmailComponent: React.FC<EmailItemProps> = ({
  item,
  onPress,
  onLongPress,
}) => {
  const tier = Math.max(
    1,
    Math.min(5, item.importance),
  ) as keyof typeof TIER_STYLES;
  const styles = TIER_STYLES[tier];
  const weight = item.isUnread ? 'font-bold' : 'font-normal';

  return (
    <Pressable
      className="w-full border-b border-gray-700 px-1 py-3"
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 flex-row items-center gap-1.5">
          <Text
            className={`shrink text-white ${styles.name} ${weight}`}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {item.isNewsletter && (
            <View className="rounded bg-indigo-900/60 px-1.5 py-0.5">
              <Text className="text-[9px] font-semibold text-indigo-300">
                NL
              </Text>
            </View>
          )}
          {item.isAutoReply && (
            <View className="rounded bg-amber-900/60 px-1.5 py-0.5">
              <Text className="text-[9px] font-semibold text-amber-300">
                Auto
              </Text>
            </View>
          )}
        </View>
        <Text className="text-right text-xs font-light text-gray-300">
          {item.sentAt}
        </Text>
      </View>
      <Text className={`text-gray-300 ${styles.subject} ${weight}`}>
        {item.subject}
      </Text>
      <Text className={styles.snippet} numberOfLines={1} ellipsizeMode="tail">
        {item.snippet}
      </Text>
    </Pressable>
  );
};

export default EmailComponent;
