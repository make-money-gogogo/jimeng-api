# Jimeng API HTTP 接口说明

面向自建部署，提供**图像生成**、**多图合成**与**视频生成**等接口。部分路径与请求体字段参考 OpenAI API 风格，但并非完全兼容。

> 下方 curl 示例中的地址会自动替换为当前服务的实际访问地址。

---

## 1. 通用约定

### 1.1 Base URL

默认服务监听由环境变量 `SERVER_PORT` 控制（常见 `5100`）。下文路径均为**绝对路径**（服务未配置 `urlPrefix` 时）。

若 `configs/<环境>/service.yml` 中配置了 `urlPrefix`，则所有路由前需加该前缀。

### 1.2 鉴权

#### 服务级 API Key（可选）

若部署时设置了 `SERVER_API_KEY` 环境变量，所有 API 请求必须携带：

```http
X-API-Key: your_secret_key
```

或通过查询参数传递：

```
?api_key=your_secret_key
```

> `Authorization` 请求头用于传递业务 token，**不**用于服务级鉴权，两者互不冲突。

免鉴权路径（无需 Key 即可访问）：`/`、`/ping`、`/v1/docs`。

#### 业务 Token

多数生成类接口需要：

```http
Authorization: Bearer <refresh_token>
```

- `refresh_token` 为 Web 登录后的刷新令牌（需自行维护）。
- **多账号**：`Bearer` 后可使用英文逗号 `,` 分隔多个 token，服务会随机选用其中一个。

部分接口支持在 token 中嵌入代理，形如：`https://user:pass@host:port@<真实refresh_token>`。

### 1.3 Content-Type

- JSON 接口：`Content-Type: application/json`
- 上传文件：`multipart/form-data`（字段名见各接口）

### 1.4 成功与错误

- 成功时多为 JSON 对象（或字符串，如 `GET /ping`）。
- 失败时由统一异常处理返回错误结构，HTTP 状态码可能为 4xx/5xx。

---

## 2. 服务发现与健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 服务名、版本、`documentation` 指向 `/v1/docs`、主要端点列表 |
| GET | `/ping` | 返回纯文本 `pong` |
| GET | `/v1/docs` | API 文档（浏览器访问自动渲染 HTML） |
| GET | `/v1/docs?format=markdown` | 响应体为 Markdown 原文 |

```bash
# 健康检查
curl http://localhost:5100/ping

# 服务信息
curl http://localhost:5100/
```

---

## 3. 模型列表

**GET** `/v1/models`

返回 OpenAI 风格的 `data` 数组，元素含 `id`、`object`、`owned_by` 等。

```bash
curl http://localhost:5100/v1/models
```

---

## 4. 图像

前缀：`/v1/images`

#### 可用图像模型

| 外部模型名 | 说明 | 可用区域 |
|---|---|---|
| `jimeng-5.0` | 最新旗舰 | CN |
| `jimeng-4.6` | 4.6 版本 | CN |
| `jimeng-4.5` | 默认模型 | CN / US / Asia |
| `jimeng-4.1` | 4.1 版本 | CN / US / Asia |
| `jimeng-4.0` | 4.0 版本 | CN / US / Asia |
| `jimeng-3.1` | 3.1 艺术风格 | CN |
| `jimeng-3.0` | 3.0 基础 | CN / US / Asia |
| `nanobanana` | Gemini Flash Image | US / Asia |
| `nanobananapro` | Dreamina Image Lib | US / Asia |

#### 支持的画幅比

`1:1`、`4:3`、`3:4`、`16:9`、`9:16`、`3:2`、`2:3`、`21:9`

#### 支持的分辨率档位

| 档位值 | 示例尺寸（1:1 基准） | 说明 |
|---|---|---|
| `1k` | 1024×1024 | 默认 |
| `2k` | 2048×2048 | 高清 |
| `4k` | 4096×4096 | 超高清 |

> 实际输出尺寸由 `ratio` + `resolution` 组合决定，例如 `16:9` + `2k` → 2560×1440。

### 4.1 文生图（同步）

**POST** `/v1/images/generations`

