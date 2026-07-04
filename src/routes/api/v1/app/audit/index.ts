import { FastifyInstance } from 'fastify';
import { AuditLog } from '../../../../../models/AuditLog';
import mongoose from 'mongoose';

export default async function auditRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', fastify.requireAdmin);

  fastify.get('/', async (request, reply) => {
    const admin = request.user as any;
    const {
      page = 1,
      limit = 10,
      action,
      actorId,
      targetType,
      startDate,
      endDate
    } = request.query as any;

    const query: any = {
      organizationId: admin.organizationId
    };

    if (action) {
      query.action = action;
    }

    if (actorId && mongoose.Types.ObjectId.isValid(actorId)) {
      query.actorId = new mongoose.Types.ObjectId(actorId);
    }

    if (targetType) {
      query.targetType = targetType;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .populate('actorId', 'name email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    return reply.ok({
      logs,
      total,
      page: pageNum,
      limit: limitNum
    });
  });
}
