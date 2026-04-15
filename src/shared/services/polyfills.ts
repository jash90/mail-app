import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

// Hermes (React Native's JS engine) does not ship DOMException. Libraries
// such as onnxruntime-react-native and AbortController polyfills construct
// `new DOMException(...)` which throws a ReferenceError on Hermes. Shim it
// with the minimum surface the anonymization pipeline needs.
if (typeof globalThis.DOMException === 'undefined') {
  (globalThis as Record<string, unknown>).DOMException =
    class DOMException extends Error {
      readonly code: number;
      constructor(message?: string, name?: string) {
        super(message);
        this.name = name ?? 'Error';
        this.code = 0;
      }
    } as unknown as typeof globalThis.DOMException;
}