**请求体（JSON，主要字段）**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | string | 是 | 正向提示词 |
| `model` | string | 否 | 默认 `jimeng-4.5`，见上方模型表 |
| `negative_prompt` | string | 否 | 负向提示词 |
| `ratio` | string | 否 | 画幅比，默认 `1:1` |
| `resolution` | string | 否 | 分辨率档位：`1k`（默认）/ `2k` / `4k` |
| `intelligent_ratio` | boolean | 否 | 智能比例 |
| `sample_strength` | number | 否 | 生成强度，0~1 |
| `response_format` | string | 否 | `url`（默认）或 `b64_json` |
| `async` | boolean | 否 | `true` 时返回异步任务而非直接出图 |

**不支持**：`size`、`width`、`height`（请用 `ratio` + `resolution`）。

```bash
curl -X POST http://localhost:5100/v1/images/generations \
  -H "Authorization: Bearer <refresh_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "一只在森林里奔跑的狐狸，写实风格",
    "model": "jimeng-4.5",
    "ratio": "16:9",
    "resolution": "2k"
  }'
```

### 4.2 文生图（异步提交 + 轮询）

异步提交（同上，加 `"async": true`）：

```bash
curl -X POST http://localhost:5100/v1/images/generations \
  -H "Authorization: Bearer <refresh_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "赛博朋克城市夜景",
    "ratio": "16:9",
    "async": true
  }'
```

轮询结果：

```bash
curl -X POST http://localhost:5100/v1/images/generations/status \
  -H "Authorization: Bearer <refresh_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "<job_id>",
    "job_kind": "text2img"
  }'
```

### 4.3 多图合成

**POST** `/v1/images/compositions`

- `prompt` 必填；`images` 为数组，元素为 URL 字符串或 `{ "url": "..." }`，1～10 张。
- 支持 multipart 上传，字段名 `images`（可多文件）。

```bash
# JSON 方式（传图片 URL）
curl -X POST http://localhost:5100/v1/images/compositions \
  -H "Authorization: Bearer <refresh_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "将两张图合成为同一风格的艺术照",
    "images": [
      "https://example.com/photo1.jpg",
      "https://example.com/photo2.jpg"
    ]
  }'

# multipart 方式（上传本地文件）
curl -X POST http://localhost:5100/v1/images/compositions \
  -H "Authorization: Bearer <refresh_token>" \
  -F "prompt=将两张图合成为同一风格的艺术照" \
  -F "images=@/path/to/photo1.jpg" \
  -F "images=@/path/to/photo2.jpg"
```

---

## 5. 视频

前缀：`/v1/videos`

### 5.1 生成视频（同步）

**POST** `/v1/videos/generations`

| 字段 | 类型 | 说明 |
|------|------|------|
| `prompt` | string | 必填 |
| `model` | string | 否，有默认值 |
| `ratio` | string | 否，如 `1:1`、`16:9` |
| `resolution` | string | 否，如 `720p`、`1080p` |
| `duration` | number | 否，默认 `5`；不同模型支持不同时长 |
| `functionMode` | string | `first_last_frames`（默认）或 `omni_reference` |
| `file_paths` / `filePaths` | string[] | 参考图/视频 URL |
| `response_format` | string | `url` 或 `b64_json` |
| `async` | boolean | 异步任务 |

#### 全能参考（`omni_reference`）提示词与图片引用

当你希望同时控制“首帧/尾帧/动作参考”等，可以把 `functionMode` 设为 `omni_reference`。

提交素材（两种方式二选一，或混用）：
- multipart：用 `image_file_1` 到 `image_file_9` 上传图片文件；用 `video_file_1` 到 `video_file_3` 上传视频文件
- JSON：同名字段 `image_file_1..9`、`video_file_1..3` 传对应的素材 URL（以 `http` 开头）

在 `prompt` 里引用素材：

`prompt` 支持用 `@` 引用素材槽位，示例：

- `@image_file_1`：引用图片槽位 1
- `@image_file_2`：引用图片槽位 2
- `@video_file_1`：引用视频槽位 1
- `@audio_file_1`：引用音频槽位 1

注意事项：
- `@xxx` 里 `xxx` 必须与你实际提交过的素材字段名一致（例如你传了 `image_file_2`，提示词就写 `@image_file_2`）
- 如果你引用了未提交的名字，服务端不会在“素材注册表”中找到对应项，`@未注册名字` 很可能会被当作普通文本而不是素材引用

`omni_reference` 示例（multipart）：

