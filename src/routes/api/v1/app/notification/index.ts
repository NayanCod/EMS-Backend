import { FastifyInstance } from 'fastify';
import { Notification } from '../../../../../models/Notification';

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Protect all notification routes
  fastify.addHook('preValidation', fastify.authenticate);

  // Fetch unread notifications
  fastify.get('/', async (request, reply) => {
    const user = request.user as any;
    const notifications = await Notification.find({
      userId: user.id,
      status: 'unread'
    }).sort({ createdAt: -1 });

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
