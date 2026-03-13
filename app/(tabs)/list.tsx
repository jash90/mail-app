import EmailComponent from '@/components/EmailComponent';
import { ListSkeleton } from '@/components/skeletons';
import { useThreads, useSync, useTrashThread, useContactImportance } from '@/features/gmail';
import { threadToEmailProps } from '@/lib/threadTransform';
import { useAuthStore } from '@/store/authStore';
import type { EmailThread } from '@/types';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

const StyledSafeAreaView = withUniwind(SafeAreaView);

export default function ListScreen() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const accountId = user?.id ?? '';
    const userEmail = user?.email ?? '';

    const { data: threads, isLoading, isError, refetch } = useThreads(accountId, ['INBOX']);
    const { data: importanceMap } = useContactImportance(accountId, userEmail);

    const sync = useSync(accountId);
    const isRefreshing = sync.isPending;

    const handleRefresh = () => {
        sync.mutate(undefined, {
            onSuccess: () => refetch(),
        });
    };

    useEffect(() => {
        if (!isLoading && threads && threads.length === 0) {
            handleRefresh();
        }
    }, [isLoading]);

    const handleCompose = () => {
        router.push('/compose');
    };

    const trashThreadMutation = useTrashThread(accountId);

    const handleDelete = (thread: EmailThread) => {
        const sender = thread.participants[0]?.name ?? thread.participants[0]?.email ?? 'Unknown';
        Alert.alert('Delete message', `From: ${sender}\n${thread.subject}`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => trashThreadMutation.mutate(thread.id) },
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
        <StyledSafeAreaView className="flex-1 bg-black p-4" edges={['top']}>
            <Text className="self-start p-2 text-center text-4xl font-bold text-white">
                AI Mail
            </Text>

            {!isLoading ? <FlatList
                data={threads ?? []}
                keyExtractor={(item) => item.id}
                refreshControl={
                    <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="white" colors={['white']} />
                }
                renderItem={({ item }) => (
                    <EmailComponent
                        item={threadToEmailProps(item, importanceMap)}
                        onPress={() => handleThread(item.id)}
                        onLongPress={() => handleDelete(item)}
                    />
                )}
            /> : null}

            {isLoading ? <ListSkeleton /> : null}

            <TouchableOpacity
                className="absolute right-6 bottom-10 h-16 w-16 items-center justify-center rounded-full bg-white"
                onPress={handleCompose}
            >
                <Icon name="envelope" size={24} color="black" />
            </TouchableOpacity>
        </StyledSafeAreaView>
    );
}
