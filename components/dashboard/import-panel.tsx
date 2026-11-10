"use client";

import { useCallback, useMemo, useState } from "react";

type PreviewRow = {
  disposition: "insert" | "skipped_duplicate" | "needs_review";
  id: string;
  name: string;
  content: string;
  orderNumber: string;
  amountRaw: string;
  issues: string[];
  sourceSheet: string;
  sourceRow: number;
  proposedTab: string | null;
  fulfillment: string;
  tabReason: string;
  regionNote: string | null;
};

type PreviewPayload = {
  fileHash: string;
  ignoredSheets: string[];
  parseErrors: { sheet: string; message: string }[];
  insertCount: number;
  duplicateCount: number;
  reviewCount: number;
  appendCount: number;
  samples: {
    insert: PreviewRow[];
    duplicate: PreviewRow[];
    needsReview: PreviewRow[];
  };
  rows: PreviewRow[];
};

type CommitResult = {
  opId: string;
  reused: boolean;
  inserted: number;
  skipped: number;
  needsReview: number;
  appended: Record<string, number>;
  note?: string;
  error?: string;
};

const FALLBACK_TABS = ["自提", "邮寄", "三谷", "95008"] as const;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const i = result.indexOf(",");
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

export function ImportPanel({ onImported }: { onImported?: () => void }) {
  const [filename, setFilename] = useState<string | null>(null);
  const [contentBase64, setContentBase64] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [fallbackTab, setFallbackTab] = useState<string>("");
  const [busy, setBusy] = useState<"idle" | "preview" | "commit">("idle");
  const [error, setError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);

  const resetFile = useCallback(() => {
    setFilename(null);
    setContentBase64(null);
    setPreview(null);
    setCommitResult(null);
    setError(null);
  }, []);

  const onPick = useCallback(async (file: File | null) => {
    setCommitResult(null);
    setPreview(null);
    setError(null);
    if (!file) {
      setFilename(null);
      setContentBase64(null);
      return;
    }
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setError("请选择 .xlsx 或 .csv 文件");
      setFilename(null);
      setContentBase64(null);
      return;
    }
    setFilename(file.name);
    setContentBase64(await fileToBase64(file));
  }, []);

  const runPreview = useCallback(async () => {
    if (!filename || !contentBase64) return;
    setBusy("preview");
    setError(null);
    setCommitResult(null);
    try {
      const res = await fetch("/api/import/preview", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, contentBase64 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "预览失败");
        setPreview(null);
        return;
      }
      setPreview(data.preview as PreviewPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setBusy("idle");
    }
  }, [filename, contentBase64]);

  const runCommit = useCallback(async () => {
    if (!filename || !contentBase64 || !preview) return;
    if (preview.appendCount === 0 && !fallbackTab) {
      setError("没有可追加的行。可为「待分类」选择备用工作表后再确认。");
      return;
    }
    const ok = window.confirm(
      `确认导入？将追加约 ${preview.appendCount} 行到对应工作表（不会整表替换）。` +
        (fallbackTab ? `\n无目标表的复核行将写入「${fallbackTab}」。` : ""),
    );
    if (!ok) return;

    setBusy("commit");
    setError(null);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          contentBase64,
          confirm: true,
          ...(fallbackTab ? { fallbackTab } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "导入失败");
        return;
      }
      setCommitResult(data as CommitResult);
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setBusy("idle");
    }
  }, [filename, contentBase64, preview, fallbackTab, onImported]);

  const sampleBlocks = useMemo(() => {
    if (!preview) return [];
    return [
      { key: "insert", title: "将新增", rows: preview.samples.insert, tone: "ready" as const },
      {
        key: "dup",
        title: "疑似重复（跳过）",
        rows: preview.samples.duplicate,
        tone: "stale" as const,
      },
      {
        key: "review",
        title: "需复核",
        rows: preview.samples.needsReview,
        tone: "warn" as const,
      },
    ].filter((b) => b.rows.length);
  }, [preview]);

  return (
    <div className="import-panel">
      <p className="muted">
        上传每日新接龙 .xlsx / .csv → 先预览（新单 / 重复 / 需复核 / 解析错误）→ 点「确认导入」才追加写入。
        按订单号与内容签名去重；按自提 / 邮寄 / 冲突 / 待分类与区域工作表分流。
      </p>

      <div className="import-actions">
        <label className="btn secondary file-btn">
          选择文件
          <input
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            hidden
            onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
          />
        </label>
        <span className="muted">{filename ?? "尚未选择文件"}</span>
        <button
          className="btn secondary"
          type="button"
          disabled={!contentBase64 || busy !== "idle"}
          onClick={() => void runPreview()}
        >
          {busy === "preview" ? "预览中…" : "预览导入"}
        </button>
        <button className="btn ghost" type="button" onClick={resetFile} disabled={busy !== "idle"}>
          清除
        </button>
      </div>

      {error ? <div className="note">{error}</div> : null}

      {preview ? (
        <>
          <div className="import-summary">
            <span className="badge ready">新增 {preview.insertCount}</span>
            <span className="badge stale">重复 {preview.duplicateCount}</span>
            <span className="badge warn">复核 {preview.reviewCount}</span>
            <span className="badge">将追加 {preview.appendCount}</span>
            <span className="muted">SHA-256 · {preview.fileHash.slice(0, 12)}…</span>
          </div>

          {preview.parseErrors.length ? (
            <div className="note">
              解析提示：
              {preview.parseErrors.map((e, i) => (
                <div key={i}>
                  {e.sheet ? `【${e.sheet}】` : ""}
                  {e.message}
                </div>
              ))}
            </div>
          ) : null}

          {preview.ignoredSheets.length ? (
            <p className="muted">已忽略工作表：{preview.ignoredSheets.join("、")}</p>
          ) : null}

          {sampleBlocks.map((block) => (
            <div key={block.key} className="import-sample">
              <h4>
                <span className={`badge ${block.tone}`}>{block.title}</span>
                <span className="muted">（样例最多 8 行）</span>
              </h4>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>订单号</th>
                      <th>客户</th>
                      <th>履约</th>
                      <th>目标表</th>
                      <th>内容</th>
                      <th>问题</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.orderNumber || "—"}</td>
                        <td>{r.name || "—"}</td>
                        <td>
                          <span
                            className={`badge ${r.fulfillment === "待确认" || r.fulfillment === "待分类" ? "warn" : "ready"}`}
                          >
                            {r.fulfillment}
                          </span>
                        </td>
                        <td>{r.proposedTab ?? "—"}</td>
                        <td className="muted">{r.content.slice(0, 48)}</td>
                        <td className="muted">
                          {[r.tabReason, r.regionNote, ...r.issues].filter(Boolean).slice(0, 2).join("；")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="import-confirm">
            <label className="muted" htmlFor="fallbackTab">
              无目标表时的备用工作表（可选）
            </label>
            <select
              id="fallbackTab"
              value={fallbackTab}
              onChange={(e) => setFallbackTab(e.target.value)}
            >
              <option value="">不写入无目标行</option>
              {FALLBACK_TABS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              className="btn"
              type="button"
              disabled={busy !== "idle" || (!preview.appendCount && !fallbackTab)}
              onClick={() => void runCommit()}
            >
              {busy === "commit" ? "写入中…" : "确认导入"}
            </button>
          </div>
        </>
      ) : null}

      {commitResult ? (
        <div className="success">
          {commitResult.reused ? "幂等命中，未重复写入。" : "导入完成。"}
          新增 {commitResult.inserted} · 跳过 {commitResult.skipped} · 复核{" "}
          {commitResult.needsReview}
          {commitResult.appended && Object.keys(commitResult.appended).length
            ? ` · 追加：${Object.entries(commitResult.appended)
                .map(([t, n]) => `${t} ${n}`)
                .join("、")}`
            : ""}
          <div className="muted">op: {commitResult.opId}</div>
        </div>
      ) : null}
    </div>
  );
}
