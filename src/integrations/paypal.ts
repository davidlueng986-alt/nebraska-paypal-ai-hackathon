import type { Batch, Currency } from "../core/model";
import { DomainError, hash } from "../core/util";
export type LinkResult = { id: string; approveUrl: string };
export interface Payments {
  mode: "demo" | "sandbox";
  subscription(
    orgId: string,
    quantity: number,
    currency: Currency,
  ): Promise<LinkResult>;
  revise(subscriptionId: string, quantity: number): Promise<LinkResult>;
  cancel(subscriptionId: string): Promise<void>;
  getSubscription(id: string): Promise<any>;
  createOrder(
    grantId: string,
    cents: number,
    currency: Currency,
  ): Promise<LinkResult>;
  captureOrder(orderId: string): Promise<any>;
  getOrder(orderId: string): Promise<any>;
  payout(batch: Batch): Promise<{ id: string; items?: any[]; status?: string }>;
  getBatch(id: string): Promise<any>;
  getItem(id: string): Promise<any>;
  cancelItem(id: string): Promise<any>;
  verifyWebhook(headers: Headers, event: unknown): Promise<boolean>;
  transactions(start: string, end: string): Promise<any[]>;
}
export function payoutPayload(batch: Batch) {
  return {
    sender_batch_header: {
      sender_batch_id: batch.id,
      email_subject: "Nebraska: your open-source maintenance income",
      email_message:
        "Your verified open-source usage has funded this payment. View your Nebraska statement for details.",
    },
    items: batch.items.map((i) => ({
      recipient_type: "EMAIL",
      receiver: i.receiver,
      amount: { value: (i.cents / 100).toFixed(2), currency: i.currency },
      sender_item_id: i.id,
      note: `Open-source maintenance · ${batch.period}`,
    })),
  };
}
export class PayPalError extends DomainError {
  constructor(
    status: number,
    public providerError: any,
  ) {
    super(
      `PayPal HTTP ${status} ${providerError?.name ?? ""}`,
      502,
      "PAYPAL_ERROR",
    );
  }
}
export class PayPalSandbox implements Payments {
  mode = "sandbox" as const;
  private token = "";
  private expires = 0;
  private base = "https://api-m.sandbox.paypal.com";
  constructor(
    private clientId = process.env.PAYPAL_CLIENT_ID ?? "",
    private secret = process.env.PAYPAL_CLIENT_SECRET ?? "",
    private appUrl = process.env.APP_URL ?? "http://localhost:3000",
  ) {}
  private async auth() {
    if (this.token && Date.now() < this.expires) return this.token;
    if (!this.clientId || !this.secret)
      throw new DomainError("Configure PayPal sandbox credentials", 503);
    const r = await fetch(this.base + "/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${this.clientId}:${this.secret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok)
      throw new DomainError(`PayPal authentication HTTP ${r.status}`, 502);
    const d = await r.json();
    this.token = d.access_token;
    this.expires = Date.now() + (d.expires_in - 60) * 1000;
    return this.token;
  }
  async request(
    path: string,
    method = "GET",
    body?: unknown,
    requestId?: string,
  ): Promise<any> {
    const token = await this.auth();
    const r = await fetch(this.base + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(requestId ? { "PayPal-Request-Id": requestId.slice(0, 38) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) {
      let error: any = {};
      try {
        error = await r.json();
      } catch {}
      throw new PayPalError(r.status, error);
    }
    return r.status === 204 ? {} : r.json();
  }
  private approval(d: any) {
    const link = d.links?.find((l: any) =>
      ["approve", "payer-action"].includes(l.rel),
    );
    if (!link)
      throw new DomainError("PayPal did not return an approval link", 502);
    const url = new URL(link.href);
    if (
      url.protocol !== "https:" ||
      !(
        url.hostname === "www.sandbox.paypal.com" ||
        url.hostname === "sandbox.paypal.com"
      )
    )
      throw new DomainError("Unexpected PayPal approval URL", 502);
    return { id: d.id, approveUrl: link.href };
  }
  async subscription(orgId: string, quantity: number, currency: Currency) {
    // Stable request keys safely reuse catalog and quantity plan across restarts.
    const product = await this.request(
      "/v1/catalogs/products",
      "POST",
      {
        name: "Nebraska open-source maintenance",
        type: "SERVICE",
        category: "SOFTWARE",
      },
      "neb-product-1",
    );
    const plan = await this.request(
      "/v1/billing/plans",
      "POST",
      {
        product_id: product.id,
        name: `Nebraska ${currency} monthly budget`,
        status: "ACTIVE",
        quantity_supported: true,
        billing_cycles: [
          {
            frequency: { interval_unit: "MONTH", interval_count: 1 },
            tenure_type: "REGULAR",
            sequence: 1,
            total_cycles: 0,
            pricing_scheme: {
              fixed_price: { value: "1.00", currency_code: currency },
            },
          },
        ],
        payment_preferences: {
          auto_bill_outstanding: true,
          payment_failure_threshold: 2,
        },
      },
      `neb-plan-${currency}-1`,
    );
    const sub = await this.request(
      "/v1/billing/subscriptions",
      "POST",
      {
        plan_id: plan.id,
        quantity: String(quantity),
        custom_id: orgId,
        application_context: {
          brand_name: "Nebraska",
          user_action: "SUBSCRIBE_NOW",
          return_url: this.appUrl + "/api/paypal/return?kind=subscription",
          cancel_url: this.appUrl + "/?approval=cancelled",
        },
      },
      `neb-sub-${hash({ orgId, quantity, currency }).slice(0, 25)}`,
    );
    return this.approval(sub);
  }
  async revise(subscriptionId: string, quantity: number) {
    const d = await this.request(
      `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/revise`,
      "POST",
      {
        quantity: String(quantity),
        application_context: {
          return_url: this.appUrl + "/api/paypal/return?kind=subscription",
          cancel_url: this.appUrl + "/?approval=cancelled",
        },
      },
    );
    return {
      ...this.approval({ ...d, id: subscriptionId }),
      id: subscriptionId,
    };
  }
  async cancel(subscriptionId: string) {
    await this.request(
      `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      "POST",
      { reason: "Cancelled by Nebraska budget owner" },
    );
  }
  getSubscription(id: string) {
    return this.request(`/v1/billing/subscriptions/${encodeURIComponent(id)}`);
  }
  async createOrder(grantId: string, cents: number, currency: Currency) {
    return this.approval(
      await this.request(
        "/v2/checkout/orders",
        "POST",
        {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: grantId,
              custom_id: grantId,
              amount: {
                currency_code: currency,
                value: (cents / 100).toFixed(2),
              },
              description: "Nebraska emergency maintainer grant",
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                user_action: "PAY_NOW",
                return_url:
                  this.appUrl +
                  `/api/paypal/return?kind=grant&grant=${encodeURIComponent(grantId)}`,
                cancel_url: this.appUrl + "/?approval=cancelled",
              },
            },
          },
        },
        grantId,
      ),
    );
  }
  captureOrder(id: string) {
    return this.request(
      `/v2/checkout/orders/${encodeURIComponent(id)}/capture`,
      "POST",
      {},
      `cap-${id}`,
    );
  }
  getOrder(id: string) {
    return this.request(`/v2/checkout/orders/${encodeURIComponent(id)}`);
  }
  async payout(batch: Batch) {
    try {
      const d = await this.request(
        "/v1/payments/payouts",
        "POST",
        payoutPayload(batch),
        batch.id,
      );
      return {
        id: d.batch_header.payout_batch_id,
        status: d.batch_header.batch_status,
      };
    } catch (e) {
      if (
        e instanceof PayPalError &&
        JSON.stringify(e.providerError).includes("DUPLICATE_BATCH_ID")
      ) {
        const links = [
          ...(e.providerError.links ?? []),
          ...(e.providerError.details ?? []).flatMap((d: any) => d.links ?? []),
        ];
        const link = links.find(
          (l: any) =>
            typeof l.href === "string" &&
            l.href.startsWith(this.base + "/v1/payments/payouts/"),
        );
        if (link) {
          const path = new URL(link.href).pathname;
          const d = await this.request(path);
          if (d.batch_header?.sender_batch_header?.sender_batch_id !== batch.id)
            throw new DomainError(
              "Duplicate batch response identity mismatch",
              409,
            );
          return {
            id: d.batch_header.payout_batch_id,
            status: d.batch_header.batch_status,
            items: d.items,
          };
        }
      }
      throw e;
    }
  }
  async getBatch(id: string) {
    const all: any[] = [];
    let page = 1;
    let header: any;
    for (;;) {
      const d = await this.request(
        `/v1/payments/payouts/${encodeURIComponent(id)}?page_size=1000&page=${page}&total_required=true`,
      );
      header = d.batch_header;
      all.push(...(d.items ?? []));
      if (!d.links?.some((l: any) => l.rel === "next")) break;
      if (++page > 20)
        throw new DomainError("Payout pagination limit reached", 502);
    }
    return { batch_header: header, items: all };
  }
  getItem(id: string) {
    return this.request(`/v1/payments/payouts-item/${encodeURIComponent(id)}`);
  }
  cancelItem(id: string) {
    return this.request(
      `/v1/payments/payouts-item/${encodeURIComponent(id)}/cancel`,
      "POST",
      {},
    );
  }
  async verifyWebhook(headers: Headers, event: unknown) {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) return false;
    const fields = [
      "paypal-auth-algo",
      "paypal-cert-url",
      "paypal-transmission-id",
      "paypal-transmission-sig",
      "paypal-transmission-time",
    ];
    if (fields.some((f) => !headers.get(f))) return false;
    const d = await this.request(
      "/v1/notifications/verify-webhook-signature",
      "POST",
      {
        auth_algo: headers.get(fields[0]),
        cert_url: headers.get(fields[1]),
        transmission_id: headers.get(fields[2]),
        transmission_sig: headers.get(fields[3]),
        transmission_time: headers.get(fields[4]),
        webhook_id: webhookId,
        webhook_event: event,
      },
    );
    return d.verification_status === "SUCCESS";
  }
  async transactions(start: string, end: string) {
    const rows: any[] = [];
    for (let page = 1; page <= 100; page++) {
      const d = await this.request(
        `/v1/reporting/transactions?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&page_size=500&page=${page}&fields=transaction_info`,
      );
      rows.push(...(d.transaction_details ?? []));
      if (page >= Number(d.total_pages ?? 1)) return rows;
    }
    throw new DomainError("Reporting pagination limit reached", 502);
  }
}
export class DemoPayments implements Payments {
  mode = "demo" as const;
  async subscription(orgId: string, quantity: number, currency: Currency) {
    return {
      id: `DEMO-SUB-${hash({ orgId, quantity, currency }).slice(0, 12)}`,
      approveUrl: "/demo/approval?kind=subscription",
    };
  }
  async revise(id: string, quantity: number) {
    return {
      id,
      approveUrl: `/demo/approval?kind=subscription&quantity=${quantity}`,
    };
  }
  async cancel() {}
  async getSubscription(id: string) {
    return { id, status: "ACTIVE", quantity: "500" };
  }
  async createOrder(id: string) {
    return {
      id: `DEMO-ORDER-${id}`,
      approveUrl: `/demo/approval?kind=grant&grant=${id}`,
    };
  }
  async captureOrder(id: string) {
    return {
      id,
      status: "COMPLETED",
      purchase_units: [
        {
          payments: {
            captures: [{ id: `DEMO-CAP-${id}`, status: "COMPLETED" }],
          },
        },
      ],
    };
  }
  async getOrder(id: string) {
    return { id, status: "APPROVED" };
  }
  async payout(batch: Batch) {
    return {
      id: `DEMO-PAYOUT-${batch.period}`,
      status: "SUCCESS",
      items: batch.items.map((i) => ({
        payout_item_id: `DEMO-ITEM-${i.id}`,
        transaction_status: "SUCCESS",
        payout_item: {
          sender_item_id: i.id,
          receiver: i.receiver,
          amount: { value: (i.cents / 100).toFixed(2), currency: i.currency },
        },
      })),
    };
  }
  async getBatch(id: string) {
    return { batch_header: { payout_batch_id: id }, items: [] };
  }
  async getItem() {
    return {};
  }
  async cancelItem() {
    return {};
  }
  async verifyWebhook() {
    return false;
  }
  async transactions() {
    return [];
  }
}
export function getPayments(): Payments {
  return process.env.NEBRASKA_MODE === "sandbox"
    ? new PayPalSandbox()
    : new DemoPayments();
}
