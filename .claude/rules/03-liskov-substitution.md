# Liskov Substitution Principle (LSP)

Any implementation of an interface must be a drop-in replacement — callers must not care which concrete implementation they receive.

## Rules

- **All `AiProvider` implementations must honor the same contract.** `generate()` accepts `ChatMessage[]` + optional `GenerateOptions`, returns `Promise<string>`. A cloud provider, local provider, or anonymizing wrapper must all behave identically from the caller's perspective — same input shape, same output shape, same error semantics.
- **Don't throw implementation-specific errors that callers must special-case.** If `local.ts` throws a llama.rn-specific error, wrap it in a standard `Error` with a clear message. Callers should never need `instanceof LlamaError` checks.
- **Decorators/wrappers preserve the base contract.** `anonymizingCloud.ts` wraps `cloud.ts` — it must still satisfy `AiProvider` exactly. Pre-processing (anonymization) and post-processing (de-anonymization) are invisible to the caller.
- **Repository functions with the same signature must be interchangeable.** If two query functions both return `Thread[]`, callers must not depend on subtle ordering or shape differences between them.

## How to check

Ask: "If I swap implementation A for implementation B in `getProvider()`, does everything still work without changes to callers?" If not, the substitution contract is broken.
