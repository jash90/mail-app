/**
 * Entity categories produced by the anonymization pipeline.
 *
 * Structured categories (EMAIL..CARD) come from deterministic regex detection
 * and are the basis of the post-pipeline safety re-scan. If any of these leak,
 * `anonymizingCloudProvider` hard-fails the request.
 *
 * Unstructured categories (NAME..OTHER) come from NER — best-effort, no
 * guarantee, no safety net beyond "we asked Qwen to find them".
 *
 * Role tags (RECIPIENT, SENDER) replace the known structured fields from
 * `formatContext` so the model can reason about conversation direction
 * without seeing real names.
 */
export type EntityType =
  // Structured, regex-backed — core (v1)
  | 'EMAIL'
  | 'PHONE'
  | 'PESEL'
  | 'NIP'
  | 'IBAN'
  | 'ZIP'
  | 'URL'
  | 'CARD'
  // Structured, regex-backed — Polish-specific (v2)
  | 'REGON'
  | 'DOWOD'
  | 'PLATE'
  // Structured, regex-backed — extended (v2.1)
  | 'PASSPORT'
  | 'KRS'
  | 'IP'
  | 'MAC'
  | 'DATE'
  | 'GPS'
  | 'AMOUNT'
  // Unstructured, NER-backed
  | 'NAME'
  | 'PLACE'
  | 'ORG'
  | 'ID'
  | 'OTHER'
  // Role tags from known-structured context
  | 'RECIPIENT'
  | 'SENDER';

export interface Entity {
  type: EntityType;
  value: string;
  /** Offset into source text when known (regex sets it; NER may not). */
  start?: number;
  end?: number;
}
