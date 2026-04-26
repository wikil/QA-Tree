import * as React from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Star,
  Trash2,
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
import { useSettingsStore } from '@/stores/settingsStore';
import { newId } from '@/lib/ids';
import { cn } from '@/lib/utils';
import {
  COMMON_MODELS,
  PROVIDER_PRESETS,
  type ProviderPreset,
} from '@/lib/providerPresets';
import type { ProviderConfig, ProxyConfig } from '@/types';

const providerFormSchema = z.object({
  name: z.string().trim().min(1, '请填写名称'),
  baseUrl: z
    .string()
    .trim()
    .min(1, '请填写 baseUrl')
    .refine((v) => /^https?:\/\//.test(v), 'baseUrl 需以 http(s):// 开头'),
  apiKey: z.string(),
  defaultModel: z.string().trim().min(1, '请填写默认模型'),
  systemPrompt: z.string().optional(),
  temperature: z
    .number()
    .min(0)
    .max(2)
    .optional(),
  maxTokens: z.number().int().positive().optional(),
});

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

const formFromPreset = (preset: ProviderPreset): ProviderFormValues => ({
  ...blankForm(),
  name: preset.name,
  baseUrl: preset.baseUrl,
  defaultModel: preset.defaultModel,
});

function maskApiKey(key: string) {
  if (!key) return '（未填写）';
  if (key.length <= 8) return '•'.repeat(key.length);
  return `${key.slice(0, 4)}${'•'.repeat(Math.max(key.length - 8, 4))}${key.slice(-4)}`;
}

export default function ProvidersPage() {
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

  const openCreate = (preset?: ProviderPreset) => {
    setDraftValues(preset ? formFromPreset(preset) : blankForm());
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
        正在加载设置...
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            aria-label="返回画布"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'h-8 w-8',
            )}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-semibold tracking-tight">设置 · Providers</h1>
        </div>
        <ThemeToggle />
      </header>

      <div className="border-b border-border bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        API key 仅保存在本机浏览器的 IndexedDB，请勿在不可信设备上使用本工具；
        如需更高安全性，请等待后续主密码加密功能。
      </div>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-8">
          <PresetsSection onPick={openCreate} />

          <ProvidersSection
            providers={providers}
            defaultProviderId={defaultProviderId}
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
  onPick: (preset: ProviderPreset) => void;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">内置预设</h2>
        <p className="text-sm text-muted-foreground">
          一键填入 baseUrl + 推荐模型，apiKey 仍需自行填写。
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {PROVIDER_PRESETS.map((preset) => (
          <Button
            key={preset.name}
            variant="outline"
            className="h-auto flex-col items-start gap-1 px-4 py-3 text-left"
            onClick={() => onPick(preset)}
          >
            <span className="text-sm font-medium">{preset.name}</span>
            <span className="text-xs text-muted-foreground">{preset.baseUrl}</span>
            {preset.hint ? (
              <span className="text-xs text-muted-foreground">{preset.hint}</span>
            ) : null}
          </Button>
        ))}
      </div>
    </section>
  );
}

function ProvidersSection({
  providers,
  defaultProviderId,
  onCreate,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  providers: ProviderConfig[];
  defaultProviderId: string | null;
  onCreate: () => void;
  onEdit: (p: ProviderConfig) => void;
  onDelete: (p: ProviderConfig) => void;
  onSetDefault: (id: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">已保存的 Providers</h2>
          <p className="text-sm text-muted-foreground">
            一个为全局默认；新会话使用默认 provider，可在 session 内切换。
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onCreate}>
          <Plus className="h-4 w-4" /> 新建
        </Button>
      </div>

      {providers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
            还没有 provider，挑一个预设或点 “新建”。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              isDefault={p.id === defaultProviderId}
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

function ProviderRow({
  provider,
  isDefault,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  provider: ProviderConfig;
  isDefault: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  const [revealKey, setRevealKey] = React.useState(false);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <span className="truncate">{provider.name}</span>
            {isDefault ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                <Star className="h-3 w-3 fill-current" /> 默认
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
              title="设为默认"
            >
              <Star className="h-4 w-4" /> 设为默认
            </Button>
          ) : null}
          <Button size="icon" variant="ghost" onClick={onEdit} aria-label="编辑">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            aria-label="删除"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <Field label="默认模型" value={provider.defaultModel || '—'} />
        <Field
          label="API Key"
          value={
            <span className="flex items-center gap-1 font-mono">
              <span>
                {revealKey ? provider.apiKey || '（未填写）' : maskApiKey(provider.apiKey)}
              </span>
              {provider.apiKey ? (
                <button
                  type="button"
                  onClick={() => setRevealKey((v) => !v)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={revealKey ? '隐藏' : '显示'}
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
    </Card>
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
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">本地 Proxy（可选 CORS 兜底）</h2>
        <p className="text-sm text-muted-foreground">
          浏览器直连大多数 OpenAI 兼容服务都可用；如遇 CORS，可在本仓库执行
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">pnpm proxy</code>
          启动本地 proxy；Ollama 也可设
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">OLLAMA_ORIGINS=*</code>
          直接放行。
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="proxy-enabled" className="flex flex-col gap-1">
              <span>启用本地 proxy</span>
              <span className="text-xs font-normal text-muted-foreground">
                启用后所有 LLM 请求转发到下方 URL
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
      localErrors.temperatureInput = 'temperature 应为 0–2';
    }
    if (
      maxInput !== '' &&
      (Number.isNaN(maxNum) || !Number.isInteger(maxNum) || maxNum! <= 0)
    ) {
      localErrors.maxTokensInput = 'maxTokens 应为正整数';
    }

    const parsed = providerFormSchema.safeParse({
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

  const title = mode?.kind === 'edit' ? '编辑 Provider' : '新建 Provider';

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
            字段对齐 OpenAI 兼容协议；apiKey 留在本机 IndexedDB，不会上传。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldRow label="名称" htmlFor="provider-name" error={errors.name}>
            <Input
              id="provider-name"
              value={values.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="例如 OpenAI"
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
                placeholder="sk-... ( Ollama 本地可留空 )"
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setRevealKey((v) => !v)}
                aria-label={revealKey ? '隐藏 key' : '显示 key'}
              >
                {revealKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </FieldRow>
          <FieldRow
            label="默认模型"
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
            label="systemPrompt（可选）"
            htmlFor="provider-system"
            error={errors.systemPrompt}
          >
            <Textarea
              id="provider-system"
              value={values.systemPrompt}
              onChange={(e) => update('systemPrompt', e.target.value)}
              placeholder="可在每次会话前注入的 system 消息"
              rows={3}
            />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow
              label="temperature（可选 0–2）"
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
                placeholder="留空使用 provider 默认"
              />
            </FieldRow>
            <FieldRow
              label="maxTokens（可选）"
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
                placeholder="留空不发送"
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
            保存后设为全局默认
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              <Check className="h-4 w-4" />
              {submitting ? '保存中…' : '保存'}
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
          <DialogTitle>删除 Provider</DialogTitle>
          <DialogDescription>
            将永久删除 “{provider?.name}”，此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            取消
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
            {pending ? '删除中…' : '确认删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
