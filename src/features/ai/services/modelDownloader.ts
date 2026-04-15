import { File, Directory, Paths } from 'expo-file-system';
import { createDownloadResumable } from 'expo-file-system/legacy';
import { LOCAL_MODELS } from '../types';

const MODELS_DIR = new Directory(Paths.document, 'models');

function getModelPath(filename: string): string {
  return new File(MODELS_DIR, filename).uri;
}

export function isModelDownloaded(modelId: string): boolean {
  const model = LOCAL_MODELS.find((m) => m.id === modelId);
  if (!model) return false;
  const file = new File(MODELS_DIR, model.filename);
  if (!file.exists) return false;
  const expectedBytes = model.sizeMB * 1_048_576;
  return file.size >= expectedBytes * 0.9;
}

export async function downloadModel(
  modelId: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  const model = LOCAL_MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`Nieznany model: ${modelId}`);

  if (!MODELS_DIR.exists) {
    MODELS_DIR.create({ intermediates: true });
  }

  const file = new File(MODELS_DIR, model.filename);
  const expectedBytes = model.sizeMB * 1_048_576;

  if (file.exists) {
    if (file.size >= expectedBytes * 0.9) return;
    file.delete();
  }

  const download = createDownloadResumable(model.url, file.uri, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) {
      onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  });

  const result = await download.downloadAsync();
  if (!result) throw new Error('Pobieranie anulowane');

  if (file.size < expectedBytes * 0.9) {
    file.delete();
    throw new Error(
      `Plik modelu jest nieprawidłowy (${Math.round(file.size / 1_048_576)} MB zamiast ~${model.sizeMB} MB). Spróbuj ponownie.`,
    );
  }
}

export function deleteModel(modelId: string): void {
  const model = LOCAL_MODELS.find((m) => m.id === modelId);
  if (!model) return;
  const file = new File(MODELS_DIR, model.filename);
  if (file.exists) {
    file.delete();
  }
}

export function getModelFilePath(modelId: string): string | null {
  const model = LOCAL_MODELS.find((m) => m.id === modelId);
  if (!model) return null;
  return getModelPath(model.filename);
}
