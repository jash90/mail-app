import type { EmailLabel } from '@/types';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useCallback, useMemo } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SYSTEM_LABEL_ORDER = ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'SPAM', 'TRASH'];

const LABEL_DISPLAY_NAMES: Record<string, string> = {
  INBOX: 'Inbox',
  SENT: 'Sent',
  DRAFT: 'Drafts',
  TRASH: 'Trash',
  STARRED: 'Starred',
  SPAM: 'Spam',
  UNREAD: 'Unread',
  IMPORTANT: 'Important',
  CATEGORY_PERSONAL: 'Personal',
  CATEGORY_SOCIAL: 'Social',
  CATEGORY_PROMOTIONS: 'Promotions',
  CATEGORY_UPDATES: 'Updates',
  CATEGORY_FORUMS: 'Forums',
};

export function getLabelDisplayName(labelId: string, labels?: EmailLabel[]): string {
  if (LABEL_DISPLAY_NAMES[labelId]) return LABEL_DISPLAY_NAMES[labelId];
  const label = labels?.find((l) => l.id === labelId);
  return label?.name ?? labelId;
}

const LABEL_ICONS: Record<string, string> = {
  INBOX: 'envelope',
  SENT: 'paper-plane',
  DRAFT: 'note',
  TRASH: 'trash',
  STARRED: 'star',
  SPAM: 'ban',
};

interface FolderPickerModalProps {
  visible: boolean;
  onClose: () => void;
  labels: EmailLabel[];
  selectedLabel: string;
  onSelect: (labelId: string) => void;
}

export default function FolderPickerModal({
  visible,
  onClose,
  labels,
  selectedLabel,
  onSelect,
}: FolderPickerModalProps) {
  const sortedLabels = useMemo(() => {
    const ordered = labels
      .filter((l) => SYSTEM_LABEL_ORDER.includes(l.id))
      .sort((a, b) => SYSTEM_LABEL_ORDER.indexOf(a.id) - SYSTEM_LABEL_ORDER.indexOf(b.id));
    const otherSystem = labels
      .filter((l) => l.type === 'system' && !SYSTEM_LABEL_ORDER.includes(l.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    const user = labels
      .filter((l) => l.type === 'user')
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...ordered, ...otherSystem, ...user];
  }, [labels]);

  const handleSelect = useCallback(
    (labelId: string) => {
      onSelect(labelId);
      onClose();
    },
    [onSelect, onClose],
  );

  const renderItem = useCallback(
    ({ item }: { item: EmailLabel }) => {
      const isActive = item.id === selectedLabel;
      const iconName = LABEL_ICONS[item.id] ?? 'tag';
      return (
        <Pressable
          onPress={() => handleSelect(item.id)}
          className={`flex-row items-center gap-4 rounded-xl px-4 py-3 ${isActive ? 'bg-indigo-500/20' : ''}`}
        >
          <Icon name={iconName as any} size={18} color={isActive ? '#818cf8' : '#a1a1aa'} />
          <Text className={`flex-1 text-base ${isActive ? 'font-semibold text-indigo-400' : 'text-white'}`}>
            {LABEL_DISPLAY_NAMES[item.id] ?? item.name}
          </Text>
          {item.unread_count != null && item.unread_count > 0 && (
            <Text className="text-xs text-zinc-500">{item.unread_count}</Text>
          )}
        </Pressable>
      );
    },
    [selectedLabel, handleSelect],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="max-h-[85%] rounded-t-3xl bg-zinc-900">
          <View className="flex-row items-center justify-between px-5 pb-2 pt-5">
            <Text className="text-lg font-bold text-white">Folders</Text>
            <Pressable onPress={onClose} className="items-center justify-center rounded-2xl p-2">
              <Icon name="close" size={20} color="white" />
            </Pressable>
          </View>
          <FlatList
            data={sortedLabels}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 8 }}
            ListFooterComponent={<SafeAreaView edges={['bottom']} />}
          />
        </View>
      </View>
    </Modal>
  );
}
