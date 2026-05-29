import { FastifyInstance, FastifyRequest } from 'fastify';
import { Todo } from '../../../../../models/Todo';

export default async function todoRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', fastify.authenticate);

  fastify.post('/', async (request, reply) => {
    const user = request.user as any;
    const { task, date, projectId, assignedTo } = request.body as any;

    if (!task || !date) {
      return reply.badRequest('MISSING_FIELDS', 'Task and date are required');
    }

    let targetUserId = user.id;
    let assignedBy = undefined;

    // If an Admin or someone else assigns the task to a specific user
    if (assignedTo && assignedTo !== user.id) {
      targetUserId = assignedTo;
      assignedBy = user.id;
      // TODO: FUTURE INTEGRATION - send push notification to targetUserId here
    }

    const todo = new Todo({
      userId: targetUserId,
      task,
      date,
      projectId,
      assignedBy
    });

    await todo.save();
    return reply.created({ message: 'Todo created', todo });
  });

  fastify.patch('/:id', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;
    const { status } = request.body as any;

    const todo = await Todo.findOne({ _id: id, userId: user.id });
    if (!todo) {
      return reply.notFound('Todo not found');
    }

    if (status) todo.status = status;
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
