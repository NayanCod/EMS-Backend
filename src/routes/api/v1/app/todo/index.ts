import { FastifyInstance, FastifyRequest } from 'fastify';
import { Todo } from '../../../../../models/Todo';
import { User } from '../../../../../models/User';
import { sendMail } from '../../../../../services/emailService';
import { getTaskAssignedTemplate } from '../../../../../utils/emailTemplates';
import { notifyUser } from '../../../../../services/notificationService';

export default async function todoRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', fastify.authenticate);

  fastify.post('/', async (request, reply) => {
    const user = request.user as any;
    const { task, date, projectId, assignedTo } = request.body as any;

    if (!task || !date) {
      return reply.badRequest('MISSING_FIELDS', 'Task and date are required');
    }

    const assignees = Array.isArray(assignedTo)
      ? assignedTo
      : (assignedTo ? [assignedTo] : [user.id]);

    // Fetch assigner's name for notification/email
    const assigner = await User.findById(user.id).select('name').lean();
    const assignerName = assigner?.name || 'Admin';

    const createdTodos = [];
    for (const targetUserId of assignees) {
      let assignedBy = undefined;
      if (targetUserId !== user.id) {
        assignedBy = user.id;
      }

      const todo = new Todo({
        userId: targetUserId,
        task,
        date,
        projectId: projectId || undefined,
        assignedBy
      });

      await todo.save();
      createdTodos.push(todo);

      // Notification & Email Trigger if assigned by someone else
      if (assignedBy) {
        const targetUser = await User.findById(targetUserId).select('name email emailNotificationsEnabled appNotificationsEnabled').lean();

        // In-app & Push notification (fire-and-forget, error-isolated)
        notifyUser(targetUserId, 'TASK_ASSIGNED', {
          title: task,
          assignedBy: assignerName,
        });

        // Email notification (if enabled)
        if (targetUser?.emailNotificationsEnabled !== false && targetUser?.email) {
          const html = getTaskAssignedTemplate(targetUser.name, assignerName, task);
          sendMail({
            to: targetUser.email,
            subject: `New Task Assigned: "${task}"`,
            html,
          });
        }
      }
    }

    return reply.created({ message: 'Todo(s) created successfully', todos: createdTodos });
  });

  fastify.patch('/:id', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;
    const { status, projectId } = request.body as any;

    const todo = await Todo.findOne({ _id: id, userId: user.id });
    if (!todo) {
      return reply.notFound('Todo not found');
    }

    // Check restriction: Employee cannot move todo to project if assigned by admin
    if (projectId !== undefined && todo.assignedBy) {
      return reply.forbidden('403', 'Forbidden: Cannot move admin-assigned tasks to a project');
    }

    if (projectId !== undefined) {
      todo.projectId = projectId === null ? undefined : projectId;
    }

    if (status) {
      todo.status = status;
      if (status === 'completed') {
        todo.completedAt = new Date();
      } else {
        todo.completedAt = undefined;
      }
    }

    await todo.save();

    return reply.ok({ message: 'Todo updated', todo });
  });

  fastify.get('/', async (request: FastifyRequest<{ Querystring: { filter?: string; page?: string; limit?: string } }>, reply) => {
    const user = request.user as any;
    const { filter, page = '1', limit = '10' } = request.query;

    const baseQuery = { userId: user.id };
    const query: any = { ...baseQuery };

    const todayStr = new Date().toISOString().split('T')[0];

    if (filter === 'today') {
      query.date = todayStr;
    } else if (filter === 'pending') {
      query.status = { $ne: 'completed' };
    } else if (filter === 'completed') {
      query.status = 'completed';
    }

    const total = await Todo.countDocuments(query);
    const todos = await Todo.find(query)
      .populate('projectId', 'name')
      .populate('assignedBy', 'name')
      .sort({ date: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    // Get global counts
    const pendingCount = await Todo.countDocuments({ userId: user.id, status: { $ne: 'completed' } });
    const completedCount = await Todo.countDocuments({ userId: user.id, status: 'completed' });

    return reply.ok({
      todos,
      total,
      page: Number(page),
      limit: Number(limit),
      pendingCount,
      completedCount
    });
  });

  fastify.delete('/:id', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;

    const todo = await Todo.findById(id);
    if (!todo) {
      return reply.notFound('Todo not found');
    }

    if (todo.userId.toString() !== user.id && user.role !== 'ADMIN') {
      return reply.forbidden('403', 'Only the task owner or admin can delete this task');
    }

    await Todo.deleteOne({ _id: id });
    return reply.ok({ message: 'Todo deleted successfully' });
  });
}

