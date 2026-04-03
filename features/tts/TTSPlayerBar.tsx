import { memo, Fragment } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import type { TTSQueueState } from './types';

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

interface TTSPlayerBarProps {
  state: TTSQueueState;
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
}

export const TTSPlayerBar = memo(function TTSPlayerBar({
  state,
  play,
  pause,
  resume,
  stop,
  next,
  prev,
}: TTSPlayerBarProps) {
  const currentTrack =
    state.currentIndex >= 0 ? state.tracks[state.currentIndex] : null;

  const hasContent =
    currentTrack || state.tracks.length > 0 || state.summarizing;
  if (!hasContent) return null;

  return (
    <View className="mx-2 mb-2 rounded-xl bg-zinc-900 px-4 py-3">
      {currentTrack ? (
        <Fragment>
          <View className="flex-row items-center">
            <View className="mr-3 flex-1">
              <Text className="text-xs text-indigo-400" numberOfLines={1}>
                {currentTrack.senderName}
              </Text>
              <Text className="mt-0.5 text-sm text-white" numberOfLines={1}>
                {currentTrack.summarySnippet}
              </Text>
            </View>
            <View className="flex-row items-center gap-4">
              <Pressable onPress={prev} hitSlop={HIT_SLOP}>
                <Icon name="control-rewind" size={16} color="white" />
              </Pressable>
              <Pressable
                onPress={state.isPlaying ? pause : resume}
                hitSlop={HIT_SLOP}
              >
                <Icon
                  name={state.isPlaying ? 'control-pause' : 'control-play'}
                  size={20}
                  color="#818cf8"
                />
              </Pressable>
              <Pressable onPress={next} hitSlop={HIT_SLOP}>
                <Icon name="control-forward" size={16} color="white" />
              </Pressable>
              <Pressable onPress={stop} hitSlop={HIT_SLOP}>
                <Icon name="close" size={14} color="#a1a1aa" />
              </Pressable>
            </View>
          </View>
          {state.isLoading && (
            <ActivityIndicator
              size="small"
              color="#818cf8"
              className="mt-2 self-start"
            />
          )}
          {state.error && (
            <Text className="mt-1 text-xs text-red-400" numberOfLines={1}>
              {state.error}
            </Text>
          )}
        </Fragment>
      ) : state.summarizing && state.tracks.length === 0 ? (
        <View className="flex-row items-center justify-center py-1">
          <ActivityIndicator size="small" color="#818cf8" />
          <Text className="ml-2 text-sm text-zinc-400">
            Preparing summaries...
          </Text>
        </View>
      ) : (
        <View className="flex-row items-center justify-center py-1">
          <Pressable
            onPress={play}
            className="flex-row items-center"
            hitSlop={HIT_SLOP}
          >
            <Icon name="control-play" size={16} color="#818cf8" />
            <Text className="ml-2 text-sm text-zinc-400">
              Play summaries ({state.tracks.length})
            </Text>
          </Pressable>
          {state.summarizing && (
            <ActivityIndicator size="small" color="#818cf8" className="ml-3" />
          )}
        </View>
      )}
    </View>
  );
});
