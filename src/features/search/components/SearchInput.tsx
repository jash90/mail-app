import { forwardRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Icon from '@expo/vector-icons/SimpleLineIcons';

interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
}

const SearchInput = forwardRef<TextInput, SearchInputProps>(
  ({ value, onChangeText }, ref) => {
    return (
      <View className="mb-3 flex-row items-center rounded-xl bg-white/10 px-4 py-3">
        <Icon name="magnifier" size={16} color="#9ca3af" />
        <TextInput
          ref={ref}
          className="ml-3 flex-1 text-base text-white"
          placeholder="e.g. invoice from john..."
          placeholderTextColor="#6b7280"
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {value.length > 0 && (
          <Pressable onPress={() => onChangeText('')} hitSlop={8}>
            <Icon name="close" size={12} color="#9ca3af" />
          </Pressable>
        )}
      </View>
    );
  },
);

SearchInput.displayName = 'SearchInput';

export default SearchInput;
