import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';
import { db } from '@/db/client';
import { participants } from '@/db/schema';
import { getContactImportanceMap } from '@/db/repositories/stats/contactImportance';
import { useAuthStore } from '@/store/authStore';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

interface ContactTier {
  email: string;
  name: string | null;
  tier: number;
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

const keyExtractor = (item: ContactTier) => item.email;

export default function ContactTiersScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accountId = user?.id ?? '';
  const userEmail = user?.email ?? '';

  const contacts = useMemo(() => {
    if (!accountId || !userEmail) return [];

    const tierMap = getContactImportanceMap(accountId, userEmail);
    if (tierMap.size === 0) return [];

    // Batch-fetch names for all emails
    const allParticipants = db.select().from(participants).all();
    const nameMap = new Map<string, string | null>();
    for (const p of allParticipants) {
      nameMap.set(p.email, p.name);
    }

    const result: ContactTier[] = [];
    for (const [email, tier] of tierMap) {
      result.push({ email, name: nameMap.get(email) ?? null, tier });
    }

    // Sort: tier desc, then alphabetically by email
    result.sort((a, b) => b.tier - a.tier || a.email.localeCompare(b.email));
    return result;
  }, [accountId, userEmail]);

  const renderItem = ({ item }: { item: ContactTier }) => (
    <View className="flex-row items-center gap-3 px-4 py-3">
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
        <FlatList
          data={contacts}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          initialNumToRender={30}
        />
      )}
    </StyledSafeAreaView>
  );
}
