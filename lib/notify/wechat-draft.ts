export type WeChatDraftInput = {
  customerName: string;
  lines: { text: string; qty: number | string }[];
  merchandise: number;
  adjustment: number;
  shippingFee: number;
};

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Draft only — operator must copy/edit; never auto-send. */
export function buildWeChatDraft(input: WeChatDraftInput): string {
  const lines = input.lines.map((i) => `• ${i.text} — 已核对 ${i.qty} 件`).join("\n");
  const due = input.merchandise + input.adjustment + input.shippingFee;
  return (
    `${input.customerName} 您好！\n\n` +
    `您的商品已整理，请核对：\n${lines}\n\n` +
    `商品合计：${usd(input.merchandise)}\n` +
    `调整/抵扣：${usd(input.adjustment)}\n` +
    `运费：${usd(input.shippingFee)}\n` +
    `暂计应付：${usd(due)}\n\n` +
    `请核对商品信息，谢谢！\n\n` +
    `【草稿 · 请人工复制发送 · 系统不会自动发送】`
  );
}
