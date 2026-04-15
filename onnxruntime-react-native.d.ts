/**
 * Minimal ambient declaration for `onnxruntime-react-native`.
 *
 * The real package is a Microsoft-maintained native module that ships with
 * TypeScript types of its own. We declare a subset here so the BERT NER
 * layer can typecheck and run its Jest tests without requiring the native
 * package to be installed — tests mock the module via `tests/setup.ts`.
 *
 * When the package is installed (`bun add onnxruntime-react-native`) and
 * prebuild regenerates the native projects, this shim is shadowed by the
 * package's real types. Deletion of this file becomes a follow-up cleanup
 * once the install ships.
 */
declare module 'onnxruntime-react-native' {
  export type TensorDataType =
    | 'float32'
    | 'float64'
    | 'int8'
    | 'uint8'
    | 'int16'
    | 'uint16'
    | 'int32'
    | 'uint32'
    | 'int64'
    | 'bool'
    | 'string';

  export type TensorTypedArray =
    | Float32Array
    | Float64Array
    | Int8Array
    | Uint8Array
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | BigInt64Array;

  export class Tensor {
    constructor(
      type: TensorDataType,
      data: TensorTypedArray | readonly number[] | readonly bigint[],
      dims: readonly number[],
    );
    readonly type: TensorDataType;
    readonly data: TensorTypedArray;
    readonly dims: readonly number[];
  }

  export interface InferenceSessionOptions {
    executionProviders?: readonly string[];
    graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
    intraOpNumThreads?: number;
    interOpNumThreads?: number;
    logSeverityLevel?: 0 | 1 | 2 | 3 | 4;
    logVerbosityLevel?: number;
  }

  export interface InferenceSessionRunOptions {
    logSeverityLevel?: 0 | 1 | 2 | 3 | 4;
    logVerbosityLevel?: number;
    tag?: string;
  }

  export class InferenceSession {
    static create(
      modelPath: string,
      options?: InferenceSessionOptions,
    ): Promise<InferenceSession>;

    run(
      feeds: Readonly<Record<string, Tensor>>,
      options?: InferenceSessionRunOptions,
    ): Promise<Record<string, Tensor>>;

    release(): Promise<void>;

    readonly inputNames: readonly string[];
    readonly outputNames: readonly string[];
  }
}
