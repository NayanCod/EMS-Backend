import { FastifyInstance } from 'fastify';
import { Announcement } from '../../../../../models/Announcement';
import { User } from '../../../../../models/User';
import { notifyUsers } from '../../../../../services/notificationService';
import { logAction } from '../../../../../services/auditService';
import mongoose from 'mongoose';

export default async function announcementRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', fastify.authenticate);

  // POST /api/v1/app/announcement - Admin only
  fastify.post('/', async (request, reply) => {
    const user = request.user as any;
    
    if (user.role !== 'ADMIN') {
      return reply.forbidden('403', 'Only administrators can send announcements');
    }

    const { title, body, category, recipientScope, recipientIds } = request.body as any;

    if (!title || !body || !category || !recipientScope) {
      return reply.badRequest('MISSING_FIELDS', 'Title, body, category and recipientScope are required');
    }

    if (recipientScope === 'selected' && (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0)) {
      return reply.badRequest('INVALID_RECIPIENTS', 'At least one recipient must be selected when scope is "selected"');
    }

    const announcement = new Announcement({
      organizationId: user.organizationId,
      title,
      body,
      category,
      createdBy: user.id,
      recipientScope,
      recipientIds: recipientScope === 'selected' ? recipientIds : []
    });

    await announcement.save();

    // Log the announcement to the audit log
    logAction({
      organizationId: user.organizationId,
      actorId: user.id,
      actorRole: 'ADMIN',
      action: 'ANNOUNCEMENT_SENT',
      targetType: 'Announcement',
      targetId: announcement._id,
      metadata: {
        announcementTitle: announcement.title,
        recipientScope: announcement.recipientScope,
        category: announcement.category
      }
    });

    // Determine targeted recipient IDs to send notification to
    let recipients: string[] = [];
    if (recipientScope === 'all') {
      const activeUsers = await User.find({ 
        organizationId: user.organizationId, 
        status: 'ACTIVE',
        _id: { $ne: user.id } 
      }).select('_id').lean();
      recipients = activeUsers.map(u => u._id.toString());
    } else {
      recipients = recipientIds;
    }

    if (recipients.length > 0) {
      // Trigger notification service
      notifyUsers(recipients, 'ANNOUNCEMENT', {
        announcementId: announcement._id.toString(),
        title,
        body,
      });
    }

    return reply.created({ 
      message: 'Announcement sent successfully', 
      announcement 
    });
  });

  // GET /api/v1/app/announcement - Fetch announcements
  fastify.get('/', async (request, reply) => {
    const user = request.user as any;

    let query: any = { organizationId: user.organizationId };

    if (user.role !== 'ADMIN') {
      // Employee: can only see announcements targeting 'all' or specifically them
      query = {
        organizationId: user.organizationId,
        $or: [
          { recipientScope: 'all' },
          { recipientIds: user.id }
        ]
      };
    }

    const announcements = await Announcement.find(query)
      .populate('createdBy', 'name email profileImage')
      .sort({ createdAt: -1 })
      .lean();

    return reply.ok({ announcements });
  });

  // GET /api/v1/app/announcement/:id - Fetch individual announcement details
  fastify.get('/:id', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return reply.badRequest('INVALID_ID', 'Invalid Announcement ID');
    }

    const announcement = await Announcement.findById(id)
      .populate('createdBy', 'name email profileImage')
      .lean();

    if (!announcement) {
      return reply.notFound('Announcement not found');
    }

    // Check organization match
    if (announcement.organizationId.toString() !== user.organizationId.toString()) {
      return reply.forbidden('403', 'Access denied');
    }

    // Check employee access
    if (user.role !== 'ADMIN') {
      const isTargeted = announcement.recipientScope === 'all' || 
        (announcement.recipientIds && announcement.recipientIds.some((uid: any) => uid.toString() === user.id));
      if (!isTargeted) {
        return reply.forbidden('403', 'Access denied');
      }
    }

    return reply.ok({ announcement });
  });
}
