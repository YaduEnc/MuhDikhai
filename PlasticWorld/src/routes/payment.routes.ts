import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import paymentService from '../services/payment.service';
import userService from '../services/user.service';

const router = Router();

/**
 * GET /api/v1/payments/plans
 * Public plan catalog for frontend
 */
router.get(
  '/plans',
  asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        plans: paymentService.getAvailablePlans(),
      },
    });
  })
);

/**
 * GET /api/v1/payments/me
 * Current user's premium status + recent payment orders
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const summary = await paymentService.getPaymentSummary(req.user!.id);
    res.status(200).json({
      success: true,
      data: summary,
    });
  })
);

/**
 * POST /api/v1/payments/create-order
 * Create a Cashfree payment order for the authenticated user
 */
router.post(
  '/create-order',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const planCode = typeof req.body?.planCode === 'string' ? req.body.planCode : '';
    const returnUrl = typeof req.body?.returnUrl === 'string' ? req.body.returnUrl : undefined;

    if (!planCode) {
      throw new AppError('planCode is required', 400, 'PLAN_CODE_REQUIRED');
    }

    const user = await userService.getUserById(req.user!.id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const order = await paymentService.createCashfreeOrder({
      userId: user.id,
      email: user.email,
      name: user.name,
      phoneNumber: user.phoneNumber || null,
      planCode,
      returnUrl,
    });

    res.status(200).json({
      success: true,
      data: order,
    });
  })
);

/**
 * POST /api/v1/payments/sync-order
 * Pull latest order state from Cashfree and update local order record.
 */
router.post(
  '/sync-order',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId : '';
    if (!orderId) {
      throw new AppError('orderId is required', 400, 'ORDER_ID_REQUIRED');
    }

    const order = await paymentService.syncOrderStatus(orderId, req.user!.id);

    res.status(200).json({
      success: true,
      data: {
        order,
      },
    });
  })
);

/**
 * GET /api/v1/payments/invoice/latest/pdf
 * Download invoice PDF for latest successful payment
 */
router.get(
  '/invoice/latest/pdf',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await paymentService.generateLatestInvoicePdf(req.user!.id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(invoice.buffer);
  })
);

/**
 * GET /api/v1/payments/invoice/:orderId/pdf
 * Download invoice PDF for a specific successful order
 */
router.get(
  '/invoice/:orderId/pdf',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const orderId = req.params.orderId;
    if (!orderId) {
      throw new AppError('orderId is required', 400, 'ORDER_ID_REQUIRED');
    }

    const invoice = await paymentService.generateInvoicePdfForOrder(req.user!.id, orderId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(invoice.buffer);
  })
);

/**
 * POST /api/v1/payments/webhook/cashfree
 * Cashfree webhook endpoint
 */
router.post(
  '/webhook/cashfree',
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody =
      typeof req.rawBody === 'string'
        ? req.rawBody
        : JSON.stringify(req.body || {});

    const signatureHeader = req.get('x-webhook-signature') || undefined;
    const timestampHeader = req.get('x-webhook-timestamp') || undefined;
    const idempotencyHeader = req.get('x-idempotency-key') || undefined;

    await paymentService.processCashfreeWebhook({
      rawBody,
      headers: {
        signature: signatureHeader,
        timestamp: timestampHeader,
        idempotencyKey: idempotencyHeader,
      },
    });

    res.status(200).json({
      success: true,
      received: true,
    });
  })
);

export default router;
