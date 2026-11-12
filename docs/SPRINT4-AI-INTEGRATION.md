# Sprint 4 — Tick-Tock AI Coach 接入指南（付款前后）

开发分支：feature/sprint-4（从 feature/sprint-3 最新提交 c21f408 开始）。
付费 AI 的服务器开关默认全关，绝不在前端或 GitHub 放 API Key。

## 1. 已经准备的代码

- Sprint 3 Rehearse / Present 增加可折叠 Speech Coach，点击 Enable microphone 才打开麦克风。
- 浏览器免费语音转录：英语、简体/繁体中文、西语、法语（手动切换；浏览器厂商可能在线处理音频）。
- 本地实时章节时间提示、英文近似 WPM、中文近似字符/词每分钟；不是语音质量或语义分析。
- 每次 Rehearse 结束后可主动保存时间/语速到浏览器历史；保存转录需要单独勾选，不保存原始音频。
- 至少两次可比较练习后，识别反复超时、提前结束或时间波动。可选提纲按章节做精确字句匹配，不代表已能理解同义表达或判定忘词。
- Present 可以显示简短、可关闭的历史提醒；用户可选择关闭。
- 独立 Node WebSocket 中转服务：services/qwen-asr-relay/，含 Dockerfile、无费用模拟模式、验证测试。
- Vercel server-only DeepSeek Flash 实时语义接口：api/live-coach.ts；前台后台异步请求，不阻塞计时器。
- 测试代码 tests/，自动构建检查 .github/workflows/sprint4-ai-check.yml。

当前还没有真实调用过付费 Qwen 或 DeepSeek，也还没有跨设备同步、真正账号认证、可信的自动遗漏检测、声学卡顿分析、多人说话人分离。

## 2. 付款前的免费测试

1. 打开 feature/sprint-4 的 Vercel Preview（如 Vercel Protection 要求登录则使用项目账号）。
2. Individual 建立演讲并设置章节时长；在 Ready 页填写 Optional AI Speaking Outline（可以留空）。
3. 点击 Rehearse，展开 Speech Coach，选择 English 或 中文，授权麦克风。
4. 确认转录和实时统计；拒绝麦克风时，正常计时必须继续。
5. 排练结束后点击 Save rehearsal to history；至少保存两次，观察 Ready 的历史摘要和 Present 的短提示。
6. 测试数据不要包含敏感或未经授权的声音。免费浏览器识别本身可能发送声音到浏览器供应商。

## 3. 用户亲自开通：阿里云 Qwen3-ASR-Flash-Realtime

官方激活：https://www.alibabacloud.com/help/en/model-studio/activate-alibaba-cloud-model-studio
官方 Key：https://www.alibabacloud.com/help/en/model-studio/get-api-key
官方 WS：https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-interaction-process
官方价格：https://www.alibabacloud.com/help/en/model-studio/model-pricing

1. 登录 Alibaba Cloud 国际站，打开 Model Studio Console，激活模型推理服务（账单/授权由用户本人完成）。
2. 选择 Singapore 或 China (Beijing)；两地数据处理地点、API key、Workspace ID 和价格不同。对于美国大学项目可以先比较 Singapore，但务必先确定数据区域可接受。
3. 在对应区域 API Key 页面生成项目专用 Key，只在服务端机密变量中保存。
4. 在同区域控制台查 Workspace ID。拼接 WebSocket URL：
   Singapore: wss://WORKSPACE_ID.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/realtime
   Beijing: wss://WORKSPACE_ID.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime
5. 核实到账单、免费额度、阈值提醒、余额。Singapore 标价 USD 0.00009 每秒；北京 USD 0.000047 每秒。连续 10 分钟音频约 USD 0.054 / 0.0282，不含托管费与文本模型费。新加坡可能有 36000 秒 / 10 小时试用额度（有期限/资格约束），以自己控制台为准。
6. 不要在任何 GitHub、前端 VITE_ 变量或聊天里粘贴 Key。

## 4. 用户亲自开通：DeepSeek Flash

官方平台：https://platform.deepseek.com/
官方价格：https://api-docs.deepseek.com/quick_start/pricing/

1. 登录 API 平台，先确认最小充值、额度和账单规则。
2. 创建 Tick-Tock 独立 API Key，保密，只交给服务端环境变量。
3. 代码使用模型 deepseek-flash、非思考模式、短 JSON 回复；Token 按输入和输出分开计费，峰/谷和缓存命中也会影响价格。
4. 开通服务和充值都必须用户本人批准/操作。

## 5. 服务端部署：不能只靠 Vercel

Qwen 需要长连接 WebSocket：必须有持续运行的 Node 服务 + TLS/WSS 域名，不能直接用短生命周期的 Vercel API Function 替代。

独立 relay：services/qwen-asr-relay/
可用 Dockerfile 部署到经确认的托管商。开通任何可能收费的托管前必须得到用户同意。

Relay 服务端机密与配置：
ASR_ENABLED=false（收费前保持）
MOCK_ASR=false（本地模拟时可设 true）
QWEN_API_KEY=仅在托管商 Secret 中设置
QWEN_WS_ENDPOINT=带 Workspace ID 的官方地址
ASR_DEMO_ACCESS_CODE=独立随机长码（至少 24 字符）
ALLOWED_ORIGINS=精确的预览站 URL
MAX_ASR_CONNECTIONS=2
MAX_ASR_MINUTES=10

Vercel 前端公开变量（不得放真实 Key）：
VITE_ASR_RELAY_ENABLED=true
VITE_ASR_RELAY_MODE=live
VITE_ASR_RELAY_URL=wss://YOUR_RELAY_DOMAIN/stream

DeepSeek 服务器端变量（仅授权并完成真实预算防护后开启）：
AI_LIVE_FEEDBACK_ENABLED=false
AI_SPEND_CAP_CONFIRMED=false
AI_LIVE_MAX_CALLS_PER_INSTANCE=0
DEEPSEEK_API_KEY=保密
AI_DEMO_ACCESS_CODE=另一条独立随机长码（至少 24 字符）
前端开关 VITE_AI_LIVE_FEEDBACK_ENABLED=true（批准之后）

特别注意：演示用的 access code 和实例内速率限制不等于真实用户身份验证、全局用量封顶；公开上线前必须增加服务器持续保存的用户额度、总消费硬限制、滥用防护和紧急停止开关。

## 6. 用户付款之后的真实测试

按英文、中文、中英混合发言，测试识别准确度、模型延迟、文字分析质量；重点看：
- 分章节超时、提前结束、语速变化；暂停时不继续采集。
- 是否真实遗漏提纲重点，避免误判同义表达/重复和卡顿。
- 多人小组切换：根据章节而非错误的声纹识别来关联 speaker。
- 真正 Present 时只显示简短有用提示，不遮挡 Quiet View。
- 浏览器权限拒绝、断网、模型故障，基本 Timer 必须一直可靠。
- 记录真实分钟、Token 和账单，并与预先批准的预算比对。

## 7. 交付验收

根目录运行：npm install && npm run build
单测：node --experimental-strip-types --test tests/*.test.mjs
Relay：cd services/qwen-asr-relay && npm ci && npm test

CI 和 Vercel Preview 验收后仍需 PM、UX、Dev 审核。禁止在未经团队确认前把 feature/sprint-4 合并进 feature/sprint-3 或 main。
