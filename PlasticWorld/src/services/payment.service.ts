import crypto from 'crypto';
import axios from 'axios';
import PDFDocument from 'pdfkit';
import database from '../config/database';
import logger from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

type PremiumTier = 'free' | 'plus';
type PremiumStatus = 'inactive' | 'active' | 'expired' | 'cancelled' | 'pending';

interface PlanConfig {
  code: 'plus_monthly';
  name: string;
  amount: number;
  currency: 'INR';
  validityDays: number;
  premiumTier: PremiumTier;
}

interface CreateOrderInput {
  userId: string;
  email: string;
  name: string;
  phoneNumber?: string | null;
  planCode: string;
  returnUrl?: string;
}

interface WebhookProcessInput {
  rawBody: string;
  headers: {
    signature?: string;
    timestamp?: string;
    idempotencyKey?: string;
  };
}

interface CreateOrderResult {
  orderId: string;
  cfOrderId?: string;
  paymentSessionId: string;
  amount: number;
  currency: string;
  planCode: string;
  planName: string;
}

interface PaymentStatusSummary {
  tier: PremiumTier;
  status: PremiumStatus;
  startedAt: string | null;
  expiresAt: string | null;
  verifiedBadgeEnabled: boolean;
}

interface PaymentOrderRow {
  orderId: string;
  cfOrderId: string | null;
  planCode: string;
  amount: string;
  currency: string;
  orderStatus: string;
  paymentStatus: string;
  paymentSessionId: string | null;
  cfPaymentId: string | null;
  paymentMessage: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface InvoiceSourceRow {
  orderId: string;
  cfOrderId: string | null;
  planCode: string;
  amount: string;
  currency: string;
  paymentStatus: string;
  paidAt: Date | null;
  createdAt: Date;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string | null;
}

const PLAN_CONFIGS: Record<string, PlanConfig> = {
  plus_monthly: {
    code: 'plus_monthly',
    name: 'Muhdikhai Plus (Monthly Intro)',
    amount: 5,
    currency: 'INR',
    validityDays: 30,
    premiumTier: 'plus',
  },
};

class PaymentService {
  private readonly cashfreeApiVersion = process.env.CASHFREE_API_VERSION || '2023-08-01';

  getAvailablePlans(): Array<{ code: string; name: string; amount: number; currency: string; validityDays: number }> {
    return Object.values(PLAN_CONFIGS).map((plan) => ({
      code: plan.code,
      name: plan.name,
      amount: plan.amount,
      currency: plan.currency,
      validityDays: plan.validityDays,
    }));
  }

  private getCashfreeBaseUrl(): string {
    if (process.env.CASHFREE_BASE_URL) {
      return process.env.CASHFREE_BASE_URL;
    }

    const env = (process.env.CASHFREE_ENV || 'sandbox').toLowerCase();
    return env === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  private getCashfreeHeaders(): Record<string, string> {
    const clientId = process.env.CASHFREE_CLIENT_ID;
    const clientSecret = process.env.CASHFREE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new AppError(
        'Cashfree is not configured. Missing CASHFREE_CLIENT_ID/CASHFREE_CLIENT_SECRET.',
        500,
        'CASHFREE_NOT_CONFIGURED'
      );
    }

    return {
      'Content-Type': 'application/json',
      'x-api-version': this.cashfreeApiVersion,
      'x-client-id': clientId,
      'x-client-secret': clientSecret,
    };
  }

  private getPlan(planCode: string): PlanConfig {
    const plan = PLAN_CONFIGS[planCode];
    if (!plan) {
      throw new AppError(`Unsupported plan "${planCode}"`, 400, 'UNSUPPORTED_PLAN');
    }
    return plan;
  }

  private generateOrderId(planCode: string): string {
    const compactPlan = planCode.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const nonce = crypto.randomBytes(5).toString('hex');
    return `mdk_${compactPlan}_${Date.now()}_${nonce}`.slice(0, 90);
  }

