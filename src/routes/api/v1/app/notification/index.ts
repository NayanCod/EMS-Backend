import { FastifyInstance } from 'fastify';
import { Notification } from '../../../../../models/Notification';

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
}
