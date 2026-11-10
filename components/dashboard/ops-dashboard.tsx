"use client";

import { useCallback, useEffect, useState } from "react";
import { ImportPanel } from "./import-panel";
import { StatusPanel, type StatusOrder } from "./status-panel";

type SyncState = {
  syncedAt: string | null;
  stale: boolean;
  error: string | null;
};

type GroupSummary = {
  key: string;
  name: string;
  fulfillment: string;
  orders: { id: string; issues: string[]; content: string; sourceSheet: string }[];
  phones: string[];
  routes: string[];
};

export function OpsDashboard({ email }: { email: string }) {
  const [sync, setSync] = useState<SyncState>({ syncedAt: null, stale: false, error: null });
  const [groups, setGroups] = useState<GroupSummary[]>([]);
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
      setGroups(data.groups || []);
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

  const reviewCount = groups.filter(
    (g) =>
      g.fulfillment === "待确认" ||
      g.fulfillment === "待分类" ||
      g.orders.some((o) => o.issues.length > 0),
  ).length;
  const pickupReady = groups.filter((g) => g.fulfillment === "自提").length;
  const mailReady = groups.filter((g) => g.fulfillment === "邮寄").length;

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
            <strong>{pickupReady}</strong>
            <span>自提队列</span>
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
              从 Google Sheet 读取 自提 / 邮寄 / 三谷 / 95008。写入需明确确认。
            </p>
            <CustomerTable groups={groups} />
          </section>

          <section className="panel" id="queue">
            <h3>客户队列</h3>
            <p className="muted">
              自提 {pickupReady} · 邮寄 {mailReady} · 待确认/待分类 {reviewCount}
            </p>
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
            <p className="muted">仅在相关活跃订单全部到齐后进入打包或自提。</p>
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
              完成记录为追加写入。先归档验证，再按行号降序删除活跃行；删除失败可按同一 op ID 恢复。
            </p>
          </section>
        </div>
      </main>
    </>
  );
}

function CustomerTable({ groups }: { groups: GroupSummary[] }) {
  if (!groups.length) {
    return (
      <div className="note">暂无订单。配置 Google Sheet 后点击刷新，或先在 mock 环境导入 CSV。</div>
    );
  }
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>客户</th>
            <th>配送</th>
            <th>订单数</th>
            <th>地区</th>
            <th>电话键</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <td>{g.name}</td>
              <td>
                <span
                  className={`badge ${g.fulfillment === "待确认" || g.fulfillment === "待分类" ? "warn" : "ready"}`}
                >
                  {g.fulfillment}
                </span>
              </td>
              <td>{g.orders.length}</td>
              <td>{g.routes.filter((r) => r === "三谷" || r === "95008").join("、") || "—"}</td>
              <td>{g.phones.join(" / ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewList({ groups }: { groups: GroupSummary[] }) {
  const flagged = groups.filter(
    (g) =>
      g.fulfillment === "待确认" ||
      g.fulfillment === "待分类" ||
      g.orders.some((o) => o.issues.length > 0),
  );
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
