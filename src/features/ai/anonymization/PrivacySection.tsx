import { Pressable, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { usePrivacyModel } from './usePrivacyModel';

/**
 * Settings section showing the PII Detector model state and download CTA.
 *
 * The PII Detector is OPTIONAL as of v2.2. Cloud AI works out of the box
 * with the regex + quote-strip + sensitive-topic gate floor. Installing
 * the detector adds an extra NER layer that catches prose names, places,
 * and organizations — the only category of PII the regex floor can't
 * cover. Structured identifiers (email, phone, PESEL, IBAN, card, etc.)
 * are protected deterministically regardless of whether this model is
 * installed.
 */
export function PrivacySection() {
  const { installed, downloading, progress, sizeMB, download, remove } =
    usePrivacyModel();

  return (
    <View className="mt-6">
      <Text className="mb-2 text-base font-semibold text-white">Privacy</Text>

      <View className="rounded-xl bg-zinc-900 p-4">
        <View className="flex-row items-start gap-3">
          <Icon name="shield" size={18} color="#60a5fa" />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-white">
              PII Detector ({sizeMB} MB){' '}
              <Text className="text-xs font-normal text-zinc-500">
                — opcjonalny
              </Text>
            </Text>
            <Text className="mt-1 text-xs leading-relaxed text-zinc-400">
              Dodatkowa warstwa wykrywania imion, miejsc i organizacji w treści
              emaila. Struktury jak PESEL, IBAN, telefony, karty są chronione
              deterministycznie bez tego modelu.
            </Text>
          </View>
        </View>

        <PrivacyStatusRow
          installed={installed}
          downloading={downloading}
          progress={progress}
          onDownload={download}
          onRemove={remove}
        />

        <PrivacyDisclosureList />
        <PrivacyNotProtectedList />
      </View>
    </View>
  );
}

function PrivacyStatusRow(props: {
  installed: boolean;
  downloading: boolean;
  progress: number;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const { installed, downloading, progress, onDownload, onRemove } = props;

  if (downloading) {
    return (
      <View className="mt-4 rounded-lg bg-zinc-800 p-3">
        <Text className="text-xs text-zinc-400">
          Pobieranie... {Math.round(progress * 100)}%
        </Text>
        <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-700">
          <View
            className="h-full bg-blue-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </View>
      </View>
    );
  }

  if (installed) {
    return (
      <View className="mt-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Icon name="check" size={14} color="#4ade80" />
          <Text className="text-sm text-green-400">Zainstalowano</Text>
        </View>
        <Pressable
          className="rounded-lg bg-zinc-800 px-3 py-1.5"
          onPress={onRemove}
        >
          <Text className="text-xs text-red-400">Usuń</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="mt-4">
      <Text className="mb-2 text-xs leading-relaxed text-zinc-500">
        Nie musisz pobierać tego modelu — Cloud AI działa od razu z ochroną
        struktur (PESEL, IBAN, telefony, karty, etc.).
      </Text>
      <Pressable className="rounded-lg bg-zinc-800 p-3" onPress={onDownload}>
        <Text className="text-center text-sm font-semibold text-white">
          Pobierz dodatkową warstwę
        </Text>
      </Pressable>
    </View>
  );
}

function PrivacyDisclosureList() {
  const items = [
    'Adresy e-mail',
    'Numery telefonów (PL mobilne, stacjonarne, międzynarodowe)',
    'PESEL, NIP, REGON, KRS, IBAN',
    'Dowód osobisty, paszport, tablice rejestracyjne',
    'Daty (urodzenia, dokumentów)',
    'Adresy IP (v4 + v6), adresy MAC',
    'Współrzędne GPS',
    'Kwoty pieniężne (PLN, EUR, USD)',
    'Kody pocztowe',
    'Numery kart płatniczych',
    'Linki zawierające tokeny autoryzacyjne',
    'Cytowane wiadomości z wcześniejszych odpowiedzi',
    'Imiona, miejsca i organizacje (gdy model NER jest zainstalowany)',
  ];

  return (
    <View className="mt-4 border-t border-zinc-800 pt-3">
      <Text className="mb-2 text-xs font-semibold text-zinc-500 uppercase">
        Co jest anonimizowane
      </Text>
      {items.map((item) => (
        <View key={item} className="flex-row items-center gap-2 py-0.5">
          <Text className="text-xs text-zinc-500">•</Text>
          <Text className="flex-1 text-xs text-zinc-400">{item}</Text>
        </View>
      ))}
    </View>
  );
}

function PrivacyNotProtectedList() {
  const items = [
    'Dane zdrowotne (diagnoza, leczenie, leki)',
    'Przynależność religijna',
    'Orientacja seksualna / tożsamość płciowa',
    'Poglądy polityczne',
    'Pochodzenie etniczne',
    'Dane biometryczne i genetyczne',
    'Członkostwo w związkach zawodowych',
    'Wyroki skazujące i przestępstwa (RODO Art. 10)',
  ];

  return (
    <View className="mt-4 border-t border-zinc-800 pt-3">
      <Text className="mb-2 text-xs font-semibold text-amber-400 uppercase">
        Co NIE jest chronione
      </Text>
      <Text className="mb-2 text-xs leading-relaxed text-zinc-400">
        Wykrycie tych kategorii w treści wyłącza Cloud AI dla tej wiadomości —
        przełącz na model lokalny, aby ją przetworzyć.
      </Text>
      {items.map((item) => (
        <View key={item} className="flex-row items-center gap-2 py-0.5">
          <Text className="text-xs text-zinc-500">•</Text>
          <Text className="flex-1 text-xs text-zinc-400">{item}</Text>
        </View>
      ))}
      <Text className="mt-2 text-xs leading-relaxed text-zinc-500 italic">
        Ten pipeline chroni ustrukturyzowane dane osobowe. Nie jest audit-grade
        dla RODO Art. 9.
      </Text>
    </View>
  );
}
