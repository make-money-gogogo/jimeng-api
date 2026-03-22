import path from "path";

import fs from "fs-extra";

import Request from "@/lib/request/Request.ts";
import Response from "@/lib/response/Response.ts";
import environment from "@/lib/environment.ts";

const FALLBACK_MARKDOWN = `# Jimeng API 文档

未找到工作目录下的 \`API.md\`（请与 \`dist\` 一并部署）。

在线端点摘要：

- \`GET /\` 服务信息
- \`GET /ping\` 健康检查
- \`GET /v1/docs\` 本说明（浏览器直接访问可渲染）
- \`GET /v1/models\` 模型列表
- \`POST /v1/images/generations\` 文生图 / 图生图
- \`POST /v1/images/compositions\` 多图合成
- \`POST /v1/videos/generations\` 视频生成
- \`POST /token/check\`、\`/token/points\`、\`/token/receive\` 令牌相关
`;

function readApiMarkdown(): string {
  const p = path.join(path.resolve(), "API.md");
  try {
    if (fs.pathExistsSync(p)) return fs.readFileSync(p, "utf8");
  } catch { /* ignore */ }
  return FALLBACK_MARKDOWN;
}

function renderHtml(markdown: string, version: string): string {
  const escaped = markdown.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>API 文档 v${version}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.min.css">
<style>
  body{background:#f6f8fa;margin:0;padding:24px 16px;}
  .container{max-width:860px;margin:0 auto;background:#fff;border-radius:8px;
    border:1px solid #d0d7de;padding:32px 40px;box-sizing:border-box;}
  @media(max-width:600px){.container{padding:20px 16px;}}
  .version-badge{display:inline-block;background:#0969da;color:#fff;
    font-size:12px;border-radius:4px;padding:2px 8px;margin-left:8px;vertical-align:middle;}
  /* 复制按钮 */
  .code-wrap{position:relative;}
  .copy-btn{
    position:absolute;top:8px;right:8px;
    padding:3px 10px;font-size:12px;line-height:1.5;
    background:#fff;border:1px solid #d0d7de;border-radius:4px;
    color:#57606a;cursor:pointer;opacity:0;transition:opacity .15s,background .15s;
    user-select:none;
  }
  .code-wrap:hover .copy-btn{opacity:1;}
  .copy-btn.copied{background:#2da44e;color:#fff;border-color:#2da44e;}
</style>
</head>
<body>
<div class="container markdown-body" id="content"></div>
<script src="https://cdn.jsdelivr.net/npm/marked@9/marked.min.js"></script>
<script>
(function(){
  const md = \`${escaped}\`;
  document.getElementById('content').innerHTML = marked.parse(md);

  // 版本徽章
  const h1 = document.querySelector('#content h1');
  if(h1){const b=document.createElement('span');b.className='version-badge';b.textContent='v${version}';h1.appendChild(b);}

  // 复制按钮
  document.querySelectorAll('#content pre').forEach(function(pre){
    const wrap = document.createElement('div');
    wrap.className = 'code-wrap';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);

    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = '复制';
    wrap.appendChild(btn);

    btn.addEventListener('click', function(){
      const code = pre.querySelector('code');
      const text = code ? code.innerText : pre.innerText;
      navigator.clipboard.writeText(text).then(function(){
        btn.textContent = '已复制 ✓';
        btn.classList.add('copied');
        setTimeout(function(){btn.textContent='复制';btn.classList.remove('copied');}, 2000);
      }).catch(function(){
        // 降级：execCommand
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.textContent = '已复制 ✓'; btn.classList.add('copied');
        setTimeout(function(){btn.textContent='复制';btn.classList.remove('copied');}, 2000);
      });
    });
  });
})();
</script>
</body>
</html>`;
}

function resolveBaseUrl(request: Request): string {
  const host = request.headers["x-forwarded-host"] || request.headers["host"] || "localhost:5100";
  const proto = request.headers["x-forwarded-proto"] || "http";
  return `${proto}://${host}`;
}

export default {
  prefix: "/v1",

  get: {
    "/docs": async (request: Request) => {
      const baseUrl = resolveBaseUrl(request);
      const raw = readApiMarkdown();
      // 将文档中的占位地址替换为当前实际访问地址
      const markdown = raw.replace(/http:\/\/localhost:5100/g, baseUrl);
      const version = environment.package.version;
      const fmt = String(request.query.format || "").toLowerCase();
      const accept = String(request.headers.accept || "");

      // ?format=markdown 或 ?format=text → 纯文本
      if (fmt === "markdown" || fmt === "md" || fmt === "text") {
        return new Response(markdown, { type: "text/markdown; charset=utf-8" });
      }

      // ?format=json → 原始 JSON
      if (fmt === "json") {
        return { service: "jimeng-api", version, format: "markdown", markdown };
      }

      // 浏览器访问（Accept: text/html）→ 渲染 HTML
      if (accept.includes("text/html")) {
        return new Response(renderHtml(markdown, version), {
          type: "text/html; charset=utf-8",
        });
      }

      // 默认 JSON（供 API 客户端程序调用）
      return { service: "jimeng-api", version, format: "markdown", markdown };
    },
  },
};
