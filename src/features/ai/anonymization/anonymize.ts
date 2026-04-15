import type { ChatMessage, EmailContext } from '../types';
import { PlaceholderMap } from './placeholders';
import { applyRegexAnonymization } from './regex';
import { stripQuotes } from './stripQuotes';
import { applyNer, type NerInferenceFn } from './ner';

export interface AnonymizeOptions {
  /** Abort signal propagated to the NER pass. */
  signal?: AbortSignal;
  /**
   * Structured email context. When provided, role-tag placeholders for
   * recipient and sender are pre-seeded into the map. Any occurrence of the
   * real values in message bodies is then replaced with the role tag during
   * the forward pass, guaranteeing the model never sees those names — even
   * if NER would have missed them.
   */
  ctx?: EmailContext;
  /**
   * NER inference callback (typically `runNerInference` from `nerContext.ts`).
   *
   * When provided, the pipeline runs a NER pass after regex detection to
   * catch prose names / places / orgs. When omitted, NER is skipped and
   * the pipeline relies on regex + quote stripping only. The post-pipeline
   * regex re-scan in `anonymizingCloud` is still the deterministic safety
   * floor either way.
   *
   * Caller must hold the AI resource lock for the duration of this call
   * when `runNerInference` is provided — NER loads a llama.rn model.
   */
  runNerInference?: NerInferenceFn;
}

export interface AnonymizeResult {
  /**
   * Input messages with non-system content replaced by anonymized text.
   * System messages are passed through untouched — they never contain PII.
   */
  anonMessages: ChatMessage[];
  /**
   * The shared placeholder map used across all messages in this request.
   * Pass this to `deAnonymize` to restore originals in the AI response.
   */
  map: PlaceholderMap;
}

/**
 * Run the anonymization pipeline on a sequence of chat messages.
 *
 * Pipeline (per non-system message):
 *   1. Strip quoted-reply history (`stripQuotes`)
 *   2. Regex pass — email / phone / PESEL / NIP / IBAN / ZIP / URL / card
 *   3. NER pass — prose names, places, orgs (added in step 4)
 *   4. Apply seeded role tags via `map.applyForward` so recipient/sender
 *      names in the body collapse into `<RECIPIENT_1>` / `<SENDER_1>`.
 *
 * The placeholder map is shared across all messages in a single call so
 * identical values reuse the same token — `<NAME_1>` means the same person
 * whether it appears in the system context or three messages later.
 */
export async function anonymizeMessages(
  messages: ChatMessage[],
  options: AnonymizeOptions = {},
): Promise<AnonymizeResult> {
  const map = new PlaceholderMap();

  if (options.ctx) {
    seedContextTags(map, options.ctx);
  }

  const anonMessages: ChatMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      anonMessages.push(msg);
      continue;
    }

    let content = msg.content;
    content = stripQuotes(content);
    content = applyRegexAnonymization(content, map);
    if (options.runNerInference) {
      content = await applyNer(
        content,
        map,
        options.runNerInference,
        options.signal,
      );
    }
    // Final forward pass catches any seeded role tags (or entries allocated
    // in earlier messages) that still appear in this body.
    content = map.applyForward(content);

    anonMessages.push({ ...msg, content });
  }

  return { anonMessages, map };
}

/**
 * Pre-populate the placeholder map with role tags from the structured email
 * context. After this, any occurrence of the recipient's display name or
 * the sender's name in a message body will be replaced with `<RECIPIENT_1>`
 * / `<SENDER_1>` during the forward pass.
 */
function seedContextTags(map: PlaceholderMap, ctx: EmailContext): void {
  const fromDisplay = formatFromDisplay(ctx);
  if (fromDisplay) {
    map.allocate('RECIPIENT', fromDisplay);
  }

  const fromName = ctx.from?.name?.trim();
  if (fromName && fromName !== fromDisplay) {
    // Register the bare name separately so it also collapses to the tag.
    map.allocate('RECIPIENT', fromName);
  }

  const fromEmail = ctx.from?.email?.trim();
  if (fromEmail) {
    map.allocate('RECIPIENT', fromEmail);
  }

  const senderName = formatSenderName(ctx);
  if (senderName) {
    map.allocate('SENDER', senderName);
  }
}

function formatFromDisplay(ctx: EmailContext): string | null {
  const name = ctx.from?.name?.trim() ?? '';
  const email = ctx.from?.email?.trim() ?? '';
  if (!name && !email) return null;
  if (name && email) return `${name} <${email}>`;
  return name || email;
}

function formatSenderName(ctx: EmailContext): string | null {
  const given = ctx.user?.givenName?.trim() ?? '';
  const family = ctx.user?.familyName?.trim() ?? '';
  const name = `${given} ${family}`.trim();
  return name || null;
}
