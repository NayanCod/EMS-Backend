import { FastifyInstance } from 'fastify';
import { Project } from '../../../../../models/Project';
import { User } from '../../../../../models/User';
import { Todo } from '../../../../../models/Todo';
import { Notification } from '../../../../../models/Notification';
import { sendMail } from '../../../../../services/emailService';
import { getProjectAssignedTemplate } from '../../../../../utils/emailTemplates';

async function notifyNewMembers(
  newMemberIds: string[],
  adminName: string,
  projectName: string,
  projectDesc: string | undefined,
  dueDate: string | undefined
) {
  if (newMemberIds.length === 0) return;

  const members = await User.find({ _id: { $in: newMemberIds } })
    .select('name email emailNotificationsEnabled appNotificationsEnabled')
    .lean();

  for (const member of members) {
    // In-app notification
    if (member.appNotificationsEnabled !== false) {
      const notification = new Notification({
        userId: member._id,
        title: 'Added to Project',
        message: `You have been added to project: "${projectName}" by ${adminName}`,
      });
      await notification.save();
    }

    // Email notification
    if (member.emailNotificationsEnabled !== false && member.email) {
      const html = getProjectAssignedTemplate(member.name, adminName, projectName, projectDesc, dueDate);
      sendMail({
        to: member.email,
        subject: `You've been added to project: "${projectName}"`,
        html,
      });
    }
  }
}

export default async function projectRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', fastify.authenticate);

  fastify.get('/active-members', async (request, reply) => {
    const user = request.user as any;
    const members = await User.find({
      organizationId: user.organizationId,
      status: 'ACTIVE'
    }).select('name email role').lean();
    return reply.ok({ members });
  });

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

    // Notify newly added members (exclude the creator)
    const creatorUser = await User.findById(user.id).select('name').lean();
    const adminName = creatorUser?.name || 'Admin';
    const newMemberIds = (members || []).filter((m: string) => m !== user.id);
    await notifyNewMembers(newMemberIds, adminName, name, description, dueDate);

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

    // Determine newly added members before updating
    const previousMemberIds = project.members.map(m => m.toString());

    if (name) project.name = name;
    if (description !== undefined) project.description = description;
    if (dueDate !== undefined) project.dueDate = dueDate;
    if (members) project.members = members;

    await project.save();

    // Notify only the newly added members
    if (members) {
      const newMemberIds = members.filter((m: string) => !previousMemberIds.includes(m) && m !== user.id);
      if (newMemberIds.length > 0) {
        const creatorUser = await User.findById(user.id).select('name').lean();
        const adminName = creatorUser?.name || 'Admin';
        await notifyNewMembers(newMemberIds, adminName, project.name, project.description, project.dueDate);
      }
    }

    return reply.ok({ message: 'Project updated', project });
  });

  fastify.delete('/:id', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;

    const project = await Project.findOne({ _id: id, organizationId: user.organizationId });
    if (!project) {
      return reply.notFound('Project not found');
    }

    if (user.role !== 'ADMIN' && project.createdBy.toString() !== user.id) {
      return reply.forbidden('403', 'Only admin or project creator can delete the project');
    }

    await Project.deleteOne({ _id: id });
    await Todo.updateMany({ projectId: id }, { $unset: { projectId: 1 } });

    return reply.ok({ message: 'Project deleted successfully' });
  });

  fastify.get('/:id/todos', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;
    const { page = 1, limit = 10 } = request.query as any;

    const project = await Project.findOne({ _id: id, organizationId: user.organizationId });
    if (!project) {
      return reply.notFound('Project not found');
    }

    const total = await Todo.countDocuments({ projectId: id });
    const todos = await Todo.find({ projectId: id })
      .populate('userId', 'name email')
      .populate('assignedBy', 'name email')
      .sort({ date: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    return reply.ok({ todos, total, page: Number(page), limit: Number(limit) });
  });
}

