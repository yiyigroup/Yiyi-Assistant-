"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImportPanel } from "./import-panel";
import { StatusPanel, type StatusOrder } from "./status-panel";
import { CustomerQueue } from "./customer-queue";
import type { CustomerGroup } from "@/lib/orders/types";
import {
  isFullyArrived,
  isPackReady,
  needsReview,
  queueFilterCounts,
} from "@/lib/orders/queue";

type SyncState = {
  syncedAt: string | null;
  stale: boolean;
  error: string | null;
};

export function OpsDashboard({ email }: { email: string }) {
  const [sync, setSync] = useState<SyncState>({ syncedAt: null, stale: false, error: null });
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [statusOrders, setStatusOrders] = useState<StatusOrder[]>([]);
  const [orderCount, setOrderCount] = useState(0);
  const [shippo, setShippo] = useState("检查中…");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/orders", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setSync((s) => ({ ...s, stale: true, error: data.error || "刷新失败" }));
        setMessage(data.error || "刷新失败 — 保留上次数据");
        return;
      }
      setGroups((data.groups || []) as CustomerGroup[]);
      const orders = (data.orders || []) as StatusOrder[];
      setStatusOrders(
        orders.map((o) => ({
          id: o.id,
          sourceSheet: o.sourceSheet,
          sourceRow: o.sourceRow,
          name: o.name,
          orderNumber: o.orderNumber,
          content: o.content,
          arrivalOriginal: o.arrivalOriginal,
          paymentOriginal: o.paymentOriginal,
          fingerprint: o.fingerprint,
        })),
      );
      setOrderCount(orders.length);
      setSync({ syncedAt: data.syncedAt, stale: false, error: null });
    } catch (e) {
      setSync((s) => ({
        ...s,
        stale: true,
        error: e instanceof Error ? e.message : "网络错误",
      }));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void fetch("/api/shippo/status", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => setShippo(d.configured ? "TEST token 已配置" : "需要 shippo_test_ token"))
      .catch(() => setShippo("Shippo 状态不可用"));
  }, [refresh]);

  const counts = useMemo(() => queueFilterCounts(groups), [groups]);
  const reviewCount = groups.filter(needsReview).length;
  const arrivedCount = groups.filter(isFullyArrived).length;
  const packCount = groups.filter(isPackReady).length;

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <div className="logo">一</div>
          <div>
            <h1>一一妈咪好物团 · 订单工作台</h1>
            <p>订单与到货 · 客户队列 · Shippo 测试 · 完成归档</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12 }}>
          <span className="badge ready">{email}</span>
          <a className="btn secondary" href="/api/auth/signout">
            退出
          </a>
        </div>
      </header>

      <main className="shell">
        <div className="heading">
          <div>
            <h2>运营工作台</h2>
            <div className="muted">Live Sheet 为数据源。刷新失败时保留上次数据并标记过期。</div>
          </div>
          <button className="btn" onClick={() => void refresh()} disabled={busy}>
            {busy ? "同步中…" : "刷新 / Sync"}
          </button>
        </div>

        <div className="sync">
          <span className={`badge ${sync.stale ? "stale" : "ready"}`}>
            {sync.stale ? "数据可能过期" : "已同步"}
          </span>
          <span>上次成功同步：{sync.syncedAt ?? "—"}</span>
          <span>Shippo：{shippo}</span>
        </div>
        {message ? <div className="note">{message}</div> : null}

        <div className="stats">
          <div className="stat">
            <strong>{groups.length}</strong>
            <span>客户</span>
          </div>
          <div className="stat">
            <strong>{orderCount}</strong>
            <span>订单行</span>
          </div>
          <div className="stat">
            <strong>{arrivedCount}</strong>
            <span>全部到齐</span>
          </div>
          <div className="stat">
            <strong>{reviewCount}</strong>
            <span>异常复核</span>
          </div>
        </div>

        <div className="sections">
          <section className="panel" id="import">
            <h3>接龙导入</h3>
            <ImportPanel onImported={() => void refresh()} />
          </section>

          <section className="panel" id="orders">
            <h3>订单与到货</h3>
            <p className="muted">
              从 Google Sheet 读取 自提 / 邮寄 / 三谷 / 95008。写入需明确确认。下方客户队列可筛选到货与收款状态。
            </p>
            <div className="queue-chips" style={{ marginBottom: 8 }}>
              <span className="badge warn">待到货 {counts.waiting}</span>
              <span className="badge warn">部分到货 {counts.partial}</span>
              <span className="badge ready">全部到齐 {counts.arrived}</span>
              <span className="badge">待打包 {counts.pack}</span>
              <span className="badge">待收款 {counts.unpaid}</span>
            </div>
          </section>

          <section className="panel" id="queue">
            <h3>客户队列</h3>
            <p className="muted">
              筛选：待到货 / 部分到货 / 全部到齐 / 待打包 / 待发货 / 已发货 / 待收款 / 已收款 / 待归档 / 已归档。搜索姓名或电话。
            </p>
            <CustomerQueue groups={groups} />
          </section>

          <section className="panel" id="status">
            <h3>到货 / 付款状态</h3>
            <div className="note">
              修改前会核对行指纹。未经验证的服务器响应不会显示为“已保存”。失焦不保存 — 必须点「确认」。
            </div>
            <StatusPanel orders={statusOrders} onApplied={() => void refresh()} />
          </section>

          <section className="panel" id="review">
            <h3>异常复核</h3>
            <ReviewList groups={groups} />
          </section>

          <section className="panel" id="packing">
            <h3>待打包 / 自提</h3>
            <p className="muted">
              仅在相关活跃订单全部到齐后进入打包或自提。当前可打包/自提客户：{packCount}（见客户队列「待打包」筛选）。
            </p>
          </section>

          <section className="panel" id="shippo">
            <h3>Shippo 测试运费与标签</h3>
            <div className="note">
              仅接受 shippo_test_ token；拒绝 live；要求 was_test === true。
            </div>
            <p className="muted">状态：{shippo}</p>
          </section>

          <section className="panel" id="wechat">
            <h3>微信通知草稿</h3>
            <div className="note">草稿仅供复制编辑，系统不会自动发送。</div>
          </section>

          <section className="panel" id="archive">
            <h3>完成归档</h3>
            <p className="muted">
              完成记录为追加写入。先归档验证，再按行号降序删除活跃行；删除失败可按同一 op ID 恢复。待归档筛选人数：
              {counts.to_archive}。
            </p>
          </section>
        </div>
      </main>
    </>
  );
}

function ReviewList({ groups }: { groups: CustomerGroup[] }) {
  const flagged = groups.filter(needsReview);
  if (!flagged.length) return <div className="success">当前没有需要复核的客户。</div>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
      {flagged.map((g) => (
        <li key={g.key} style={{ marginBottom: 8 }}>
          <b>{g.name}</b> · {g.fulfillment}
          <div className="muted">
            {g.orders
              .flatMap((o) => o.issues)
              .slice(0, 3)
              .join("；")}
          </div>
        </li>
      ))}
    </ul>
  );
}
