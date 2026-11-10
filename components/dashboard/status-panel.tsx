"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type StatusOrder = {
  id: string;
  sourceSheet: string;
  sourceRow: number;
  name: string;
  orderNumber: string;
  content: string;
  arrivalOriginal: string;
  paymentOriginal: string;
  fingerprint: string;
};

type RowDraft = {
  arrival: string;
  payment: string;
  fingerprint: string;
  liveArrival: string;
  livePayment: string;
  state: "live" | "dirty" | "saving" | "saved" | "error" | "stale";
  message: string | null;
};

function newOpId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `status-${crypto.randomUUID()}`;
  }
  return `status-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function draftFromOrder(o: StatusOrder): RowDraft {
  return {
    arrival: o.arrivalOriginal,
    payment: o.paymentOriginal,
    fingerprint: o.fingerprint,
    liveArrival: o.arrivalOriginal,
    livePayment: o.paymentOriginal,
    state: "live",
    message: null,
  };
}

export function StatusPanel({
  orders,
  onApplied,
}: {
  orders: StatusOrder[];
  onApplied?: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, RowDraft> = {};
      for (const o of orders) {
        const existing = prev[o.id];
        // Preserve in-progress edits / saving rows across refresh.
        if (
          existing &&
          (existing.state === "dirty" || existing.state === "saving" || existing.state === "error")
        ) {
          next[o.id] = {
            ...existing,
            liveArrival: o.arrivalOriginal,
            livePayment: o.paymentOriginal,
            fingerprint:
              existing.state === "dirty" || existing.state === "error"
                ? existing.fingerprint
                : o.fingerprint,
          };
        } else {
          next[o.id] = draftFromOrder(o);
        }
      }
      return next;
    });
  }, [orders]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.sourceSheet.toLowerCase().includes(q) ||
        o.content.toLowerCase().includes(q),
    );
  }, [orders, filter]);

  const patchDraft = useCallback((id: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  }, []);

  const onEdit = useCallback(
    (id: string, field: "arrival" | "payment", value: string) => {
      setDrafts((prev) => {
        const cur = prev[id];
        if (!cur || cur.state === "saving") return prev;
        const next = { ...cur, [field]: value };
        const dirty =
          next.arrival !== next.liveArrival || next.payment !== next.livePayment;
        return {
          ...prev,
          [id]: {
            ...next,
            state: dirty ? "dirty" : "live",
            message: dirty ? "未保存 — 需点「确认」才会写入 Sheet" : null,
          },
        };
      });
    },
    [],
  );

  const confirmRow = useCallback(
    async (order: StatusOrder) => {
      const draft = drafts[order.id];
      if (!draft) return;
      const arrivalChanged = draft.arrival !== draft.liveArrival;
      const paymentChanged = draft.payment !== draft.livePayment;
      if (!arrivalChanged && !paymentChanged) return;

      const ok = window.confirm(
        `确认将「${order.name}」第 ${order.sourceRow} 行写入 Google Sheet？\n` +
          (arrivalChanged ? `到货：${draft.liveArrival || "（空）"} → ${draft.arrival || "（空）"}\n` : "") +
          (paymentChanged ? `付款：${draft.livePayment || "（空）"} → ${draft.payment || "（空）"}\n` : "") +
          "仅在服务器验证指纹并写回后才会显示已保存。",
      );
      if (!ok) return;

      patchDraft(order.id, { state: "saving", message: "正在写入 Sheet…" });
      const opId = newOpId();
      const body: Record<string, unknown> = {
        opId,
        sourceTab: order.sourceSheet,
        sourceRow: order.sourceRow,
        expectedFingerprint: draft.fingerprint,
        confirm: true,
      };
      if (arrivalChanged) body.arrival = draft.arrival;
      if (paymentChanged) body.payment = draft.payment;

      try {
        const res = await fetch("/api/orders/status", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.status === 409) {
          patchDraft(order.id, {
            state: "stale",
            message: "行指纹冲突 — 请先刷新后重试，不会盲写覆盖",
            liveArrival: data.arrival ?? draft.liveArrival,
            livePayment: data.payment ?? draft.livePayment,
            fingerprint: data.liveFingerprint ?? draft.fingerprint,
            arrival: data.arrival ?? draft.arrival,
            payment: data.payment ?? draft.payment,
          });
          return;
        }
        if (!res.ok || !data.ok) {
          patchDraft(order.id, {
            state: "error",
            message: data.error || `写入失败 (${res.status})`,
          });
          return;
        }
        patchDraft(order.id, {
          state: "saved",
          message: data.reused ? "幂等重试命中 — 未重复写入" : "已写入 Sheet 并完成回读校验",
          arrival: data.arrival,
          payment: data.payment,
          liveArrival: data.arrival,
          livePayment: data.payment,
          fingerprint: data.fingerprint,
        });
        onApplied?.();
      } catch (e) {
        patchDraft(order.id, {
          state: "error",
          message: e instanceof Error ? e.message : "网络错误",
        });
      }
    },
    [drafts, onApplied, patchDraft],
  );

  if (!orders.length) {
    return <div className="note">暂无订单行。请先刷新同步 Sheet。</div>;
  }

  return (
    <div className="status-panel">
      <p className="muted">
        到货 / 付款以 Google Sheet 为准。修改后必须点「确认」才会写入；失焦不会保存。冲突时需重新读取。
      </p>
      <div className="status-toolbar">
        <input
          className="status-filter"
          placeholder="筛选客户 / 序号 / 工作表…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="muted">{visible.length} / {orders.length} 行</span>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>工作表</th>
              <th>行</th>
              <th>客户</th>
              <th>内容</th>
              <th>到货（Sheet）</th>
              <th>付款（Sheet）</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => {
              const d = drafts[o.id] ?? draftFromOrder(o);
              const dirty = d.arrival !== d.liveArrival || d.payment !== d.livePayment;
              return (
                <tr key={o.id} data-state={d.state}>
                  <td>{o.sourceSheet}</td>
                  <td>{o.sourceRow}</td>
                  <td>
                    {o.name}
                    {o.orderNumber ? (
                      <div className="muted">#{o.orderNumber}</div>
                    ) : null}
                  </td>
                  <td className="status-content">{o.content}</td>
                  <td>
                    <input
                      className="status-input"
                      value={d.arrival}
                      disabled={d.state === "saving"}
                      onChange={(e) => onEdit(o.id, "arrival", e.target.value)}
                      aria-label={`到货 ${o.name}`}
                    />
                    <div className="muted status-live">live: {d.liveArrival || "—"}</div>
                  </td>
                  <td>
                    <input
                      className="status-input"
                      value={d.payment}
                      disabled={d.state === "saving"}
                      onChange={(e) => onEdit(o.id, "payment", e.target.value)}
                      aria-label={`付款 ${o.name}`}
                    />
                    <div className="muted status-live">live: {d.livePayment || "—"}</div>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        d.state === "saved" || d.state === "live"
                          ? "ready"
                          : d.state === "stale" || d.state === "error"
                            ? "stale"
                            : "warn"
                      }`}
                    >
                      {d.state === "live"
                        ? "live"
                        : d.state === "dirty"
                          ? "未保存"
                          : d.state === "saving"
                            ? "写入中"
                            : d.state === "saved"
                              ? "已写回"
                              : d.state === "stale"
                                ? "冲突"
                                : "错误"}
                    </span>
                    {d.message ? <div className="muted status-msg">{d.message}</div> : null}
                  </td>
                  <td>
                    <button
                      className="btn"
                      type="button"
                      disabled={!dirty || d.state === "saving" || d.state === "stale"}
                      onClick={() => void confirmRow(o)}
                    >
                      确认
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
