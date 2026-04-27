import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Locale } from '@/types';

const OPTIONS: Locale[] = ['zh', 'en'];

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      className="inline-flex items-center rounded-md border border-input bg-background p-0.5"
      aria-label={t.language.label}
    >
      <span className="grid h-7 w-7 place-items-center text-muted-foreground">
        <Languages className="h-3.5 w-3.5" />
      </span>
      {OPTIONS.map((value) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant="ghost"
          aria-label={value === 'zh' ? t.language.switchToZh : t.language.switchToEn}
          aria-pressed={locale === value}
          onClick={() => void setLocale(value)}
          className={cn(
            'h-7 min-w-8 rounded-sm px-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground',
            locale === value && 'bg-accent text-foreground',
          )}
        >
          {value === 'zh' ? t.language.zh : t.language.en}
        </Button>
      ))}
    </div>
  );
}
