import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { User } from '../../../../../models/User';
import { Attendance } from '../../../../../models/Attendance';
import { Todo } from '../../../../../models/Todo';
import {
  createDownloadUrl,
  deleteS3Object,
  createProfileUploadUrl,
} from '../../../../../services/s3Service';

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

    // ── Sign profile image URL if exists ──
    let profileImageUrl = "";
    if (user.profileImage) {
      try {
        profileImageUrl = await createDownloadUrl({
          s3: fastify.s3,
          bucket: fastify.s3Bucket,
          key: user.profileImage,
        });
      } catch (err) {
        console.error("Error signing profile image URL:", err);
      }
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
        profileImageUrl,
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
      profileImage,
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

    // Handle profile image update & deletion of previous S3 image
    if (profileImage !== undefined) {
      if (user.profileImage && user.profileImage !== profileImage) {
        try {
          await deleteS3Object({
            s3: fastify.s3,
            bucket: fastify.s3Bucket,
            key: user.profileImage,
          });
        } catch (s3Err) {
          console.error("Failed to delete previous avatar from S3:", s3Err);
        }
      }
      user.profileImage = profileImage || undefined;
    }

    await user.save();

    let profileImageUrl = "";
    if (user.profileImage) {
      try {
        profileImageUrl = await createDownloadUrl({
          s3: fastify.s3,
          bucket: fastify.s3Bucket,
          key: user.profileImage,
        });
      } catch (err) {
        console.error("Error signing updated profile image URL:", err);
      }
    }

    return reply.ok({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        designation: user.designation,
        emailNotificationsEnabled: user.emailNotificationsEnabled,
        appNotificationsEnabled: user.appNotificationsEnabled,
        profileImage: user.profileImage,
        profileImageUrl,
      }
    });
  });

  fastify.post('/profile-image/upload-url', async (request, reply) => {
    const reqUser = request.user as any;
    const { fileName, contentType } = request.body as any;

    if (!fileName || !contentType) {
      return reply.badRequest('400', 'fileName and contentType are required');
    }

    try {
      const result = await createProfileUploadUrl({
        s3: fastify.s3,
        bucket: fastify.s3Bucket,
        userId: reqUser.id,
        fileName,
        contentType,
      });
      return reply.ok(result);
    } catch (err: any) {
      return reply.badRequest('500', err.message || 'Failed to generate upload URL');
    }
  });

  fastify.post('/change-password', async (request, reply) => {
    const reqUser = request.user as any;
    const { currentPassword, newPassword } = request.body as any;

    if (!currentPassword || !newPassword) {
      return reply.badRequest('400', 'Current password and new password are required');
    }

    const user = await User.findById(reqUser.id);
    if (!user) {
      return reply.notFound('User not found');
    }

    const isValid = await bcrypt.compare(currentPassword, user.password!);
    if (!isValid) {
      return reply.badRequest('400', 'Incorrect current password');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return reply.ok({ message: 'Password updated successfully' });
  });
}
