export type Role = "admin" | "manager" | "cashier";
export type PaymentMethod = "cash" | "card" | "other";
export type SaleStatus = "completed" | "refunded";

export type Branch = {
  id: string;
  code: string;
  name: string;
  address: string;
  active: boolean;
  createdAt: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** null for admins (access to all branches) */
  branchId: string | null;
  active: boolean;
  createdAt: string;
};

export type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string;
  priceCents: number;
  active: boolean;
  createdAt: string;
};

export type ProductWithStock = Product & { stock: number };

export type SaleItem = {
  productId: string;
  sku: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
};

export type Sale = {
  id: string;
  number: number;
  branchId: string;
  cashierId: string;
  status: SaleStatus;
  paymentMethod: PaymentMethod;
  items: SaleItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  tenderedCents: number;
  changeCents: number;
  createdAt: string;
  refundedAt: string | null;
  refundedById: string | null;
  refundReason: string | null;
};

export type SaleView = Sale & {
  receiptNo: string;
  branch: Pick<Branch, "id" | "code" | "name" | "address">;
  cashierName: string;
  refundedByName: string | null;
};

export type NewSaleInput = {
  branchId: string;
  items: { productId: string; quantity: number }[];
  paymentMethod: PaymentMethod;
  discountCents: number;
  /** Required for cash payments */
  tenderedCents?: number;
};

export type SaleFilters = {
  branchId?: string;
  /** ISO timestamp, inclusive */
  from?: string;
  /** ISO timestamp, inclusive */
  to?: string;
  status?: SaleStatus;
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  other: "Other",
};
