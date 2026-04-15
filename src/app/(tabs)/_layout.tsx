import Icon from '@expo/vector-icons/SimpleLineIcons';
import { Tabs } from 'expo-router';

export { default as ErrorBoundary } from '@/src/shared/components/ErrorScreen';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopColor: '#27272a',
        },
        tabBarIconStyle: {
          margin: 10,
        },
        tabBarActiveTintColor: '#818cf8',
        tabBarInactiveTintColor: '#71717a',
        tabBarShowLabel: false,
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen
        name="list"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, size }) => (
            <Icon name="folder" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="summary"
        options={{
          title: 'Summary',
          tabBarIcon: ({ color, size }) => (
            <Icon name="magic-wand" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, size }) => (
            <Icon name="chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Icon name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
