import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { Project } from '../../../../../models/Project';
import { User } from '../../../../../models/User';
import { Todo } from '../../../../../models/Todo';
import { Notification } from '../../../../../models/Notification';
import { sendMail } from '../../../../../services/emailService';
import { getProjectAssignedTemplate, getProjectCommentTemplate } from '../../../../../utils/emailTemplates';
import { createDownloadUrl } from '../../../../../services/s3Service';
import { notifyUsers } from '../../../../../services/notificationService';

async function notifyNewMembers(
  newMemberIds: string[],
  adminName: string,
  projectId: string,
  projectName: string,
  projectDesc: string | undefined,
  dueDate: string | undefined
) {
  if (newMemberIds.length === 0) return;

  // In-app & Push notification (fire-and-forget, error-isolated)
  notifyUsers(newMemberIds, 'PROJECT_INVITED', {
    projectId,
    projectName,
    adminName,
  });

  const members = await User.find({ _id: { $in: newMemberIds } })
    .select('name email emailNotificationsEnabled')
    .lean();

  for (const member of members) {
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
    await notifyNewMembers(newMemberIds, adminName, project._id.toString(), name, description, dueDate);

    return reply.created({ message: 'Project created', project });
  });

  fastify.get('/', async (request, reply) => {
    const user = request.user as any;

    let query: any = { organizationId: user.organizationId };

    // If Employee, only show projects they are a member of
    if (user.role === 'EMPLOYEE') {
      query.members = user.id;
    }

    const projects = await Project.find(query).populate('members', 'name email role').sort({ createdAt: -1 });
    return reply.ok({ projects });
  });

  fastify.get('/:id', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;

    const project = await Project.findOne({ _id: id, organizationId: user.organizationId })
      .populate('members', 'name email role')
      .populate('createdBy', 'name email')
      .populate('comments.userId', 'name role profileImage');

    if (!project) {
      return reply.notFound('Project not found');
    }

    const projectObj = project.toObject() as any;
    if (projectObj.comments) {
      for (const comment of projectObj.comments) {
        if (comment.userId && comment.userId.profileImage) {
          try {
            comment.userId.profileImageUrl = await createDownloadUrl({
              s3: (fastify as any).s3,
              bucket: (fastify as any).s3Bucket,
              key: comment.userId.profileImage,
            });
          } catch (err) {
            console.error("Error signing comment profileImage:", err);
          }
        }
      }
    }

    // Fetch todos for this project
    const todos = await Todo.find({ projectId: id })
      .populate('userId', 'name email')
      .populate('assignedBy', 'name email')
      .sort({ date: -1 });

    return reply.ok({ project: projectObj, todos });
  });

  // Add comment to project discussion
  fastify.post('/:id/comments', async (request: any, reply) => {
    const { id } = request.params;
    const { message, parentId } = request.body as { message: string; parentId?: string };

    if (!message?.trim()) {
      return reply.badRequest("500", "Message is required");
    }

    const project = await Project.findOne({ _id: id, organizationId: request.user.organizationId });
    if (!project) {
      return reply.notFound("Project not found");
    }

    const currentUser = request.user;

    // Verify authorization: check if current user is a member of the project or is admin
    const isMember = project.members.some(m => m.toString() === (currentUser.id || currentUser._id).toString());
    const isAdmin = currentUser.role === "ADMIN";

    if (!isMember && !isAdmin) {
      return reply.forbidden("403", "You do not have permission to comment on this project");
    }

    // Create comment
    const newComment = {
      _id: new mongoose.Types.ObjectId(),
      userId: currentUser.id || currentUser._id,
      message: message.trim(),
      parentId: parentId ? new mongoose.Types.ObjectId(parentId) : undefined,
      createdAt: new Date(),
    } as any;

    project.comments.push(newComment);
    await project.save();

    // Notify appropriate parties
    const commenterName = currentUser.name;
    const projectName = project.name;

    // Case A: Reply to an existing comment
    if (parentId) {
      const parentComment = project.comments.find(c => c._id.toString() === parentId);
      if (parentComment && parentComment.userId.toString() !== (currentUser.id || currentUser._id).toString()) {
        const repliedUser = await User.findById(parentComment.userId).select("name email role emailNotificationsEnabled appNotificationsEnabled").lean();
        if (repliedUser) {
          if (repliedUser.appNotificationsEnabled !== false) {
            const notification = new Notification({
              userId: repliedUser._id,
              title: "New reply on project discussion",
              message: `${commenterName} replied: "${message}"`
            });
            await notification.save();
          }
          if (repliedUser.emailNotificationsEnabled !== false && repliedUser.email) {
            const html = getProjectCommentTemplate(repliedUser.name, commenterName, projectName, message, true);
            sendMail({
              to: repliedUser.email,
              subject: `Reply on project discussion: "${projectName}"`,
              html
            });
          }
        }
      }
    } else {
      // Case B: General comment
      const memberIdsToNotify = new Set<string>();
      if (project.createdBy.toString() !== (currentUser.id || currentUser._id).toString()) {
        memberIdsToNotify.add(project.createdBy.toString());
      }
      for (const memberId of project.members) {
        const mIdStr = memberId.toString();
        if (mIdStr !== (currentUser.id || currentUser._id).toString()) {
          memberIdsToNotify.add(mIdStr);
        }
      }

      if (memberIdsToNotify.size > 0) {
        const usersToNotify = await User.find({ _id: { $in: Array.from(memberIdsToNotify) } })
          .select("name email emailNotificationsEnabled appNotificationsEnabled")
          .lean();

        for (const recipient of usersToNotify) {
          if (recipient.appNotificationsEnabled !== false) {
            const notification = new Notification({
              userId: recipient._id,
              title: "New project discussion comment",
              message: `${commenterName} commented: "${message}"`
            });
            await notification.save();
          }
          if (recipient.emailNotificationsEnabled !== false && recipient.email) {
            const html = getProjectCommentTemplate(recipient.name, commenterName, projectName, message, false);
            sendMail({
              to: recipient.email,
              subject: `New comment on project: "${projectName}"`,
              html
            });
          }
        }
      }
    }

    // Populate current user info to return the full comment object for UI
    const populatedProject = await Project.findById(id).populate("comments.userId", "name role profileImage");
    const savedComment = populatedProject?.comments.find(c => c._id.toString() === newComment._id.toString());
    
    let savedCommentObj = savedComment ? (savedComment as any).toObject() : null;
    if (savedCommentObj && savedCommentObj.userId && savedCommentObj.userId.profileImage) {
      try {
        savedCommentObj.userId.profileImageUrl = await createDownloadUrl({
          s3: (fastify as any).s3,
          bucket: (fastify as any).s3Bucket,
          key: savedCommentObj.userId.profileImage,
        });
      } catch (err) {
        console.error("Error signing new comment profileImage:", err);
      }
    }

    return reply.ok({ comment: savedCommentObj });
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
        await notifyNewMembers(newMemberIds, adminName, project._id.toString(), project.name, project.description, project.dueDate);
      }
    }

    return reply.ok({ message: 'Project updated', project });
  });

  fastify.post('/:id/remove-member', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;
    const { memberId } = request.body as any;

    if (!memberId) {
      return reply.badRequest('400', 'Member ID is required');
    }

    const project = await Project.findOne({ _id: id, organizationId: user.organizationId });
    if (!project) {
      return reply.notFound('Project not found');
    }

    if (user.role !== 'ADMIN' && project.createdBy.toString() !== user.id) {
      return reply.forbidden('403', 'Only admin or project creator can manage members');
    }

    project.members = project.members.filter(m => m.toString() !== memberId);
    await project.save();

    return reply.ok({ message: 'Member removed from project', project });
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
    await Todo.deleteMany({ projectId: id });

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

