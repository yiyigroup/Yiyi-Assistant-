"use client";

import { useMemo, useState } from "react";
import type { CustomerGroup, OrderRow } from "@/lib/orders/types";
import {
  QUEUE_FILTERS,
  QUEUE_FILTER_LABELS,
  type QueueFilter,
  allItems,
  arrivalBucket,
  customerMerchandiseTotal,
  filterCustomerQueue,
  formatMoney,
  isFullyArrived,
  isGroupPaid,
  isGroupShipped,
  isPackReady,
  lineMoney,
  needsReview,
  queueFilterCounts,
} from "@/lib/orders/queue";

type RouteChip = "all" | "自提" | "邮寄" | "三谷" | "95008";

function statusBadge(g: CustomerGroup): { text: string; kind: "ready" | "warn" | "" } {
  if (g.fulfillment === "待确认") return { text: "配送方式冲突", kind: "warn" };
  if (g.fulfillment === "待分类") return { text: "配送方式待确认", kind: "warn" };
  if (needsReview(g)) return { text: "待复核", kind: "warn" };
  if (isFullyArrived(g)) return { text: "全部到齐 · 可处理", kind: "ready" };
  if (arrivalBucket(g) === "partial") return { text: "部分到货", kind: "warn" };
  return { text: "等待到货", kind: "" };
}

function itemStatusLabel(status: string | null): string {
  if (status === "arrived") return "已到货";
  if (status === "missing") return "缺货";
  return "未到货";
}

function filterOrdersByRoute(g: CustomerGroup, routeView: RouteChip): OrderRow[] {
  if (routeView === "all") return g.orders;
  if (routeView === "自提") return g.fulfillment === "自提" ? g.orders : g.orders.filter((o) => /自提|自取/.test(o.content) || o.route === "自提");
  if (routeView === "邮寄") return g.fulfillment === "邮寄" ? g.orders : g.orders.filter((o) => /送货费/.test(o.content) || o.route === "邮寄");
  return g.orders.filter((o) => o.route === routeView || o.sourceSheet === routeView);
}

