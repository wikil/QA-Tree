import * as React from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Square,
  Star,
  Trash2,
  Zap,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useSettingsStore } from '@/stores/settingsStore';
import { useI18n } from '@/lib/i18n';
import { newId } from '@/lib/ids';
import { cn } from '@/lib/utils';
import {
  COMMON_MODELS,
  PROVIDER_PRESETS,
  type ProviderPreset,
} from '@/lib/providerPresets';
import { streamChat } from '@/lib/llm';
import type { ProviderConfig, ProxyConfig } from '@/types';

function providerFormSchema(errors: {
  nameRequired: string;
  baseUrlRequired: string;
  baseUrlProtocol: string;
  modelRequired: string;
}) {
  return z.object({
    name: z.string().trim().min(1, errors.nameRequired),
    baseUrl: z
      .string()
      .trim()
      .min(1, errors.baseUrlRequired)
      .refine((v) => /^https?:\/\//.test(v), errors.baseUrlProtocol),
    apiKey: z.string(),
    defaultModel: z.string().trim().min(1, errors.modelRequired),
    systemPrompt: z.string().optional(),
    temperature: z
      .number()
      .min(0)
      .max(2)
      .optional(),
    maxTokens: z.number().int().positive().optional(),
  });
}

type ProviderFormErrors = Partial<Record<keyof ProviderFormValues, string>>;

interface ProviderFormValues {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  systemPrompt: string;
  temperatureInput: string;
  maxTokensInput: string;
  setAsDefault: boolean;
}

type DraftMode =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | null;

const blankForm = (): ProviderFormValues => ({
  name: '',
  baseUrl: '',
  apiKey: '',
  defaultModel: '',
  systemPrompt: '',
  temperatureInput: '',
  maxTokensInput: '',
  setAsDefault: false,
});

const formFromProvider = (
  p: ProviderConfig,
  isDefault: boolean,
): ProviderFormValues => ({
  name: p.name,
  baseUrl: p.baseUrl,
  apiKey: p.apiKey,
  defaultModel: p.defaultModel,
  systemPrompt: p.systemPrompt ?? '',
  temperatureInput:
    p.temperature === undefined ? '' : String(p.temperature),
  maxTokensInput: p.maxTokens === undefined ? '' : String(p.maxTokens),
  setAsDefault: isDefault,
});

const formFromPreset = (
  preset: ProviderPreset,
  displayName: string = preset.name,
): ProviderFormValues => ({
  ...blankForm(),
  name: displayName,
  baseUrl: preset.baseUrl,
  defaultModel: preset.defaultModel,
});

function maskApiKey(key: string, emptyLabel: string) {
  if (!key) return emptyLabel;
  if (key.length <= 8) return '•'.repeat(key.length);
  return `${key.slice(0, 4)}${'•'.repeat(Math.max(key.length - 8, 4))}${key.slice(-4)}`;
}

export default function ProvidersPage() {
  const { t } = useI18n();
  const hydrated = useSettingsStore((s) => s.hydrated);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const providers = useSettingsStore((s) => s.providers);
  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const proxy = useSettingsStore((s) => s.proxy);
  const upsertProvider = useSettingsStore((s) => s.upsertProvider);
  const removeProvider = useSettingsStore((s) => s.removeProvider);
  const setDefaultProviderId = useSettingsStore((s) => s.setDefaultProviderId);
  const setProxy = useSettingsStore((s) => s.setProxy);

  const [draft, setDraft] = React.useState<DraftMode>(null);
  const [draftValues, setDraftValues] = React.useState<ProviderFormValues>(
    blankForm,
  );
  const [pendingDelete, setPendingDelete] = React.useState<ProviderConfig | null>(
    null,
  );

  React.useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const openCreate = (preset?: ProviderPreset, displayName?: string) => {
    setDraftValues(preset ? formFromPreset(preset, displayName) : blankForm());
    setDraft({ kind: 'create' });
  };

  const openEdit = (p: ProviderConfig) => {
    setDraftValues(formFromProvider(p, p.id === defaultProviderId));
    setDraft({ kind: 'edit', id: p.id });
  };

  const closeDraft = () => setDraft(null);

  if (!hydrated) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        {t.settings.loading}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            aria-label={t.settings.backToCanvas}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'h-8 w-8',
            )}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-semibold tracking-tight">{t.settings.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <div className="border-b border-border bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        {t.settings.security}
      </div>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-8">
          <PresetsSection onPick={openCreate} />

          <ProvidersSection
            providers={providers}
            defaultProviderId={defaultProviderId}
            proxy={proxy}
            onCreate={() => openCreate()}
            onEdit={openEdit}
            onDelete={setPendingDelete}
            onSetDefault={(id) => void setDefaultProviderId(id)}
          />

          <ProxySection proxy={proxy} onChange={(p) => void setProxy(p)} />
        </div>
      </main>

      <ProviderFormDialog
        open={draft !== null}
        mode={draft}
        values={draftValues}
        onValuesChange={setDraftValues}
        onCancel={closeDraft}
        onSubmit={async (values, errors) => {
          if (errors) return errors;
          const id = draft?.kind === 'edit' ? draft.id : newId();
          const provider: ProviderConfig = {
            id,
            name: values.name.trim(),
            baseUrl: values.baseUrl.trim().replace(/\/+$/, ''),
            apiKey: values.apiKey,
            defaultModel: values.defaultModel.trim(),
            systemPrompt: values.systemPrompt.trim() || undefined,
            temperature:
              values.temperatureInput === ''
                ? undefined
                : Number(values.temperatureInput),
            maxTokens:
              values.maxTokensInput === ''
                ? undefined
                : Number(values.maxTokensInput),
          };
          await upsertProvider(provider);
          if (values.setAsDefault) {
            await setDefaultProviderId(provider.id);
          }
          closeDraft();
          return null;
        }}
      />

      <DeleteConfirmDialog
        provider={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await removeProvider(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function PresetsSection({
  onPick,
}: {
  onPick: (preset: ProviderPreset, displayName?: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{t.settings.presetsTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {t.settings.presetsDescription}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {PROVIDER_PRESETS.map((preset) => {
          const presetText = t.settings.presets[preset.id];
          return (
            <Button
              key={preset.id}
              variant="outline"
              className="h-auto flex-col items-start gap-1 px-4 py-3 text-left"
              onClick={() => onPick(preset, presetText.name)}
            >
              <span className="text-sm font-medium">{presetText.name}</span>
              <span className="text-xs text-muted-foreground">{preset.baseUrl}</span>
              {'hint' in presetText ? (
                <span className="text-xs text-muted-foreground">{presetText.hint}</span>
              ) : null}
            </Button>
          );
        })}
      </div>
    </section>
  );
}

function ProvidersSection({
  providers,
  defaultProviderId,
  proxy,
  onCreate,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  providers: ProviderConfig[];
  defaultProviderId: string | null;
  proxy: ProxyConfig;
  onCreate: () => void;
  onEdit: (p: ProviderConfig) => void;
  onDelete: (p: ProviderConfig) => void;
  onSetDefault: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t.settings.providersTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {t.settings.providersDescription}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onCreate}>
          <Plus className="h-4 w-4" /> {t.settings.create}
        </Button>
      </div>

      {providers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
            {t.settings.noProviders}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              isDefault={p.id === defaultProviderId}
              proxy={proxy}
              onEdit={() => onEdit(p)}
              onDelete={() => onDelete(p)}
              onSetDefault={() => onSetDefault(p.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type TestStatus = 'idle' | 'streaming' | 'done' | 'aborted' | 'error';

interface TestState {
  status: TestStatus;
  text: string;
  error?: string;
  finishReason?: string;
  model?: string;
}

function ProviderRow({
  provider,
  isDefault,
  proxy,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  provider: ProviderConfig;
  isDefault: boolean;
  proxy: ProxyConfig;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  const { t } = useI18n();
  const [revealKey, setRevealKey] = React.useState(false);
  const [test, setTest] = React.useState<TestState | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startTest = async () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setTest({ status: 'streaming', text: '' });
    try {
      const result = await streamChat({
        provider,
        proxy,
        messages: [{ role: 'user', content: t.settings.testPrompt }],
        signal: ctl.signal,
        onDelta: (_, full) =>
          setTest((prev) =>
            prev && prev.status === 'streaming' ? { ...prev, text: full } : prev,
          ),
      });
      if (ctl.signal.aborted) {
        setTest({
          status: 'aborted',
          text: result.content,
          model: result.model,
        });
      } else {
        setTest({
          status: result.finishReason === 'abort' ? 'aborted' : 'done',
          text: result.content,
          finishReason: result.finishReason,
          model: result.model,
        });
      }
    } catch (e) {
      setTest({
        status: 'error',
        text: '',
        error: (e as Error).message,
      });
    } finally {
      if (abortRef.current === ctl) abortRef.current = null;
    }
  };

  const stopTest = () => abortRef.current?.abort();
  const closeTest = () => {
    abortRef.current?.abort();
    setTest(null);
  };

  const testing = test?.status === 'streaming';

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <span className="truncate">{provider.name}</span>
            {isDefault ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                <Star className="h-3 w-3 fill-current" /> {t.settings.defaultBadge}
              </span>
            ) : null}
          </CardTitle>
          <CardDescription className="truncate font-mono text-xs">
            {provider.baseUrl}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!isDefault ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onSetDefault}
              title={t.settings.setDefault}
            >
              <Star className="h-4 w-4" /> {t.settings.setDefault}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={testing ? stopTest : startTest}
            title={testing ? t.settings.stopTestTitle : t.settings.testTitle}
          >
            {testing ? (
              <>
                <Square className="h-4 w-4" /> {t.settings.stop}
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" /> {t.settings.test}
              </>
            )}
          </Button>
          <Button size="icon" variant="ghost" onClick={onEdit} aria-label={t.common.edit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            aria-label={t.common.delete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <Field label={t.settings.defaultModel} value={provider.defaultModel || '—'} />
        <Field
          label="API Key"
          value={
            <span className="flex items-center gap-1 font-mono">
              <span>
                {revealKey
                  ? provider.apiKey || t.common.notFilled
                  : maskApiKey(provider.apiKey, t.common.notFilled)}
              </span>
              {provider.apiKey ? (
                <button
                  type="button"
                  onClick={() => setRevealKey((v) => !v)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={revealKey ? t.settings.hidden : t.settings.show}
                >
                  {revealKey ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : null}
            </span>
          }
        />
        {provider.temperature !== undefined ? (
          <Field label="temperature" value={String(provider.temperature)} />
        ) : null}
        {provider.maxTokens !== undefined ? (
          <Field label="maxTokens" value={String(provider.maxTokens)} />
        ) : null}
        {provider.systemPrompt ? (
          <Field
            label="systemPrompt"
            className="sm:col-span-2"
            value={
              <span className="line-clamp-2 whitespace-pre-wrap break-words text-muted-foreground">
                {provider.systemPrompt}
              </span>
            }
          />
        ) : null}
      </CardContent>
      {test ? (
        <TestPanel
          state={test}
          proxyEnabled={proxy.enabled}
          testPrompt={t.settings.testPrompt}
          onStop={stopTest}
          onRetry={startTest}
          onClose={closeTest}
        />
      ) : null}
    </Card>
  );
}

function TestPanel({
  state,
  proxyEnabled,
  testPrompt,
  onStop,
  onRetry,
  onClose,
}: {
  state: TestState;
  proxyEnabled: boolean;
  testPrompt: string;
  onStop: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const isStreaming = state.status === 'streaming';
  const isError = state.status === 'error';
  const isAborted = state.status === 'aborted';

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span className="text-muted-foreground">{t.settings.testing}</span>
            </>
          ) : isError ? (
            <span className="font-medium text-destructive">{t.settings.connectionFailed}</span>
          ) : isAborted ? (
            <span className="font-medium text-amber-700 dark:text-amber-300">
              {t.settings.aborted}
            </span>
          ) : (
            <span className="font-medium text-emerald-700 dark:text-emerald-300">
              {t.settings.connected}
            </span>
          )}
          {state.model ? (
            <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {state.model}
            </span>
          ) : null}
          {proxyEnabled ? (
            <span className="rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
              via proxy
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {isStreaming ? (
            <Button size="sm" variant="ghost" onClick={onStop}>
              <Square className="h-3.5 w-3.5" /> {t.settings.stop}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onRetry}>
              <Zap className="h-3.5 w-3.5" /> {t.settings.retryTest}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t.common.close}
          </Button>
        </div>
      </div>
      {isError ? (
        <pre className="overflow-auto whitespace-pre-wrap break-words rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {state.error || t.settings.unknownError}
        </pre>
      ) : (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-background p-2 font-sans text-sm leading-relaxed">
          {state.text || (isStreaming ? t.settings.waitingFirstToken : t.common.noOutput)}
          {isStreaming ? <span className="ml-0.5 animate-pulse">▍</span> : null}
        </pre>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t.settings.testPromptLabel}: {testPrompt}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function ProxySection({
  proxy,
  onChange,
}: {
  proxy: ProxyConfig;
  onChange: (proxy: ProxyConfig) => void;
}) {
  const { t } = useI18n();
  const [beforeProxy, afterProxyRaw = ''] =
    t.settings.proxyDescription.split('{proxyCommand}');
  const [betweenCommands, afterOllama = ''] =
    afterProxyRaw.split('{ollamaCommand}');

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{t.settings.proxyTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {beforeProxy}
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">pnpm proxy</code>
          {betweenCommands}
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">OLLAMA_ORIGINS=*</code>
          {afterOllama}
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="proxy-enabled" className="flex flex-col gap-1">
              <span>{t.settings.enableProxy}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {t.settings.enableProxyDescription}
              </span>
            </Label>
            <Switch
              id="proxy-enabled"
              checked={proxy.enabled}
              onCheckedChange={(checked) => onChange({ ...proxy, enabled: checked })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="proxy-url">Proxy URL</Label>
            <Input
              id="proxy-url"
              value={proxy.url}
              onChange={(e) => onChange({ ...proxy, url: e.target.value })}
              placeholder="http://localhost:8787"
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

interface ProviderFormDialogProps {
  open: boolean;
  mode: DraftMode;
  values: ProviderFormValues;
  onValuesChange: (values: ProviderFormValues) => void;
  onCancel: () => void;
  onSubmit: (
    values: ProviderFormValues,
    errors: ProviderFormErrors | null,
  ) => Promise<ProviderFormErrors | null>;
}

function ProviderFormDialog({
  open,
  mode,
  values,
  onValuesChange,
  onCancel,
  onSubmit,
}: ProviderFormDialogProps) {
  const { t } = useI18n();
  const [errors, setErrors] = React.useState<ProviderFormErrors>({});
  const [revealKey, setRevealKey] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setErrors({});
      setRevealKey(false);
    }
  }, [open]);

  const update = <K extends keyof ProviderFormValues>(
    key: K,
    value: ProviderFormValues[K],
  ) => onValuesChange({ ...values, [key]: value });

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();

    const tempInput = values.temperatureInput.trim();
    const maxInput = values.maxTokensInput.trim();
    const tempNum = tempInput === '' ? undefined : Number(tempInput);
    const maxNum = maxInput === '' ? undefined : Number(maxInput);
    const localErrors: ProviderFormErrors = {};
    if (tempInput !== '' && (Number.isNaN(tempNum) || tempNum! < 0 || tempNum! > 2)) {
      localErrors.temperatureInput = t.settings.errors.temperatureRange;
    }
    if (
      maxInput !== '' &&
      (Number.isNaN(maxNum) || !Number.isInteger(maxNum) || maxNum! <= 0)
    ) {
      localErrors.maxTokensInput = t.settings.errors.maxTokensPositive;
    }

    const parsed = providerFormSchema(t.settings.errors).safeParse({
      name: values.name,
      baseUrl: values.baseUrl,
      apiKey: values.apiKey,
      defaultModel: values.defaultModel,
      systemPrompt: values.systemPrompt || undefined,
      temperature: tempNum,
      maxTokens: maxNum,
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof ProviderFormValues | undefined;
        if (field && !localErrors[field]) localErrors[field] = issue.message;
      }
    }

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const next = await onSubmit(values, null);
      if (next) setErrors(next);
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode?.kind === 'edit' ? t.settings.editProvider : t.settings.newProvider;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t.settings.formDescription}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldRow label={t.settings.name} htmlFor="provider-name" error={errors.name}>
            <Input
              id="provider-name"
              value={values.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder={t.settings.namePlaceholder}
              autoFocus
            />
          </FieldRow>
          <FieldRow label="baseUrl" htmlFor="provider-baseurl" error={errors.baseUrl}>
            <Input
              id="provider-baseurl"
              value={values.baseUrl}
              onChange={(e) => update('baseUrl', e.target.value)}
              placeholder="https://api.openai.com/v1"
              spellCheck={false}
              className="font-mono"
            />
          </FieldRow>
          <FieldRow label="API Key" htmlFor="provider-apikey" error={errors.apiKey}>
            <div className="flex items-center gap-2">
              <Input
                id="provider-apikey"
                type={revealKey ? 'text' : 'password'}
                value={values.apiKey}
                onChange={(e) => update('apiKey', e.target.value)}
                placeholder={t.settings.apiKeyPlaceholder}
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setRevealKey((v) => !v)}
                aria-label={revealKey ? t.settings.hideKey : t.settings.showKey}
              >
                {revealKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </FieldRow>
          <FieldRow
            label={t.settings.defaultModel}
            htmlFor="provider-model"
            error={errors.defaultModel}
          >
            <Input
              id="provider-model"
              list="provider-model-options"
              value={values.defaultModel}
              onChange={(e) => update('defaultModel', e.target.value)}
              placeholder="gpt-4o-mini"
              spellCheck={false}
              className="font-mono"
            />
            <datalist id="provider-model-options">
              {COMMON_MODELS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </FieldRow>
          <FieldRow
            label={t.settings.systemPromptLabel}
            htmlFor="provider-system"
            error={errors.systemPrompt}
          >
            <Textarea
              id="provider-system"
              value={values.systemPrompt}
              onChange={(e) => update('systemPrompt', e.target.value)}
              placeholder={t.settings.systemPromptPlaceholder}
              rows={3}
            />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow
              label={t.settings.temperatureLabel}
              htmlFor="provider-temp"
              error={errors.temperatureInput}
            >
              <Input
                id="provider-temp"
                type="number"
                step="0.1"
                min={0}
                max={2}
                value={values.temperatureInput}
                onChange={(e) => update('temperatureInput', e.target.value)}
                placeholder={t.settings.temperaturePlaceholder}
              />
            </FieldRow>
            <FieldRow
              label={t.settings.maxTokensLabel}
              htmlFor="provider-max"
              error={errors.maxTokensInput}
            >
              <Input
                id="provider-max"
                type="number"
                min={1}
                step={1}
                value={values.maxTokensInput}
                onChange={(e) => update('maxTokensInput', e.target.value)}
                placeholder={t.settings.maxTokensPlaceholder}
              />
            </FieldRow>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.setAsDefault}
              onChange={(e) => update('setAsDefault', e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            {t.settings.setAsDefaultAfterSave}
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={submitting}>
              <Check className="h-4 w-4" />
              {submitting ? t.common.saving : t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function DeleteConfirmDialog({
  provider,
  onCancel,
  onConfirm,
}: {
  provider: ProviderConfig | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog
      open={provider !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.settings.deleteProvider}</DialogTitle>
          <DialogDescription>
            {locale === 'zh' ? (
              <>
                {t.settings.deleteProviderDescriptionPrefix} “{provider?.name}”，
                {t.settings.deleteProviderDescriptionSuffix}
              </>
            ) : (
              <>
                {t.settings.deleteProviderDescriptionPrefix} “{provider?.name}”.{' '}
                {t.settings.deleteProviderDescriptionSuffix}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await onConfirm();
              } finally {
                setPending(false);
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            {pending ? t.settings.deleting : t.settings.confirmDelete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
