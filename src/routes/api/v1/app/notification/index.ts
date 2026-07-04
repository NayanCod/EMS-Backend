import { FastifyInstance } from 'fastify';
import { Notification } from '../../../../../models/Notification';
import { User } from '../../../../../models/User';
import { NOTIFICATION_REGISTRY, getNotificationConfig, NotificationType } from '../../../../../services/notificationRegistry';

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Protect all notification routes
  fastify.addHook('preValidation', fastify.authenticate);

  // Fetch notifications with pagination, category, and read filtering
  fastify.get('/', async (request, reply) => {
    const user = request.user as any;
    const { page = 1, limit = 20, category, read } = request.query as any;

    const query: any = { userId: user.id };

    // Filter by read status
    if (read === 'true') {
      query.status = 'read';
    } else if (read === 'false') {
      query.status = 'unread';
    } else if (read === 'all') {
      // no status filter
    } else {
      // Fallback/backward compatibility with legacy "status" query param
      const { status } = request.query as any;
      if (status === 'unread' || status === 'read') {
        query.status = status;
      } else if (status !== 'all') {
        // Default to unread for backwards compatibility if no read status param is provided
        query.status = 'unread';
      }
    }

    // Filter by category
    if (category && category !== 'all') {
      const matchingTypes = Object.keys(NOTIFICATION_REGISTRY).filter((key) => {
        return NOTIFICATION_REGISTRY[key as NotificationType].category === category;
      });
      query.type = { $in: matchingTypes };
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const notificationsWithLinks = notifications.map((n) => {
      let link = null;
      let resolvedCategory = null;
      try {
        if (n.type) {
          const config = getNotificationConfig(n.type as any, n.data || {});
          link = config.link;
          resolvedCategory = config.category;
        }
      } catch (e) {
        // ignore resolving errors for malformed or custom notifications
      }

      return {
        ...n.toObject(),
        link,
        category: resolvedCategory || n.type?.toLowerCase() || null,
      };
    });

    return reply.ok({
      notifications: notificationsWithLinks,
      total,
      page: pageNum,
      limit: limitNum,
    });
  });

  // Get unread notification counts globally and grouped by category
  fastify.get('/unread-count', async (request, reply) => {
    const user = request.user as any;
    const notifications = await Notification.find({ userId: user.id, status: 'unread' });

    const total = notifications.length;
    const byCategory: Record<string, number> = {
      tasks: 0,
      reimbursements: 0,
      leaves: 0,
      projects: 0,
      announcements: 0,
      schedule: 0,
    };

    notifications.forEach((n) => {
      if (n.type) {
        try {
          const entry = NOTIFICATION_REGISTRY[n.type as NotificationType];
          if (entry && entry.category) {
            byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
          }
        } catch (e) {
          // ignore resolving errors
        }
      }
    });

    return reply.ok({
      total,
      byCategory,
    });
  });

  // Mark all notifications (or all in a specific category) as read
  fastify.patch('/read-all', async (request, reply) => {
    const user = request.user as any;
    const { category } = request.query as { category?: string };

    const query: any = { userId: user.id, status: 'unread' };

    if (category && category !== 'all') {
      const matchingTypes = Object.keys(NOTIFICATION_REGISTRY).filter((key) => {
        return NOTIFICATION_REGISTRY[key as NotificationType].category === category;
      });
      query.type = { $in: matchingTypes };
    }

    const now = new Date();
    await Notification.updateMany(
      query,
      { status: 'read', readAt: now }
    );

    return reply.ok({ message: 'Notifications marked as read' });
  });

  // Mark notification as read
  fastify.patch('/:id/read', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as { id: string };

    const notification = await Notification.findOne({
      _id: id,
      userId: user.id
    });

    if (!notification) {
      return reply.notFound('Notification not found');
    }

    notification.status = 'read';
    notification.readAt = new Date();
    await notification.save();

    return reply.ok({ message: 'Notification marked as read', notification });
  });

  // Register or refresh push token
  fastify.post('/token', async (request, reply) => {
    const reqUser = request.user as any;
    const { token, platform, deviceId } = request.body as { token: string; platform: 'ios' | 'android'; deviceId: string };

    if (!token || !platform || !deviceId) {
      return reply.badRequest('400', 'token, platform, and deviceId are required');
    }

    if (!['ios', 'android'].includes(platform)) {
      return reply.badRequest('400', 'platform must be either ios or android');
    }

    // 1. Deduplicate token: remove it from any user currently holding it
    await User.updateMany(
      { 'pushTokens.token': token },
      { $pull: { pushTokens: { token } } }
    );

    // 2. Add or update token for the current user
    const user = await User.findById(reqUser.id);
    if (!user) {
      return reply.notFound('User not found');
    }

    const existingTokenIndex = user.pushTokens.findIndex(t => t.deviceId === deviceId);
    if (existingTokenIndex > -1) {
      user.pushTokens[existingTokenIndex].token = token;
      user.pushTokens[existingTokenIndex].platform = platform;
      user.pushTokens[existingTokenIndex].updatedAt = new Date();
    } else {
      user.pushTokens.push({
        token,
        platform,
        deviceId,
        updatedAt: new Date()
      });
    }

    await user.save();
    return reply.ok({ message: 'Token registered successfully' });
  });

  // Deregister push token on logout
  fastify.delete('/token', async (request, reply) => {
    const reqUser = request.user as any;
    const { token, deviceId } = request.body as { token?: string; deviceId?: string };

    if (!token && !deviceId) {
      return reply.badRequest('400', 'Either token or deviceId must be provided');
    }

    const pullFilter: any = {};
    if (token) pullFilter.token = token;
    if (deviceId) pullFilter.deviceId = deviceId;

    await User.updateOne(
      { _id: reqUser.id },
      { $pull: { pushTokens: pullFilter } }
    );

    return reply.ok({ message: 'Token unregistered successfully' });
  });
}
