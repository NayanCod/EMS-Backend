import { FastifyInstance } from 'fastify';
import { Notification } from '../../../../../models/Notification';
import { User } from '../../../../../models/User';

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Protect all notification routes
  fastify.addHook('preValidation', fastify.authenticate);

  // Fetch notifications with optional status filtering
  fastify.get('/', async (request, reply) => {
    const user = request.user as any;
    const { status } = request.query as any;

    const query: any = { userId: user.id };
    if (status === 'unread' || status === 'read') {
      query.status = status;
    } else if (status !== 'all') {
      // Default to unread for backwards compatibility if no status param is provided
      query.status = 'unread';
    }

    const notifications = await Notification.find(query).sort({ createdAt: -1 });

    return reply.ok({ notifications });
  });

  // Mark all notifications as read
  fastify.patch('/read-all', async (request, reply) => {
    const user = request.user as any;

    await Notification.updateMany(
      { userId: user.id, status: 'unread' },
      { status: 'read' }
    );

    return reply.ok({ message: 'All notifications marked as read' });
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
