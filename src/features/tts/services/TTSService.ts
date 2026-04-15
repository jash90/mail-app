import TTSManager from 'react-native-sherpa-onnx-offline-tts';
import RNFS from 'react-native-fs';
import { unpack } from 'react-native-nitro-archive';
import {
  TTS_MODELS,
  DEFAULT_LANG,
  getPolishVoiceById,
  polishVoiceToTTSModel,
  type TTSModel,
} from './models';
import { usePolishVoiceStore } from '@/src/shared/store/polishVoiceStore';
import { threadEvents } from '@/src/shared/services/threadEvents';

// Suppress "Sending VolumeUpdate with no listeners" warning from sherpa-onnx
TTSManager.addVolumeListener(() => {});

const BASE_DIR = `${RNFS.DocumentDirectoryPath}/tts-model`;
const CACHE_DIR = `${RNFS.DocumentDirectoryPath}/tts-cache`;

class TTSService {
  private static instance: TTSService | null = null;
  private currentLang: string | null = null;
  private currentModelName: string | null = null;
  private switching: Promise<void> | null = null;

  private constructor() {
    // Subscribe to thread audio cleanup events (decoupled from gmail/modify.ts)
    threadEvents.onAudioCleanup((threadId) => {
      this.deleteEmailAudio(threadId).catch(() => {});
    });
  }

  static shared(): TTSService {
    if (!TTSService.instance) {
      TTSService.instance = new TTSService();
    }
    return TTSService.instance;
  }

  private getModel(lang: string): TTSModel {
    if (__DEV__ && lang === 'pl') {
      const selectedId = usePolishVoiceStore.getState().selectedVoiceId;
      if (selectedId) {
        const voice = getPolishVoiceById(selectedId);
        if (voice) return polishVoiceToTTSModel(voice);
      }
    }
    return TTS_MODELS[lang] ?? TTS_MODELS[DEFAULT_LANG]!;
  }

  async ensureModelForLang(lang: string): Promise<void> {
    const model = this.getModel(lang);
    if (this.currentLang === lang && this.currentModelName === model.modelName)
      return;
    if (this.switching) await this.switching;

    const modelAfterWait = this.getModel(lang);
    if (
      this.currentLang === lang &&
      this.currentModelName === modelAfterWait.modelName
    )
      return;

    this.switching = this._switchModel(lang);
    try {
      await this.switching;
    } finally {
      this.switching = null;
    }
  }

  private async _switchModel(lang: string): Promise<void> {
    // Deinitialize current model if any
    if (this.currentLang) {
      TTSManager.deinitialize();
      this.currentLang = null;
      this.currentModelName = null;
    }

    const model = this.getModel(lang);
    await this._ensureModelDownloaded(model);
    this._initializeEngine(model);
    this.currentLang = lang;
    this.currentModelName = model.modelName;
  }

  private async _ensureModelDownloaded(model: TTSModel): Promise<void> {
    await RNFS.mkdir(BASE_DIR);

    const modelDir = `${BASE_DIR}/${model.modelName}`;
    const onnxPath = `${modelDir}/${model.onnxFile}`;

    if (await RNFS.exists(onnxPath)) return;

    // Clean up partial state
    await RNFS.unlink(modelDir).catch(() => {});

    const archivePath = `${BASE_DIR}/${model.modelName}.tar.bz2`;
    await RNFS.unlink(archivePath).catch(() => {});

    // Download
    const { promise } = RNFS.downloadFile({
      fromUrl: model.url,
      toFile: archivePath,
    });
    const result = await promise;
    if (result.statusCode !== 200) {
      await RNFS.unlink(archivePath).catch(() => {});
      throw new Error(`Model download failed (HTTP ${result.statusCode})`);
    }

    // Extract
    const res = await unpack(archivePath, BASE_DIR, true);
    if (!res.success) {
      await RNFS.unlink(archivePath).catch(() => {});
      throw new Error(`Extraction failed: ${res.errorMessage || 'unknown'}`);
    }

    // Cleanup archive
    await RNFS.unlink(archivePath).catch(() => {});
  }

  private _initializeEngine(model: TTSModel): void {
    const modelDir = `${BASE_DIR}/${model.modelName}`;
    const config = JSON.stringify({
      modelPath: `${modelDir}/${model.onnxFile}`,
      tokensPath: `${modelDir}/tokens.txt`,
      dataDirPath: `${modelDir}/espeak-ng-data`,
    });
    TTSManager.initialize(config);
  }

  private cacheDirReady = false;

  private async ensureCacheDir(): Promise<void> {
    if (this.cacheDirReady) return;
    await RNFS.mkdir(CACHE_DIR);
    this.cacheDirReady = true;
  }

  private getCachePath(emailId: string): string {
    const safe = emailId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${CACHE_DIR}/${safe}.wav`;
  }

  async getOrGenerateEmailAudio(
    emailId: string,
    text: string,
    lang: string,
  ): Promise<string> {
    await Promise.all([this.ensureModelForLang(lang), this.ensureCacheDir()]);

    const path = this.getCachePath(emailId);
    if (await RNFS.exists(path)) {
      return path;
    }

    const generatedPath: string = await TTSManager.generateAndSave(
      text,
      path,
      'wav',
    );
    return generatedPath;
  }

  async deleteEmailAudio(emailId: string): Promise<void> {
    await RNFS.unlink(this.getCachePath(emailId)).catch(() => {});
  }

  async clearCache(): Promise<void> {
    await RNFS.unlink(CACHE_DIR).catch(() => {});
    await RNFS.mkdir(CACHE_DIR);
    this.cacheDirReady = true;
  }

  async ensureModelDownloaded(model: TTSModel): Promise<void> {
    await this._ensureModelDownloaded(model);
  }

  invalidateCurrentModel(): void {
    this.currentLang = null;
    this.currentModelName = null;
  }

  destroy(): void {
    TTSManager.deinitialize();
    this.currentLang = null;
    this.currentModelName = null;
  }
}

export { TTSService };