```bash
curl -X POST http://localhost:5100/v1/videos/generations \
  -H "Authorization: Bearer <refresh_token>" \
  -F "functionMode=omni_reference" \
  -F "prompt=@image_file_1作为首帧，@image_file_2作为尾帧，运动动作模仿@video_file_1" \
  -F "ratio=16:9" \
  -F "duration=5" \
  -F "image_file_1=@/path/to/start.jpg" \
  -F "image_file_2=@/path/to/end.jpg" \
  -F "video_file_1=@/path/to/motion.mp4"
```

音频素材（可选）：
- multipart：用 `audio_file_1`、`audio_file_2` 上传音频文件（最多 2 个）
- JSON：同名字段传音频 URL
- 提示词里用 `@audio_file_1` 引用音频素材
- 音频通过 VOD 管道上传（与视频相同），在 `material_list` 中以 `vid` + `duration`（毫秒）标识

`omni_reference` 约束（服务端校验）：
- 最多上传 9 张图片（`image_file_1..image_file_9`）
- 最多上传 3 个视频（`video_file_1..video_file_3`）
- 最多上传 2 个音频（`audio_file_1..audio_file_2`）
- 素材总数不超过 12

`omni_reference` 示例（JSON + 图片 + 音频）：

```bash
curl -X POST http://localhost:5100/v1/videos/generations \
  -H "Authorization: Bearer <refresh_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "functionMode": "omni_reference",
    "prompt": "@image_file_1背景，配合@audio_file_1的音乐节奏",
    "ratio": "16:9",
    "duration": 8,
    "model": "jimeng-video-seedance-2.0",
    "async": true,
    "image_file_1": "https://example.com/background.jpg",
    "audio_file_1": "https://example.com/music.mp3"
  }'
```

`omni_reference` 示例（图片 + 视频 + 音频混合）：

```bash
curl -X POST http://localhost:5100/v1/videos/generations \
  -H "Authorization: Bearer <refresh_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "functionMode": "omni_reference",
    "prompt": "@image_file_1作为背景，@image_file_2角色在草地上奔跑，配合@audio_file_1背景音乐",
    "ratio": "16:9",
    "duration": 10,
    "model": "jimeng-video-seedance-2.0",
    "async": true,
    "image_file_1": "https://example.com/bg.png",
    "image_file_2": "https://example.com/character.png",
    "audio_file_1": "https://example.com/bgm.mp3"
  }'
```

`omni_reference` 示例（multipart 混合上传）：

```bash
curl -X POST http://localhost:5100/v1/videos/generations \
  -H "Authorization: Bearer <refresh_token>" \
  -F "functionMode=omni_reference" \
  -F "prompt=@image_file_1作为首帧，运动参考@video_file_1，配乐@audio_file_1" \
  -F "ratio=16:9" \
  -F "duration=8" \
  -F "model=jimeng-video-seedance-2.0" \
  -F "async=true" \
  -F "image_file_1=@/path/to/start.jpg" \
  -F "video_file_1=@/path/to/motion.mp4" \
  -F "audio_file_1=@/path/to/music.mp3"
```

`omni_reference` 示例（VIP 模型 + 音频）：

```bash
curl -X POST http://localhost:5100/v1/videos/generations \
  -H "Authorization: Bearer <refresh_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "functionMode": "omni_reference",
    "prompt": "@image_file_1画面配合@audio_file_1的节奏律动",
    "ratio": "16:9",
    "duration": 12,
    "model": "jimeng-video-seedance-2.0-vip",
    "async": true,
    "image_file_1": "https://example.com/scene.jpg",
    "audio_file_1": "https://example.com/beat.mp3"
  }'
```

#### 可用视频模型

**国内站（CN token）：**

