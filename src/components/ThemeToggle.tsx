import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme, type Theme } from '@/app/ThemeProvider';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type ThemeLabelKey = 'light' | 'dark' | 'system';

const OPTIONS: { value: Theme; labelKey: ThemeLabelKey; icon: typeof Sun }[] = [
  { value: 'light', labelKey: 'light', icon: Sun },
  { value: 'dark', labelKey: 'dark', icon: Moon },
  { value: 'system', labelKey: 'system', icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  return (
    <div className="inline-flex items-center rounded-md border border-input bg-background p-0.5">
      {OPTIONS.map(({ value, labelKey, icon: Icon }) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t.theme[labelKey]}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            'h-7 w-7 rounded-sm p-0 text-muted-foreground hover:text-foreground',
            theme === value && 'bg-accent text-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}
