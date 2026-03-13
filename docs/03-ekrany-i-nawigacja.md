# Część 3: Ekrany aplikacji i nawigacja

**Commity:** `c5145dc` → `41b5e1a` → `94654f3` → `8bd8dda` → `fd6685d`
**Zakres pracy:** Pierwszy działający UI, wszystkie ekrany, iteracja nad layoutem i performance

---

## 3.1 Pierwszy działający UI

**Commit `c5145dc`** — feat: add app screens and navigation (8 plików, +943 linii)

> **BUILD & SCREENSHOTS:** Commit `c5145dc` to pierwszy moment, w którym aplikacja ma pełne UI. Zbuduj z tego commita aby zrobić screenshoty ekranów: login, inbox, thread, compose, settings.
>
> ```bash
> git checkout c5145dc
> npx expo start
> ```

### Root layout z auth guardem (`app/_layout.tsx`)

```typescript
export default function RootLayout() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const tokens = await getStoredTokens('gmail');
      if (tokens) {
        useAuthStore.getState().setUser(tokens.user!);
        router.replace('/list');
      } else {
        router.replace('/login');
      }
    })();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="list" />
        <Stack.Screen name="thread/[id]" />
        <Stack.Screen name="compose" />
        <Stack.Screen name="settings" />
      </Stack>
    </QueryClientProvider>
  );
}
```

### Ekran logowania (`app/login.tsx`)

Minimalistyczny ekran z Google Sign-In:

```typescript
const handleSignIn = async () => {
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  const { accessToken } = await GoogleSignin.getTokens();

  await storeTokens('gmail', {
    access_token: accessToken,
    refresh_token: '',
    expiry_time: Date.now() + 3600_000,
    user: response.data?.user,
  });

  useAuthStore.getState().setUser(response.data?.user);
  router.replace('/list');
};
```

### Lista emaili (`app/list.tsx`)

Pierwszy ekran po zalogowaniu — FlatList z wątkami:

```typescript
export default function ListScreen() {
  const user = useAuthStore((s) => s.user);
  const accountId = user?.id ?? '';
  const { data: threads, isLoading } = useThreads(accountId);
  const { mutate: sync, isPending: syncing } = useSync(accountId);

  return (
    <SafeAreaView>
      <FlatList
        data={threads}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/thread/${item.id}`)}>
            <EmailComponent thread={item} />
          </TouchableOpacity>
        )}
        refreshing={syncing}
        onRefresh={() => sync()}
      />
      {/* FAB for compose */}
      <TouchableOpacity onPress={() => router.push('/compose')}>
        <Icon name="pencil" size={24} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
```

### Widok wątku (`app/thread/[id].tsx` — 325 linii)

Najbardziej złożony ekran — konwersacja email z WebView i AI:

```typescript
export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [message, setMessage] = useState('');
  const [webViewHeights, setWebViewHeights] = useState<Record<string, number>>({});

  // Inline helper — later extracted to lib/
  function formatRelativeDate(dateString: string): string {
    const diffMins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    // ...
  }

  // Inline HTML wrapper — later extracted to lib/emailHtml.ts
  const heightScript = `(function() { ... })(); true;`;

  // WebView per message with dynamic height
  {messages?.map((msg) => (
    <WebView
      source={{ html: wrapHtml(msg.body.html) }}
      injectedJavaScript={heightScript}
      onMessage={(e) => {
        const { height } = JSON.parse(e.nativeEvent.data);
        setWebViewHeights(prev => ({ ...prev, [msg.id]: height }));
      }}
      style={{ height: webViewHeights[msg.id] ?? 100 }}
    />
  ))}

  // Reply bar with AI button
  <TextInput value={message} onChangeText={setMessage} />
  <TouchableOpacity onPress={handleReply}><Icon name="paper-plane" /></TouchableOpacity>
  <TouchableOpacity onPress={handleAIReply}><Icon name="magic-wand" /></TouchableOpacity>
}
```

### Komponowanie (`app/compose.tsx`)

```typescript
// Contact autocomplete with 300ms debounce
const { data: contacts } = useSearchContacts(accountId, searchQuery);

// AI-assisted writing
const handleAI = async () => {
  const result = await generateEmail(body, { email: toEmail }, subject);
  setBody(result);
};
```

---

## 3.2 Iteracja i poprawki

**Commit `94654f3`** — refactor: optimize layout and thread components (3 pliki)
- Poprawa obsługi tokenów (lepszy error handling)
- Optymalizacja thread screen (responsiveness)
- Poprawki layoutu settings

**Commit `8bd8dda`** — fix: resolve UI layout issues (1 plik)
- Poprawki wizualne i performance

**Commit `fd6685d`** — chore: remove GitHub Actions workflow (1 plik)
- Usunięcie CI/CD workflow (TestFlight build)

---

## Screenshoty

> **Commit do builda: `c5145dc`** — pierwszy pełny UI z ekranami login, inbox, thread, compose, settings.
>
> Alternatywnie **`94654f3`** — po poprawkach layoutu (wersja dopracowana).
>
> ```bash
> git checkout 94654f3
> npx expo start
> # Screenshoty: Login → Inbox (lista emaili) → Thread (konwersacja) → Compose → Settings
> ```