export function CustomerQueue({ groups }: { groups: CustomerGroup[] }) {
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [routeView, setRouteView] = useState<RouteChip>("all");

  const counts = useMemo(() => queueFilterCounts(groups), [groups]);
  const visible = useMemo(
    () => filterCustomerQueue(groups, { filter, query }),
    [groups, filter, query],
  );

  const selectedGroup = groups.find((g) => g.key === selected) ?? null;

  return (
    <div className="queue-layout">
      <aside className="queue-aside">
        <div className="queue-toolbar">
          <input
            className="status-filter"
            style={{ maxWidth: "100%" }}
            placeholder="搜索客户姓名或电话…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索客户"
          />
          <select
            className="queue-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as QueueFilter)}
            aria-label="客户队列筛选"
          >
            {QUEUE_FILTERS.map((key) => (
              <option key={key} value={key}>
                {QUEUE_FILTER_LABELS[key]} ({counts[key]})
              </option>
            ))}
          </select>
        </div>
        <div className="queue-chips" role="list">
          {(["waiting", "partial", "arrived", "pack", "unpaid", "to_archive"] as QueueFilter[]).map(
            (key) => (
              <button
                key={key}
                type="button"
                className={`chip ${filter === key ? "active" : ""}`}
                onClick={() => setFilter(key)}
              >
                {QUEUE_FILTER_LABELS[key]} · {counts[key]}
              </button>
            ),
          )}
          <button
            type="button"
            className={`chip ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            全部 · {counts.all}
          </button>
        </div>
        <div className="customer-list">
          {!visible.length ? (
            <div className="note">当前筛选下没有客户。</div>
          ) : (
            visible.map((g) => {
              const badge = statusBadge(g);
              const nItems = allItems(g).length;
              return (
                <button
                  key={g.key}
                  type="button"
                  className={`customer ${g.key === selected ? "active" : ""}`}
                  onClick={() => {
                    setSelected(g.key);
                    setRouteView("all");
                  }}
                >
                  <div>
                    <b>{g.name}</b>
                    <small>
                      {g.orders.length} 笔订单 · {nItems} 条商品明细 · {g.fulfillment}
                    </small>
                  </div>
                  <span className={`badge ${badge.kind}`}>{badge.text}</span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="queue-detail panel">
        {!selectedGroup ? (
          <div className="empty muted">
            选择左侧客户查看其所有订单和商品。全部到齐的客户会进入自提或待打包队列；到货/付款写回请在下方「到货 / 付款状态」显式确认。
          </div>
        ) : (
          <CustomerDetail
            g={selectedGroup}
            routeView={routeView}
            onRouteView={setRouteView}
          />
        )}
      </section>
    </div>
  );
}

function CustomerDetail({
  g,
  routeView,
  onRouteView,
}: {
  g: CustomerGroup;
  routeView: RouteChip;
  onRouteView: (r: RouteChip) => void;
}) {
  const badge = statusBadge(g);
  const phones = [...new Set(g.orders.map((o) => o.phone).filter(Boolean))];
  const regionText =
    [...new Set(g.orders.map((o) => o.sourceSheet).filter((x) => x === "三谷" || x === "95008"))].join(
      "、",
    ) || "未标记";
  const total = customerMerchandiseTotal(g);
  const orders = filterOrdersByRoute(g, routeView);
  const lines = orders.flatMap((o) => o.items.map((item) => ({ order: o, item })));

  return (
    <div className="customer-detail">
      <div className="mainhead">
        <div>
          <h3 style={{ margin: 0 }}>{g.name}</h3>
          <div className="muted">
            {g.orders.length} 笔订单 · {allItems(g).length} 条商品明细
            {isPackReady(g) ? " · 可打包/自提" : ""}
            {isGroupShipped(g) ? " · 已发货" : ""}
            {isGroupPaid(g) ? " · 已收款" : " · 待收款"}
          </div>
        </div>
        <span className={`badge ${badge.kind}`}>{badge.text}</span>
      </div>

      <div className="meta">
        <span>配送分类：{g.fulfillment}</span>
        <span>地区标签：{regionText}</span>
        <span>电话：{phones.join(" / ") || "未识别"}</span>
        <span>订单总额：{formatMoney(total)}</span>
        <span>
          到货：
          {arrivalBucket(g) === "arrived"
            ? "全部到齐"
            : arrivalBucket(g) === "partial"
              ? "部分到货"
              : "待到货"}
        </span>
      </div>

      <div className="note">
        商品到货状态来自 Sheet 到货列与明细解析（只读展示）。要写回 Google Sheet，请到「到货 / 付款状态」修改后点「确认」——失焦不会保存。
      </div>

      <div className="queue-chips">
        {(["all", "自提", "邮寄", "三谷", "95008"] as RouteChip[]).map((r) => (
          <button
            key={r}
            type="button"
            className={`chip ${routeView === r ? "active" : ""}`}
            onClick={() => onRouteView(r)}
          >
            {r === "all" ? "客户全部订单" : r}
          </button>
        ))}
      </div>

      {!lines.length ? (
        <div className="note">当前分类下没有商品明细。</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>到货</th>
                <th>订单 / 来源</th>
                <th>商品明细</th>
                <th>数量</th>
                <th>单价</th>
                <th>小计</th>
                <th>原到货</th>
                <th>原付款</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ order, item }) => {
                const money = lineMoney(order, item);
                return (
                  <tr key={`${order.id}:${item.id}`}>
                    <td>
                      <span
                        className={`badge ${
                          item.status === "arrived"
                            ? "ready"
                            : item.status === "missing"
                              ? "stale"
                              : "warn"
                        }`}
                      >
                        {itemStatusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      <b>{order.orderNumber || "无订单号"}</b>
                      <div className="muted">
                        {order.sourceSheet} · 行 {order.sourceRow} · {order.route}
                      </div>
                    </td>
                    <td>{item.raw}</td>
                    <td>{money.qty ?? "—"}</td>
                    <td>
                      {formatMoney(money.unitPrice)}
                      {money.allocated ? <div className="muted">按数量分摊</div> : null}
                    </td>
                    <td>{formatMoney(money.lineSubtotal)}</td>
                    <td>{order.arrivalOriginal || "—"}</td>
                    <td>{order.paymentOriginal || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: "right", fontWeight: 700 }}>
                  客户合计
                </td>
                <td style={{ fontWeight: 700 }}>{formatMoney(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {isFullyArrived(g) && (g.fulfillment === "邮寄" || g.fulfillment === "自提") ? (
        <div className="success">
          全部到齐
          {g.fulfillment === "邮寄" ? " — 可进入待打包 / 待发货。" : " — 可进入自提交接。"}
          打包闸门：仅全部到齐后处理。
        </div>
      ) : null}
    </div>
  );
}