  private sanitizePhone(phone: string | null | undefined): string {
    if (!phone) return '9999999999';
    const digits = phone.replace(/[^\d]/g, '');
    if (digits.length < 10) return '9999999999';
    return digits.slice(-10);
  }

  private normalizeReturnUrl(returnUrl?: string): string | undefined {
    if (!returnUrl) return process.env.CASHFREE_RETURN_URL || undefined;
    if (/^https?:\/\//i.test(returnUrl)) return returnUrl;
    throw new AppError('returnUrl must be an absolute URL', 400, 'INVALID_RETURN_URL');
  }

  async createCashfreeOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const plan = this.getPlan(input.planCode);
    const orderId = this.generateOrderId(plan.code);
    const returnUrl = this.normalizeReturnUrl(input.returnUrl);

    const payload = {
      order_id: orderId,
      order_amount: plan.amount,
      order_currency: plan.currency,
      customer_details: {
        customer_id: input.userId,
        customer_email: input.email,
        customer_name: input.name,
        customer_phone: this.sanitizePhone(input.phoneNumber),
      },
      order_meta: returnUrl
        ? {
            return_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}order_id={order_id}`,
          }
        : undefined,
      order_note: `${plan.name} purchase`,
      order_tags: {
        plan_code: plan.code,
        user_id: input.userId,
      },
    };

    try {
      const response = await axios.post(
        `${this.getCashfreeBaseUrl()}/orders`,
        payload,
        { headers: this.getCashfreeHeaders(), timeout: 15000 }
      );
      const data = response.data as {
        order_id: string;
        cf_order_id?: string;
        payment_session_id: string;
        order_status?: string;
        order_expiry_time?: string;
      };

      if (!data?.payment_session_id || !data?.order_id) {
        throw new AppError('Cashfree create order response is missing required fields', 502, 'CASHFREE_BAD_RESPONSE');
      }

      await database.query(
        `INSERT INTO payment_orders (
          user_id, provider, order_id, cf_order_id, payment_session_id, plan_code,
          amount, currency, order_status, payment_status, metadata, expires_at
        ) VALUES ($1, 'cashfree', $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9, $10)`,
        [
          input.userId,
          data.order_id,
          data.cf_order_id || null,
          data.payment_session_id,
          plan.code,
          plan.amount,
          plan.currency,
          data.order_status || 'ACTIVE',
          JSON.stringify({ planName: plan.name, validityDays: plan.validityDays }),
          data.order_expiry_time || null,
        ]
      );

      logger.info('Cashfree order created', {
        userId: input.userId,
        orderId: data.order_id,
        planCode: plan.code,
        amount: plan.amount,
      });

      return {
        orderId: data.order_id,
        cfOrderId: data.cf_order_id,
        paymentSessionId: data.payment_session_id,
        amount: plan.amount,
        currency: plan.currency,
        planCode: plan.code,
        planName: plan.name,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : 'Failed to create payment order';
      logger.error('Cashfree create order failed', {
        userId: input.userId,
        planCode: input.planCode,
        error: message,
      });
      throw new AppError(message, 502, 'CASHFREE_ORDER_CREATE_FAILED');
    }
  }

  async syncOrderStatus(orderId: string, userId: string): Promise<PaymentOrderRow | null> {
    const existing = await database.query<{ userId: string; planCode: string }>(
      'SELECT user_id as "userId", plan_code as "planCode" FROM payment_orders WHERE order_id = $1 LIMIT 1',
      [orderId]
    );

    if (existing.rows.length === 0) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }
    if (existing.rows[0].userId !== userId) {
      throw new AppError('This order does not belong to the current user', 403, 'ORDER_ACCESS_DENIED');
    }

    try {
      const response = await axios.get(
        `${this.getCashfreeBaseUrl()}/orders/${encodeURIComponent(orderId)}`,
        { headers: this.getCashfreeHeaders(), timeout: 15000 }
      );

      const order = response.data as {
        order_status?: string;
        cf_order_id?: string;
        payment_session_id?: string;
      };

      const isPaid = order.order_status === 'PAID';
      const paymentStatus = isPaid ? 'SUCCESS' : 'PENDING';

      await database.query(
        `UPDATE payment_orders
         SET cf_order_id = COALESCE($1, cf_order_id),
             payment_session_id = COALESCE($2, payment_session_id),
             order_status = COALESCE($3, order_status),
             payment_status = $4,
             paid_at = CASE WHEN $6 THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END
         WHERE order_id = $5`,
        [order.cf_order_id || null, order.payment_session_id || null, order.order_status || null, paymentStatus, orderId, isPaid]
      );

      if (isPaid) {
        const plan = this.getPlan(existing.rows[0].planCode);
        await this.activatePremiumForOrder(orderId, plan);
      }
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : 'Failed to sync order status';
      logger.warn('Cashfree order sync failed', { orderId, userId, error: message });
    }

    return this.getOrderByOrderId(orderId, userId);
  }

  async getOrderByOrderId(orderId: string, userId: string): Promise<PaymentOrderRow | null> {
    const result = await database.query<PaymentOrderRow>(
      `SELECT
        order_id as "orderId",
        cf_order_id as "cfOrderId",
        plan_code as "planCode",
        amount::text as amount,
        currency,
        order_status as "orderStatus",
        payment_status as "paymentStatus",
        payment_session_id as "paymentSessionId",
        cf_payment_id as "cfPaymentId",
        payment_message as "paymentMessage",
        paid_at as "paidAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM payment_orders
       WHERE order_id = $1 AND user_id = $2
       LIMIT 1`,
      [orderId, userId]
    );
    return result.rows[0] || null;
  }

  async getPaymentSummary(userId: string): Promise<{ premium: PaymentStatusSummary; recentOrders: PaymentOrderRow[] }> {
    const userResult = await database.query<{
      premiumTier: PremiumTier;
      premiumStatus: PremiumStatus;
      premiumStartedAt: Date | null;
      premiumExpiresAt: Date | null;
      verifiedBadgeEnabled: boolean;
    }>(
      `SELECT
        premium_tier as "premiumTier",
        premium_status as "premiumStatus",
        premium_started_at as "premiumStartedAt",
        premium_expires_at as "premiumExpiresAt",
        verified_badge_enabled as "verifiedBadgeEnabled"
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const orderResult = await database.query<PaymentOrderRow>(
      `SELECT
        order_id as "orderId",
        cf_order_id as "cfOrderId",
        plan_code as "planCode",
        amount::text as amount,
        currency,
        order_status as "orderStatus",
        payment_status as "paymentStatus",
        payment_session_id as "paymentSessionId",
        cf_payment_id as "cfPaymentId",
        payment_message as "paymentMessage",
        paid_at as "paidAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM payment_orders
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    const user = userResult.rows[0];
    return {
      premium: {
        tier: user.premiumTier,
        status: user.premiumStatus,
        startedAt: user.premiumStartedAt ? user.premiumStartedAt.toISOString() : null,
        expiresAt: user.premiumExpiresAt ? user.premiumExpiresAt.toISOString() : null,
        verifiedBadgeEnabled: user.verifiedBadgeEnabled,
      },
      recentOrders: orderResult.rows,
    };
  }

  private formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  private buildInvoiceFileName(orderId: string): string {
    const compact = orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase();
    return `muhdikhai-invoice-${compact}.pdf`;
  }

  private async getInvoiceSource(userId: string, orderId?: string): Promise<InvoiceSourceRow> {
    const query = orderId
      ? `SELECT
           po.order_id as "orderId",
           po.cf_order_id as "cfOrderId",
           po.plan_code as "planCode",
           po.amount::text as amount,
           po.currency,
           po.payment_status as "paymentStatus",
           po.paid_at as "paidAt",
           po.created_at as "createdAt",
           u.id as "userId",
           u.name as "userName",
           u.email as "userEmail",
           u.phone_number as "userPhone"
         FROM payment_orders po
         INNER JOIN users u ON u.id = po.user_id
         WHERE po.user_id = $1
           AND po.order_id = $2
           AND po.payment_status = 'SUCCESS'
         LIMIT 1`
      : `SELECT
           po.order_id as "orderId",
           po.cf_order_id as "cfOrderId",
           po.plan_code as "planCode",
           po.amount::text as amount,
           po.currency,
           po.payment_status as "paymentStatus",
           po.paid_at as "paidAt",
           po.created_at as "createdAt",
           u.id as "userId",
           u.name as "userName",
           u.email as "userEmail",
           u.phone_number as "userPhone"
         FROM payment_orders po
         INNER JOIN users u ON u.id = po.user_id
         WHERE po.user_id = $1
           AND po.payment_status = 'SUCCESS'
         ORDER BY COALESCE(po.paid_at, po.created_at) DESC
         LIMIT 1`;

    const params = orderId ? [userId, orderId] : [userId];
    const result = await database.query<InvoiceSourceRow>(query, params);
    const row = result.rows[0];

    if (!row) {
      throw new AppError(
        orderId
          ? 'Paid order not found for invoice generation'
          : 'No successful payment found for invoice export',
        404,
        'INVOICE_SOURCE_NOT_FOUND'
      );
    }

    return row;
  }

  private async renderInvoicePdf(row: InvoiceSourceRow): Promise<Buffer> {
    const plan = PLAN_CONFIGS[row.planCode];
    const amount = Number(row.amount);
    const subtotal = Number.isFinite(amount) ? amount : 0;
    const tax = 0;
    const total = subtotal + tax;
    const paidAt = row.paidAt || row.createdAt;
    const invoiceDate = paidAt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const invoiceId = `INV-${row.orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}`;

    const doc = new PDFDocument({
      size: 'A4',
      margin: 42,
      info: {
        Title: `Muhdikhai Invoice ${invoiceId}`,
        Author: 'Muhdikhai Billing',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

    doc.rect(0, 0, doc.page.width, 120).fill('#0B1329');
    doc.fillColor('#9BE6FF').font('Helvetica-Bold').fontSize(12).text('MUHDIKHAI', 42, 30);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(28).text('INVOICE', 42, 48);
    doc.fillColor('#9CB4D8').font('Helvetica').fontSize(10).text('Random chat platform billing receipt', 42, 82);

    doc.fillColor('#D6E4FA').font('Helvetica-Bold').fontSize(11).text('Invoice ID', 42, 138);
    doc.fillColor('#F8FBFF').font('Helvetica').fontSize(11).text(invoiceId, 42, 154);

    doc.fillColor('#D6E4FA').font('Helvetica-Bold').fontSize(11).text('Date', 220, 138);
    doc.fillColor('#F8FBFF').font('Helvetica').fontSize(11).text(invoiceDate, 220, 154);

    doc.fillColor('#D6E4FA').font('Helvetica-Bold').fontSize(11).text('Order ID', 360, 138);
    doc.fillColor('#F8FBFF').font('Helvetica').fontSize(11).text(row.orderId, 360, 154, { width: 190 });

    doc.fillColor('#D6E4FA').font('Helvetica-Bold').fontSize(11).text('Billed To', 42, 196);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text(row.userName, 42, 214);
    doc.fillColor('#C2D1EA').font('Helvetica').fontSize(10).text(row.userEmail, 42, 232);
    if (row.userPhone) {
      doc.fillColor('#C2D1EA').font('Helvetica').fontSize(10).text(row.userPhone, 42, 246);
    }

    doc.fillColor('#D6E4FA').font('Helvetica-Bold').fontSize(11).text('From', 360, 196);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text('Muhdikhai', 360, 214);
    doc.fillColor('#C2D1EA').font('Helvetica').fontSize(10).text('support@muhdikhai.in', 360, 232);

    const tableTop = 292;
    doc.roundedRect(42, tableTop, 512, 28, 6).fill('#101C3C');
    doc.fillColor('#B8CAE7').font('Helvetica-Bold').fontSize(10);
    doc.text('Description', 54, tableTop + 9);
    doc.text('Qty', 335, tableTop + 9);
    doc.text('Unit Price', 390, tableTop + 9);
    doc.text('Amount', 485, tableTop + 9);

    const rowTop = tableTop + 32;
    doc.roundedRect(42, rowTop, 512, 42, 6).strokeColor('#22365F').lineWidth(1).stroke();
    doc.fillColor('#F1F7FF').font('Helvetica').fontSize(10);
    doc.text(plan?.name || row.planCode, 54, rowTop + 15, { width: 260 });
    doc.text('1', 340, rowTop + 15);
    doc.text(this.formatCurrency(subtotal, row.currency), 390, rowTop + 15);
    doc.text(this.formatCurrency(subtotal, row.currency), 485, rowTop + 15);

    const summaryTop = rowTop + 66;
    doc.fillColor('#D6E4FA').font('Helvetica').fontSize(10).text('Subtotal', 390, summaryTop);
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(10).text(this.formatCurrency(subtotal, row.currency), 485, summaryTop);

    doc.fillColor('#D6E4FA').font('Helvetica').fontSize(10).text('Tax', 390, summaryTop + 18);
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(10).text(this.formatCurrency(tax, row.currency), 485, summaryTop + 18);

    doc.moveTo(390, summaryTop + 38).lineTo(554, summaryTop + 38).strokeColor('#2A4370').stroke();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text('Total Paid', 390, summaryTop + 46);
    doc.fillColor('#9BE6FF').font('Helvetica-Bold').fontSize(12).text(this.formatCurrency(total, row.currency), 485, summaryTop + 46);

    doc.roundedRect(42, 660, 512, 74, 8).fill('#0B1329');
    doc.fillColor('#C8D8F0').font('Helvetica-Bold').fontSize(10).text('Payment Details', 54, 676);
    doc.fillColor('#9DB2D6').font('Helvetica').fontSize(9)
      .text(`Status: ${row.paymentStatus}`, 54, 694)
      .text(`Cashfree Order ID: ${row.cfOrderId || 'N/A'}`, 54, 708);
    doc.fillColor('#9DB2D6').font('Helvetica').fontSize(9)
      .text('Thank you for supporting Muhdikhai Plus.', 54, 722);

    const bufferPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.end();
    return bufferPromise;
  }

  async generateInvoicePdfForOrder(userId: string, orderId: string): Promise<{ fileName: string; buffer: Buffer }> {
    const source = await this.getInvoiceSource(userId, orderId);
    const buffer = await this.renderInvoicePdf(source);
    return {
      fileName: this.buildInvoiceFileName(source.orderId),
      buffer,
    };
  }

  async generateLatestInvoicePdf(userId: string): Promise<{ fileName: string; buffer: Buffer }> {
    const source = await this.getInvoiceSource(userId);
    const buffer = await this.renderInvoicePdf(source);
    return {
      fileName: this.buildInvoiceFileName(source.orderId),
      buffer,
    };
  }

  private verifyWebhookSignature(rawBody: string, timestamp?: string, signature?: string): 'verified' | 'failed' | 'skipped' {
    const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET;
    if (!webhookSecret) return 'skipped';
    if (!timestamp || !signature) return 'failed';

    const signedPayload = `${timestamp}${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('base64');

    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== providedBuffer.length) return 'failed';
    return crypto.timingSafeEqual(expectedBuffer, providedBuffer) ? 'verified' : 'failed';
  }

  private async activatePremiumForOrder(orderId: string, plan: PlanConfig): Promise<void> {
    await database.query(
      `UPDATE users u
       SET premium_tier = $1,
           premium_status = 'active',
           premium_started_at = COALESCE(u.premium_started_at, CURRENT_TIMESTAMP),
           premium_expires_at = CASE
             WHEN u.premium_expires_at IS NOT NULL AND u.premium_expires_at > CURRENT_TIMESTAMP
               THEN u.premium_expires_at + ($2 || ' days')::interval
             ELSE CURRENT_TIMESTAMP + ($2 || ' days')::interval
           END,
           verified_badge_enabled = true
       FROM payment_orders po
       WHERE po.order_id = $3
         AND po.user_id = u.id`,
      [plan.premiumTier, plan.validityDays, orderId]
    );
  }

  async processCashfreeWebhook(input: WebhookProcessInput): Promise<{ ok: true; ignored?: boolean }> {
    const verificationStatus = this.verifyWebhookSignature(
      input.rawBody,
      input.headers.timestamp,
      input.headers.signature
    );

    let parsedPayload: any = null;
    try {
      parsedPayload = JSON.parse(input.rawBody);
    } catch {
      parsedPayload = null;
    }

    const orderId = parsedPayload?.data?.order?.order_id as string | undefined;
    const eventType = parsedPayload?.type as string | undefined;
    const eventId = input.headers.idempotencyKey || parsedPayload?.data?.payment?.cf_payment_id || null;

    try {
      await database.query(
        `INSERT INTO payment_webhook_events (
          provider, event_id, order_id, event_type, signature, payload_raw, payload, verification_status
        ) VALUES ('cashfree', $1, $2, $3, $4, $5, $6, $7)`,
        [
          eventId,
          orderId || null,
          eventType || null,
          input.headers.signature || null,
          input.rawBody,
          parsedPayload ? JSON.stringify(parsedPayload) : null,
          verificationStatus,
        ]
      );
    } catch (error) {
      const pgCode = (error as { code?: string } | null)?.code;
      if (pgCode === '23505') {
        logger.info('Duplicate Cashfree webhook ignored', { eventId, orderId, eventType });
        return { ok: true, ignored: true };
      }
      throw error;
    }

    if (verificationStatus === 'failed') {
      logger.warn('Cashfree webhook signature verification failed', {
        orderId,
        eventType,
      });
      return { ok: true, ignored: true };
    }

    if (!orderId) {
      return { ok: true, ignored: true };
    }

    const payment = parsedPayload?.data?.payment;
    const paymentStatus = (payment?.payment_status as string | undefined) || 'PENDING';
    const cfPaymentId = (payment?.cf_payment_id as string | undefined) || null;
    const paymentMessage = (payment?.payment_message as string | undefined) || null;
    const orderStatus = paymentStatus === 'SUCCESS' ? 'PAID' : 'ACTIVE';

    await database.query(
      `UPDATE payment_orders
       SET order_status = $1,
           payment_status = $2,
           cf_payment_id = COALESCE($3, cf_payment_id),
           payment_message = COALESCE($4, payment_message),
           paid_at = CASE WHEN $2 = 'SUCCESS' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END
       WHERE order_id = $5`,
      [orderStatus, paymentStatus, cfPaymentId, paymentMessage, orderId]
    );

    if (paymentStatus === 'SUCCESS') {
      const orderResult = await database.query<{ planCode: string }>(
        'SELECT plan_code as "planCode" FROM payment_orders WHERE order_id = $1 LIMIT 1',
        [orderId]
      );
      if (orderResult.rows.length > 0) {
        const plan = this.getPlan(orderResult.rows[0].planCode);
        await this.activatePremiumForOrder(orderId, plan);
      }
    }

    await database.query(
      `UPDATE payment_webhook_events
       SET processed = true, processed_at = CURRENT_TIMESTAMP
       WHERE provider = 'cashfree'
         AND event_id IS NOT DISTINCT FROM $1
         AND order_id IS NOT DISTINCT FROM $2`,
      [eventId, orderId]
    );

    logger.info('Cashfree webhook processed', {
      orderId,
      eventType,
      paymentStatus,
      verificationStatus,
    });

    return { ok: true };
  }
}

export default new PaymentService();
