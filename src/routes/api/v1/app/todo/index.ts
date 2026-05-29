import { FastifyInstance, FastifyRequest } from 'fastify';
import { Todo } from '../../../../../models/Todo';
import { Notification } from '../../../../../models/Notification';

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

      // Notification Trigger if assigned by someone else
      if (assignedBy) {
        const notification = new Notification({
          userId: targetUserId,
          title: 'New Task Assigned',
          message: `You have been assigned a new task: "${task}"`
        });
        await notification.save();
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

  fastify.get('/', async (request: FastifyRequest<{ Querystring: { filter?: string } }>, reply) => {
    const user = request.user as any;
    const { filter } = request.query;

    const query: any = { userId: user.id };

    if (filter === 'daily') {
      query.date = new Date().toISOString().split('T')[0];
    } else if (filter === 'weekly' || filter === 'monthly') {
      // Typically implemented with $gte and $lte for dates, 
      // simplified to returning all for now if daily isn't specified
    }
    
    const todos = await Todo.find(query)
      .populate('projectId', 'name')
      .populate('assignedBy', 'name')
      .sort({ date: -1 });
    return reply.ok({ todos });
  });
}
