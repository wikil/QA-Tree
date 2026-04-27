import type { STRINGS } from '@/lib/i18n';
import type { StructuredErrorKind } from '@/types';

type AnswerStrings =
  | (typeof STRINGS)['zh']['answer']
  | (typeof STRINGS)['en']['answer'];

export function resolveStructuredErrorText(
  kind: StructuredErrorKind | undefined,
  t: AnswerStrings,
): string | null {
  if (!kind) return null;
  return kind === 'fallback'
    ? t.structuredErrorFallback
    : t.structuredErrorParseFailed;
}
