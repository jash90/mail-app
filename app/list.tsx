import EmailComponent from '@/components/EmailComponent';
import { useThreads, useTrashThread } from '@/features/gmail';
import { fixTextEncoding } from '@/features/gmail/helpers';
import { useAuthStore } from '@/store/authStore';
import type { EmailThread } from '@/types';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

const StyledSafeAreaView = withUniwind(SafeAreaView);

function SkeletonRow() {
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

function ListSkeleton() {
    return (
        <View className="flex-1 bg-black justify-start">
            {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} />
            ))}
        </View>
    );
}

function formatRelativeDate(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
}

function threadToEmailProps(thread: EmailThread) {
    const firstParticipant = thread.participants[0];

    return {
        name: fixTextEncoding(firstParticipant?.name ?? firstParticipant?.email ?? 'Unknown'),
        email: firstParticipant?.email ?? '',
        subject: thread.subject,
        snippet: thread.snippet,
        isUnread: !thread.is_read,
        sentAt: formatRelativeDate(thread.last_message_at),
    };
}

export default function ListScreen() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch, isRefetching } =
        useThreads(user?.id ?? '');

    const threads = data?.pages.flatMap((p) => p.threads) ?? [];

    const handleEmpose = () => {
        router.push('/compose');
    };

    const handleSettings = () => {
        router.push('/settings');
    };

    const trashThread = useTrashThread(user?.id ?? '');

    const handleDelete = (thread: EmailThread) => {
        const sender = thread.participants[0]?.name ?? thread.participants[0]?.email ?? 'Unknown';
        Alert.alert('Delete message', `From: ${sender}\n${thread.subject}`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => trashThread.mutate(thread.id) },
        ]);
    };

    const handleThread = (id: string) =>
        router.push({ pathname: '/thread/[id]', params: { id } })

    if (isError) {
        return (
            <StyledSafeAreaView className="flex-1 items-center justify-center bg-black">
                <Text className="text-red-400">Failed to load emails</Text>
            </StyledSafeAreaView>
        );
    }

    return (
        <StyledSafeAreaView className="flex-1 bg-black p-4">
            <View className="flex-row items-center justify-between">
                <Text className="self-start p-2 text-center text-4xl font-bold text-white">
                    AI Mail
                </Text>

                <TouchableOpacity
                    className="items-center justify-center rounded-2xl p-2"
                    onPress={handleSettings}
                >
                    <Icon name="user" size={24} color="white" />
                </TouchableOpacity>
            </View>

            {!isLoading ? <FlatList
                data={threads}
                keyExtractor={(item) => item.id}
                refreshControl={
                    <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="white" colors={['white']} />
                }
                renderItem={({ item }) => (
                    <EmailComponent
                        item={threadToEmailProps(item)}
                        onPress={() => handleThread(item.id)}
                        onLongPress={() => handleDelete(item)}
                    />
                )}
                onEndReached={() => hasNextPage && fetchNextPage()}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                    isFetchingNextPage ? (
                        <ActivityIndicator size="small" color="white" style={{ paddingVertical: 16 }} />
                    ) : null
                }
            /> : null}

            {isLoading ? <ListSkeleton /> : null}

            <TouchableOpacity
                className="absolute right-6 bottom-10 h-16 w-16 items-center justify-center rounded-full bg-white"
                onPress={handleEmpose}
            >
                <Icon name="envelope" size={24} color="black" />
            </TouchableOpacity>
        </StyledSafeAreaView>
    );
}
