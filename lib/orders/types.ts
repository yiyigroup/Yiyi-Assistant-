export type Fulfillment = "自提" | "邮寄" | "待确认" | "待分类";

export type ItemStatus = "arrived" | "waiting" | "missing";

export type OrderItem = {
  id: string;
  raw: string;
  qty: number | null;
  status: ItemStatus | null;
};

export type OrderRow = {
  id: string;
  sourceSheet: string;
  sourceRow: number;
  route: string;
  name: string;
  phone: string;
  phoneKey: string;
  zip: string;
  address: string;
  orderNumber: string;
  content: string;
  amount: number | null;
  amountRaw: string;
  arrivalOriginal: string;
  paymentOriginal: string;
  items: OrderItem[];
  issues: string[];
  /** Unmodified original cells for archive / concurrency. */
  originalRow: unknown[];
};

export type CustomerGroup = {
  key: string;
  name: string;
  orders: OrderRow[];
  fulfillment: Fulfillment;
  phones: string[];
  routes: string[];
};