| 外部模型名 | 时长 | 说明 |
|---|---|---|
| `jimeng-video-seedance-2.0` | 4~15秒（整数） | Seedance 2.0 Pro，支持 omni_reference |
| `jimeng-video-seedance-2.0-fast` | 4~15秒（整数） | Seedance 2.0 Fast，支持 omni_reference |
| `jimeng-video-seedance-2.0-vip` | 4~15秒（整数） | Seedance 2.0 Pro VIP，720p 输出，需 VIP 权益 |
| `jimeng-video-seedance-2.0-fast-vip` | 4~15秒（整数） | Seedance 2.0 Fast VIP，720p 输出，需 VIP 权益 |
| `jimeng-video-3.5-pro` | 5 / 10 / 12秒 | 3.5 Pro（默认模型） |
| `jimeng-video-3.0-pro` | 5 / 10秒 | 3.0 Pro |
| `jimeng-video-3.0` | 5 / 10秒 | 3.0 标准，支持 `resolution` 参数 |
| `jimeng-video-3.0-fast` | 5 / 10秒 | 3.0 Fast，支持 `resolution` 参数 |
| `jimeng-video-2.0` | 5 / 10秒 | 2.0 标准 |
| `jimeng-video-2.0-pro` | 5 / 10秒 | 2.0 Pro |

**亚洲国际站（HK/JP/SG token）：**

| 外部模型名 | 时长 | 说明 |
|---|---|---|
| `jimeng-video-veo3` | 固定 8秒 | Google Veo3 |
| `jimeng-video-veo3.1` | 固定 8秒 | Google Veo3.1 |
| `jimeng-video-sora2` | 4 / 8 / 12秒 | OpenAI Sora2 |
| `jimeng-video-3.5-pro` | 5 / 10 / 12秒 | 3.5 Pro |
| 以及 3.0 / 2.0 系列 | | 同国内站 |

**美国站（US token）：**

| 外部模型名 | 时长 | 说明 |
|---|---|---|
| `jimeng-video-3.5-pro` | 5 / 10 / 12秒 | 3.5 Pro |
| `jimeng-video-3.0` | 5 / 10秒 | 3.0 标准 |

> `omni_reference` 全能模式仅 Seedance 2.0 系列（含 VIP）支持。其他模型使用默认的 `first_last_frames` 模式。

VIP 模型说明：
- VIP 模型输出分辨率为 720p，需要账号有对应 VIP 权益
- VIP 模型同样支持 4~15 秒时长和 `omni_reference` / `first_last_frames` 两种模式
- 仅国内站（CN token）可用

> **Seedance 自动异步**：当调用方未显式传 `async` 参数时，Seedance 2.0 系列模型默认走异步提交（仅返回任务 ID），需通过轮询接口获取结果。传 `"async": false` 可强制同步等待。

```bash
# 纯文生视频
curl -X POST http://localhost:5100/v1/videos/generations \
  -H "Authorization: Bearer <refresh_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "夕阳下海浪拍打礁石，慢动作",
    "ratio": "16:9",
    "resolution": "720p",
    "duration": 5
  }'

# 首尾帧控视频（传参考图 URL）
curl -X POST http://localhost:5100/v1/videos/generations \
  -H "Authorization: Bearer <refresh_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "人物走向远方",
    "file_paths": [
      "https://example.com/start.jpg",
      "https://example.com/end.jpg"
    ],
    "duration": 5
  }'

# multipart 上传首尾帧
curl -X POST http://localhost:5100/v1/videos/generations \
  -H "Authorization: Bearer <refresh_token>" \
  -F "prompt=人物走向远方" \
  -F "duration=5" \
  -F "file=@/path/to/start.jpg" \
  -F "file=@/path/to/end.jpg"
```

### 5.2 生成视频（异步提交 + 轮询）

异步提交（加 `"async": true`，或 Seedance 2.0 系列默认异步）：

```bash
curl -X POST http://localhost:5100/v1/videos/generations \
  -H "Authorization: Bearer <refresh_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "星空延时摄影",
    "model": "jimeng-video-seedance-2.0",
    "ratio": "16:9",
    "duration": 8,
    "async": true
  }'
```

返回示例：

```json
{
  "created": 1711234567,
  "object": "video_generation_job",
  "id": "7486512345678901234"
}
```

轮询任务状态：

**POST** `/v1/videos/generations/status`

```bash
curl -X POST http://localhost:5100/v1/videos/generations/status \
  -H "Authorization: Bearer <refresh_token>" \
  -H "Content-Type: application/json" \
  -d '{"id": "7486512345678901234"}'
```

