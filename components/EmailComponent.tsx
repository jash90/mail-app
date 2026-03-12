import React from 'react';
import { TouchableOpacity, View, Text } from 'react-native';

type EmailItemProps = {
  item: {
    name: string;
    email: string;
    subject: string;
    snippet: string;
    isUnread: boolean;
    sentAt: string;
  };
  onPress?: () => void;
  onLongPress?: () => void;
};

const EmailComponent: React.FC<EmailItemProps> = ({ item, onPress, onLongPress }) => (
  <TouchableOpacity
    className="w-full border-b border-gray-700 px-1 py-3"
    onPress={onPress}
    onLongPress={onLongPress}
    activeOpacity={0.7}
  >
    <View className="flex-row items-center justify-between">
      <Text
        className={`flex-1 text-base text-white ${item.isUnread ? 'font-bold' : 'font-light'}`}
      >
        {item.name}
      </Text>
      <Text className="w-[80px] text-right text-xs font-light text-gray-300">
        {item.sentAt}
      </Text>
    </View>
    <Text
      className={`text-xs text-gray-300 ${item.isUnread ? 'font-bold' : 'font-light'}`}
    >
      {item.subject}
    </Text>
    <Text
      className="text-xs text-gray-400"
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {item.snippet}
    </Text>
  </TouchableOpacity>
);

export default EmailComponent;
