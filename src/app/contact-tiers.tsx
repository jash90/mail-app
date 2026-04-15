import { StyledSafeAreaView } from '@/src/shared/components/StyledSafeAreaView';
import { DismissableErrorBoundary } from '@/src/shared/components/DismissableErrorBoundary';
import { getAllParticipantNames } from '@/src/shared/db/repositories/participants';
import {
  getContactImportanceDetails,
  type ContactImportanceDetail,
} from '@/src/shared/db/repositories/stats/contactImportance';
import { useAuthStore } from '@/src/shared/store/authStore';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlashList } from '@shopify/flash-list';
import { Pressable, Text, View } from 'react-native';

export { DismissableErrorBoundary as ErrorBoundary };

interface ContactTierRow extends ContactImportanceDetail {
  name: string | null;
}

const TIER_COLORS: Record<number, string> = {
  5: 'bg-indigo-500',
  4: 'bg-blue-500',
  3: 'bg-emerald-500',
  2: 'bg-zinc-500',
  1: 'bg-zinc-700',
};

const TIER_LABELS: Record<number, string> = {
  5: 'Top',
  4: 'High',
  3: 'Medium',
  2: 'Low',
  1: 'Minimal',
};

const keyExtractor = (item: ContactTierRow) => item.email;

export default function ContactTiersScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accountId = user?.id ?? '';
  const userEmail = user?.email ?? '';

  const contacts = useMemo(() => {
    if (!accountId || !userEmail) return [];

    const details = getContactImportanceDetails(accountId, userEmail);
    if (details.length === 0) return [];

    const nameMap = getAllParticipantNames();

    const result: ContactTierRow[] = details.map((d) => ({
      ...d,
      name: nameMap.get(d.email) ?? null,
    }));

    result.sort((a, b) => b.tier - a.tier || a.email.localeCompare(b.email));
    return result;
  }, [accountId, userEmail]);

  const renderItem = ({ item }: { item: ContactTierRow }) => (
    <View className="gap-1 px-4 py-3">
      <View className="flex-row items-center gap-3">
        <View
          className={`h-8 w-8 items-center justify-center rounded-full ${TIER_COLORS[item.tier]}`}
        >
          <Text className="text-xs font-bold text-white">{item.tier}</Text>
        </View>
        <View className="flex-1">
          {item.name && (
            <Text className="text-sm font-medium text-white" numberOfLines={1}>
              {item.name}
            </Text>
          )}
          <Text
            className={`text-sm ${item.name ? 'text-zinc-400' : 'text-white'}`}
            numberOfLines={1}
          >
            {item.email}
          </Text>
        </View>
        <Text className="text-xs text-zinc-500">{TIER_LABELS[item.tier]}</Text>
      </View>

      <View className="ml-11 flex-row flex-wrap items-center gap-x-3 gap-y-0.5">
        <Text className="text-xs text-zinc-600">
          {item.receivedCount} received · {item.sentCount} sent
        </Text>
        <Text className="text-xs text-zinc-500">{item.reason}</Text>
      </View>
    </View>
  );

  return (
    <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pt-2 pb-3">
        <Pressable onPress={router.back} hitSlop={8}>
          <Icon name="arrow-left" size={20} color="white" />
        </Pressable>
        <Text className="text-3xl font-bold text-white">Contact Tiers</Text>
      </View>

      {contacts.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-2">
          <Icon name="people" size={40} color="#3f3f46" />
          <Text className="text-base text-zinc-500">No contact data yet</Text>
          <Text className="px-8 text-center text-sm text-zinc-600">
            Tiers are computed from your email exchange history
          </Text>
        </View>
      ) : (
        <FlashList
          data={contacts}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
        />
      )}
    </StyledSafeAreaView>
  );
}
