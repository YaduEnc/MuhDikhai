import crypto from 'crypto';
import axios from 'axios';
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

const PLAN_CONFIGS: Record<string, PlanConfig> = {
  plus_monthly: {
    code: 'plus_monthly',
    name: 'Muhdikhai Plus (Monthly)',
    amount: 99,
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
             paid_at = CASE WHEN $4 = 'SUCCESS' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END
         WHERE order_id = $5`,
        [order.cf_order_id || null, order.payment_session_id || null, order.order_status || null, paymentStatus, orderId]
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