轮询响应字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 任务 ID |
| `object` | string | 固定 `video_generation_job` |
| `status` | string | `queued` / `processing` / `succeeded` / `failed` |
| `upstream_status` | number | 上游原始状态码（10=成功, 20=处理中, 30=失败, 50=完成） |
| `fail_code` | string | 失败时的错误码 |
| `url` | string | 成功时的视频 URL |
| `data` | array | `[{ "url": "..." }]`，成功时返回 |

轮询建议：每 3~5 秒查询一次，Seedance 2.0 生成通常需要 2~8 分钟。

---

## 6. 令牌与积分

前缀：`/token`（注意**无** `/v1`）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/token/check` | 检查 token 是否有效 |
| POST | `/token/points` | 查询多个 token 的积分 |
| POST | `/token/receive` | 尝试领取积分 |

```bash
# 检查 token 有效性
curl -X POST http://localhost:5100/token/check \
  -H "Content-Type: application/json" \
  -d '{"token": "<refresh_token>"}'

# 查询积分
curl -X POST http://localhost:5100/token/points \
  -H "Authorization: Bearer <refresh_token>"

# 领取积分
curl -X POST http://localhost:5100/token/receive \
  -H "Authorization: Bearer <refresh_token>"
```

---

## 7. 环境与部署相关变量

| 变量 | 说明 |
|------|------|
| `SERVER_PORT` | 监听端口 |
| `SERVER_HOST` | 监听地址，默认配置见 `configs` |
| `SERVER_ENV` | 配置子目录名，默认 `dev`，对应 `configs/<SERVER_ENV>/` |
| `SERVER_API_KEY` | 服务级 API Key，设置后所有请求需通过 `X-API-Key` 头或 `?api_key` 参数鉴权 |
| `JIMENG_BROWSER_GENERATE` | `1`/`true`/`yes`/`on` 时，国内站部分生成请求走 Chromium 降低风控概率 |
| `JIMENG_BROWSER_HEADLESS` | 是否无头；默认无头 |
| `JIMENG_BROWSER_SINGLE_PROCESS` | 默认不要开启（云端易崩溃）；仅在明确测试通过时设为 `force` |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | 自定义 Chromium 可执行文件路径 |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright 浏览器缓存目录（镜像内常设 `/ms-playwright`） |
| `JIMENG_CLIENT_OS` | 设为 `mac` 时使用 Mac 客户端相关请求头分支 |
| `JIMENG_MS_TOKEN` / `JIMENG_A_BOGUS` | 可选查询参数注入（一般不必） |

---

## 8. 错误码说明

所有接口在业务失败时返回统一错误结构，核心字段为 `ret`（字符串数字）和 `errmsg`。

| 错误码 `ret` | 含义 | 建议处理 |
|------|------|------|
| `0` | 成功 | — |
| `1000` | 参数无效（invalid parameter） | 检查请求参数是否完整、格式是否正确 |
| `1015` | 登录失效 / Token 过期 | 重新获取 `refresh_token` 并更新配置 |
| `1310` | 高峰期并发限制 | 等待其他任务完成后重试，或换账号 |
| `4001` | 内容违规 | 调整提示词，避免违禁内容 |
| `4002` | 参数错误 | 检查请求体字段格式和取值范围 |
| `4013` | 异常行为风控 | 通常为签名/设备参数异常，Chromium 通道可降低概率 |
| `5000` | 积分不足 | 充值或降低分辨率（如换用 `1024x1024`） |
| `5001` | 图像生成失败 | 稍后重试，或调整参数 |
| `5002` | 视频生成失败 | 稍后重试，或调整参数 |

其他未列出的错误码会以 `[操作失败]: <errmsg> (错误码: <ret>)` 格式透传给调用方。

---

## 9. 与 OpenAI 客户端对接提示

- 图像：`/v1/images/generations` 可与部分客户端配置为「OpenAI 兼容」基址，但**字段并非 1:1**，需按上文调整。
- 视频：路径为 `/v1/videos/generations`，非 OpenAI 官方路径。
- 模型列表：`/v1/models`。

---

## 10. 静态文档文件

本文件建议与 `dist` 一并放在进程工作目录（例如容器内 `/app/API.md`），以便 `GET /v1/docs` 返回与仓库一致的说明。若缺失，接口仍可用，但会返回内置简略提示。

文档版本随镜像/发行包更新；**版本号以 `GET /` 或 `GET /v1/docs` JSON 内 `version`（来自 `package.json`）为准。**
