import type { PipelinePhase } from '@/features/ai/hooks/useSummaryPipeline';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { ActivityIndicator, Text, View } from 'react-native';

const PHASE_CONFIG: Record<
  PipelinePhase,
  { icon: string; color: string } | null
> = {
  idle: null,
  checking: { icon: 'globe', color: '#818cf8' },
  syncing: { icon: 'cloud-download', color: '#818cf8' },
  selecting: { icon: 'list', color: '#818cf8' },
  summarizing: { icon: 'magic-wand', color: '#818cf8' },
  done: null,
  error: { icon: 'exclamation', color: '#f87171' },
};

interface PhaseBannerProps {
  phase: PipelinePhase;
  detail: string;
}

export function PhaseBanner({ phase, detail }: PhaseBannerProps) {
  const cfg = PHASE_CONFIG[phase];
  if (!cfg || !detail) return null;

  return (
    <View className="mx-4 mb-3 flex-row items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3">
      {phase === 'error' ? (
        <Icon name={cfg.icon as any} size={16} color={cfg.color} />
      ) : (
        <ActivityIndicator size="small" color={cfg.color} />
      )}
      <Text
        className="flex-1 text-sm"
        style={{ color: cfg.color }}
        numberOfLines={2}
      >
        {detail}
      </Text>
    </View>
  );
}
