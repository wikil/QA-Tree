# QA-Tree 本地 CORS Proxy

零依赖 Node 脚本，仅在浏览器直连上游 LLM provider 遇到 CORS 阻塞时启用。

## 启动

```bash
pnpm proxy
```

默认监听 `127.0.0.1:8787`，**不接受非本地连接**。在 QA-Tree 设置页打开「启用本地 proxy」开关后，前端会把所有 `/chat/completions` 请求改投到 `http://localhost:8787/forward`。

## 协议

```
POST http://127.0.0.1:8787/forward
Headers:
  X-Upstream-URL: https://api.openai.com/v1/chat/completions   <-- 必填
  Authorization: Bearer sk-...
  Content-Type:  application/json
  Accept:        text/event-stream
Body: <原始 OpenAI 兼容 JSON>
```

Proxy 校验 `X-Upstream-URL` 命中白名单前缀后，按原 method / body / headers 转发到上游，并把响应（含 SSE 流）逐 chunk 透传，附带 `Access-Control-Allow-Origin: *`。

## 白名单

默认放行：

- `https://api.openai.com/`
- `https://api.deepseek.com/`
- `https://api.moonshot.cn/`
- `http://localhost`
- `http://127.0.0.1`

通过环境变量覆盖（逗号分隔）：

```bash
PROXY_UPSTREAMS="https://my-llm.example.com/,http://192.168.1.10:11434" pnpm proxy
```

不在白名单的上游 URL 会得到 `403`。

## 端口 / 健康检查

```bash
PORT=9000 pnpm proxy
curl http://127.0.0.1:8787/health
# {"ok":true,"whitelist":["https://api.openai.com/", ...]}
```

## 安全注意

- 仅绑定 `127.0.0.1`，远程主机无法连接；同机器上的其他用户/进程仍可访问，**勿在多用户共享机器上启动**
- 不做鉴权：Authorization header 仅透传到上游，proxy 自身不持有/记录 key
- 仅支持 `http` / `https` 协议，仅放行 `POST /forward` 与 `OPTIONS` 预检
- 没有日志落盘，但 stderr 会打印上游错误，注意 terminal 共享时不要泄漏 key（脚本不打印 Authorization 内容）

## 常见替代方案（先试再上 proxy）

- **Ollama**：`OLLAMA_ORIGINS=* ollama serve` 即可让浏览器直连
- **OpenAI / DeepSeek / Moonshot**：浏览器直连均可，多数情况下不需要 proxy
