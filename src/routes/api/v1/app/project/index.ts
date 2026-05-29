import { FastifyInstance } from 'fastify';
import { Project } from '../../../../../models/Project';
import { User } from '../../../../../models/User';
import { Todo } from '../../../../../models/Todo';

export default async function projectRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', fastify.authenticate);

  fastify.post('/', async (request, reply) => {
    const user = request.user as any;
    const { name, description, dueDate, members } = request.body as any;

    if (!name) {
      return reply.badRequest('400', 'Project name is required');
    }

    const project = new Project({
      name,
      description,
      dueDate,
      organizationId: user.organizationId,
      createdBy: user.id,
      members: members || [user.id] // Include creator by default if members not provided
    });

    await project.save();
    return reply.created({ message: 'Project created', project });
  });

  fastify.get('/', async (request, reply) => {
    const user = request.user as any;

    let query: any = { organizationId: user.organizationId };

    // If Employee, only show projects they are a member of
    if (user.role === 'EMPLOYEE') {
      query.members = user.id;
    }

    const projects = await Project.find(query).sort({ createdAt: -1 });
    return reply.ok({ projects });
  });

  fastify.get('/:id', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;

    const project = await Project.findOne({ _id: id, organizationId: user.organizationId })
      .populate('members', 'name email role')
      .populate('createdBy', 'name email');

    if (!project) {
      return reply.notFound('Project not found');
    }

    // Fetch todos for this project
    const todos = await Todo.find({ projectId: id })
      .populate('userId', 'name email')
      .populate('assignedBy', 'name email')
      .sort({ date: -1 });

    return reply.ok({ project, todos });
  });

  fastify.put('/:id', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;
    const { name, description, dueDate, members } = request.body as any;

    const project = await Project.findOne({ _id: id, organizationId: user.organizationId });
    if (!project) {
      return reply.notFound('Project not found');
    }

    // Check if user is admin or creator
    if (user.role !== 'ADMIN' && project.createdBy.toString() !== user.id) {
      return reply.forbidden('403', 'Only admin or project creator can update the project');
    }

    if (name) project.name = name;
    if (description !== undefined) project.description = description;
    if (dueDate !== undefined) project.dueDate = dueDate;
    if (members) project.members = members;

    await project.save();
    return reply.ok({ message: 'Project updated', project });
  });
}
