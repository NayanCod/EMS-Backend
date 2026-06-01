import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { User } from '../../../../../models/User';
import { Attendance } from '../../../../../models/Attendance';
import { Todo } from '../../../../../models/Todo';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const reqUser = request.user as any;
    const user = await User.findById(reqUser.id)
      .select('-password')
      .populate('organizationId', 'name addressName location')
      .lean();
    if (!user) {
      return reply.notFound('User not found');
    }

    // ── Dynamic stats ──
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    // Days elapsed in the current month (1-based today)
    const dayOfMonth = now.getDate();

    // Attendance rate for current month
    const monthStartStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const todayStr = now.toISOString().split('T')[0];

    const presentDays = await Attendance.countDocuments({
      userId: reqUser.id,
      date: { $gte: monthStartStr, $lte: todayStr },
    });
    const attendanceRate = dayOfMonth > 0 ? Math.round((presentDays / dayOfMonth) * 100) : 0;

    // Task counts
    const doneTasks = await Todo.countDocuments({ userId: reqUser.id, status: 'completed' });
    const pendingTasks = await Todo.countDocuments({ userId: reqUser.id, status: 'pending' });

    return reply.ok({
      user: {
        ...user,
        stats: { attendanceRate, doneTasks, pendingTasks },
      },
    });
  });

  fastify.put('/', async (request, reply) => {
    const reqUser = request.user as any;
    const {
      name,
      email,
      phoneNumber,
      password,
      designation,
      emailNotificationsEnabled,
      appNotificationsEnabled,
    } = request.body as any;

    const user = await User.findById(reqUser.id);
    if (!user) {
      return reply.notFound('User not found');
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }
    if (designation) user.designation = designation;
    if (emailNotificationsEnabled !== undefined) user.emailNotificationsEnabled = emailNotificationsEnabled;
    if (appNotificationsEnabled !== undefined) user.appNotificationsEnabled = appNotificationsEnabled;

    await user.save();
    return reply.ok({
      message: 'Profile updated successfully', user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        designation: user.designation,
        emailNotificationsEnabled: user.emailNotificationsEnabled,
        appNotificationsEnabled: user.appNotificationsEnabled,
      }
    });
  });
}
