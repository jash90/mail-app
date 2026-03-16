import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import {
  useAiSettingsStore,
  type AiProviderType,
  type ModelStatus,
} from '@/store/aiSettingsStore';
import { resetTokens } from '@/features/auth/oauthService';
import { clearTokenCache } from '@/features/gmail';
import {
  AVAILABLE_MODELS,
  deleteModelFiles,
  getModelById,
} from '@/features/ai/local/model-manager';
import { useModelDownload } from '@/features/ai/local/hooks';
import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';

const PROVIDER_OPTIONS: {
  value: AiProviderType;
  label: string;
  desc: string;
}[] = [
  {
    value: 'auto',
    label: 'Auto',
    desc: 'Lokalny jeśli gotowy, inaczej Cloud',
  },
  {
    value: 'local',
    label: 'Local',
    desc: 'Tylko lokalny model na urządzeniu',
  },
  { value: 'cloud', label: 'Cloud', desc: 'Z.AI API w chmurze' },
];

export default function SettingsScreen() {
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const clearUser = useAuthStore((s) => s.clearUser);

  const provider = useAiSettingsStore((s) => s.provider);
  const setProvider = useAiSettingsStore((s) => s.setProvider);
  const selectedModelId = useAiSettingsStore((s) => s.selectedModelId);
  const setSelectedModelId = useAiSettingsStore((s) => s.setSelectedModelId);
  const setWantsDownload = useAiSettingsStore((s) => s.setWantsDownload);

  const {
    modelStatus,
    downloadProgress,
    error: modelError,
  } = useModelDownload();

  const handleLogout = () => {
    clearUser();
    clearTokenCache();
    resetTokens();
    router.replace('/');
  };

  const setModelStatus = useAiSettingsStore((s) => s.setModelStatus);

  const handleDeleteModel = async () => {
    const model = getModelById(selectedModelId);
    if (model) {
      await deleteModelFiles(model);
      setModelStatus('not-downloaded');
      setWantsDownload(false);
    }
  };

  const showLocalSettings = provider === 'local' || provider === 'auto';

  return (
    <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
      <ScrollView className="flex-1 p-4">
        <Text className="pb-4 text-left text-3xl font-bold text-white">
          Settings
        </Text>

        <Text className="text-base font-semibold text-white">
          Account Email
        </Text>
        <TextInput
          className="mb-6 h-[50px] rounded-lg bg-zinc-900 p-3 text-base text-white"
          value={user?.email ?? ''}
          editable={false}
        />

        <Text className="mb-3 text-lg font-bold text-white">AI Provider</Text>

        <View className="mb-4 gap-2">
          {PROVIDER_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              className={`rounded-xl p-3 ${
                provider === opt.value
                  ? 'border border-indigo-500 bg-indigo-500/10'
                  : 'bg-zinc-900'
              }`}
              onPress={() => setProvider(opt.value)}
            >
              <Text className="text-base font-semibold text-white">
                {opt.label}
              </Text>
              <Text className="text-sm text-zinc-400">{opt.desc}</Text>
            </Pressable>
          ))}
        </View>

        {showLocalSettings && (
          <View className="mb-6">
            <Text className="mb-2 text-base font-semibold text-white">
              Model
            </Text>

            <View className="gap-2">
              {AVAILABLE_MODELS.map((model) => {
                const isSelected = selectedModelId === model.id;
                return (
                  <Pressable
                    key={model.id}
                    className={`flex-row items-center rounded-xl p-3 ${
                      isSelected
                        ? 'border border-indigo-500 bg-indigo-500/10'
                        : 'bg-zinc-900'
                    }`}
                    onPress={() => setSelectedModelId(model.id)}
                  >
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-white">
                        {model.label}
                      </Text>
                      <Text className="text-xs text-zinc-400">
                        {model.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <ModelCardAction
                        status={modelStatus}
                        downloadProgress={downloadProgress}
                        onDownload={() => setWantsDownload(true)}
                        onDelete={handleDeleteModel}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {modelError && (
              <Text className="mt-2 text-xs text-red-400">{modelError}</Text>
            )}
          </View>
        )}
      </ScrollView>

      <View className="p-4">
        <Pressable className="rounded-2xl bg-white p-4" onPress={handleLogout}>
          <Text className="text-center text-lg font-semibold text-black">
            Logout
          </Text>
        </Pressable>
      </View>
    </StyledSafeAreaView>
  );
}

function ModelCardAction({
  status,
  downloadProgress,
  onDownload,
  onDelete,
}: {
  status: ModelStatus;
  downloadProgress: number;
  onDownload: () => void;
  onDelete: () => void;
}) {
  if (status === 'not-downloaded') {
    return (
      <Pressable onPress={onDownload} className="ml-3 p-1">
        <Ionicons name="cloud-download-outline" size={22} color="#818cf8" />
      </Pressable>
    );
  }

  if (status === 'downloading') {
    return (
      <View className="ml-3 items-center p-1">
        <Text className="text-xs font-medium text-indigo-300">
          {Math.round(downloadProgress * 100)}%
        </Text>
      </View>
    );
  }

  if (status === 'loading') {
    return (
      <View className="ml-3 p-1">
        <ActivityIndicator size="small" color="#818cf8" />
      </View>
    );
  }

  if (status === 'ready' || status === 'downloaded' || status === 'error') {
    return (
      <Pressable onPress={onDelete} className="ml-3 p-1">
        <Ionicons name="trash-outline" size={20} color="#f87171" />
      </Pressable>
    );
  }

  return null;
}
