// Bridge to the native iOS Vision OCR plugin (ios/App/App/TextRecognitionPlugin.swift).
// On-device, free, no AI cost. On web (or Android, or if the plugin is missing) the
// caller falls back to the server OCR endpoint. Safe to import anywhere: registerPlugin
// no-ops on non-native platforms and isNativeOcrAvailable() returns false there.
import { Capacitor, registerPlugin } from '@capacitor/core';

interface TextRecognitionPlugin {
  recognize(options: { base64: string }): Promise<{ text: string }>;
}

const TextRecognition = registerPlugin<TextRecognitionPlugin>('TextRecognition');

/** True inside the native apps where on-device OCR exists: iOS (Vision) and Android (ML Kit). */
export function isNativeOcrAvailable(): boolean {
  try {
    if (!Capacitor.isNativePlatform()) return false;
    const p = Capacitor.getPlatform();
    return p === 'ios' || p === 'android';
  } catch {
    return false;
  }
}

/** Run on-device OCR on a base64 (or data-URL) image. Returns recognised text. */
export async function recognizeTextNative(base64: string): Promise<string> {
  const { text } = await TextRecognition.recognize({ base64 });
  return text || '';
}

/** Read a File into a bare base64 string (no data-URL prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Citire fișier eșuată.'));
    reader.readAsDataURL(file);
  });
}
