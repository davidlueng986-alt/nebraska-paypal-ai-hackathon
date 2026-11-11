# Nebraska：繁體中文快速開始

這個資料夾實作了原文件的 P0、P1、P2。預設是可操作、持久保存資料的本機 demo；錢、維護者身份、種子數據中的資助資料、安全公告及 AI 判斷都是明確標示的模擬。

## 開啟介面

需要 Node.js 24 或以上。

```bash
cd /workspace/nebraska
npm ci
cp .env.example .env
npm run seed
npm run dev
```

瀏覽 `http://localhost:3000`。付款方可看用量、AI 分配、月結、供應鏈風險及撥款；左上角可切換維護者介面。

## 重現整個月

1. 到 Emergency grants，批准模擬的 $250 撥款。
2. 按 Run month-end，執行決策、規則閘及付款。
3. 三名合資格收款人收到模擬付款；可疑收款人的 $24.19 保留在帳本。
4. 切換 Maintainer，Maya 的收入為 $161.29 用量分配 + $250 撥款。
5. 再按月結，同一期只會沿用同一個批次，不會重複付款。
6. 在 Statements 下載 audit bundle，用 `npm run recompute -- 檔案路徑` 重算。

UI 以當前 UTC 月份為準。獨立展示指令固定使用文件的 2026-11，並使用獨立記憶體資料庫：

```bash
npm run demo
npm run recompute -- artifacts/demo-result.json
npm run check
npm run check:api
```

文件指定的四筆金額合共是 $499.99，因此餘下的 $0.01 有明確記錄並回流下月，而不是消失。

## P1 / P2 怎樣用

- **Supply chain**：付款方專屬風險報告。
- **Emergency grants → Scan OSV**：掃描公告、產生待批准撥款。
- **Settings → Reconcile PayPal / AI Toolkit**：唯讀對帳；真實模式需要憑證。
- **Settings → Create workspace**：選 USD／EUR／GBP／CAD／AUD；各幣種獨立收款與發放，不作未授權換匯。
- **Your packages → Configure**：repo admin 設定所有已驗證維護者的分成；總和須為 1，只影響未來分配。
- **Settings → Verify fiscal host**：管理員核實託管方後登記；維護者另外授權，並經 14 日冷靜期。
- 計量器支援 npm、pnpm、Python Poetry／uv／固定版本 requirements、Rust Cargo、Go 及 SBOM；詳見 METER.md。
- `action.yml` 可作 GitHub composite Action；`examples/` 有 hooks 及 MCP 設定。

## 真實 PayPal sandbox

把 `.env` 的 `NEBRASKA_MODE` 改為 `sandbox`，再依 [SANDBOX.md](SANDBOX.md) 配置 PayPal、GitHub、模型及 session 憑證。

本次環境沒有提供這些帳戶憑證，所以**未聲稱已在 PayPal sandbox 實際付款**。程式已包含對應 API、簽章驗證及重試流程；本機測試及 Postgres 實測結果見 VALIDATION.md。

## 交付與尚需帳戶的部分

- 英文 README、Devpost 描述、MIT license、Render 部署設定、CI、短片與字幕均在此專案。
- 原始兩份文件保存在 `docs/source/`。
- `AGENTS.md` 是 context compact 後接續工作的說明；`docs/STATUS.md` 記錄驗證及剩餘事項。
- 公開 GitHub repo、部署至自己的 Render、實際 sandbox 授權、補拍瀏覽器影片、上傳 YouTube 及按 Devpost 提交，需要參賽者帳戶完成，未代為發布。

官方規則已核對：截止為 **2026-11-12 12:00 Pacific／20:00 UTC／21:00 巴黎時間**。在香港為 **2026-11-13 04:00**。
