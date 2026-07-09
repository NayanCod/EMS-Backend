import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { User } from '../../../../../models/User';
import { Attendance } from '../../../../../models/Attendance';
import { Todo } from '../../../../../models/Todo';
import { Organization } from '../../../../../models/Organization';
import { SampleCollection } from '../../../../../models/SampleCollection';
import Reimbursement from '../../../../../models/Reimbursement';
import { createDownloadUrl } from '../../../../../services/s3Service';
import { Notification } from '../../../../../models/Notification';
import { sendMail } from '../../../../../services/emailService';
import { getClaimReviewedEmployeeTemplate } from '../../../../../utils/emailTemplates';
import { notifyUser } from '../../../../../services/notificationService';
import { logAction } from '../../../../../services/auditService';


export default async function adminRoutes(fastify: FastifyInstance) {
  // Protect all admin routes with requireAdmin hook
  fastify.addHook('preValidation', fastify.requireAdmin);

  fastify.post('/employee', async (request, reply) => {
    const admin = request.user as any;
    const { name, email, password, phoneNumber, designation, employeeId, department } = request.body as any;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      phoneNumber,
      password: hashedPassword,
      role: 'EMPLOYEE',
      designation,
      employeeId,
      department,
      organizationId: admin.organizationId
    });
    await user.save();

    // Log employee creation to audit log
    logAction({
      organizationId: admin.organizationId,
      actorId: admin._id,
      actorRole: 'ADMIN',
      action: 'EMPLOYEE_CREATED',
      targetType: 'User',
      targetId: user._id,
      metadata: {
        employeeName: user.name,
        employeeEmail: user.email,
        designation: user.designation,
        employeeId: user.employeeId,
      }
    });

    return reply.created({ message: 'Employee created', user: { id: user._id, name, email, phoneNumber, designation, employeeId, department, organizationId: user.organizationId } });
  });

  fastify.put('/employee/:id', async (request, reply) => {
    const admin = request.user as any;
    const { id } = request.params as { id: string };
    const { name, email, phoneNumber, password, designation, employeeId, department, status } = request.body as any;

    const user = await User.findOne({ _id: id, organizationId: admin.organizationId });
    if (!user) return reply.notFound('Employee not found');

    const oldStatus = user.status;
    if (name) user.name = name;
    if (email) user.email = email;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (password) user.password = await bcrypt.hash(password, 10);
    if (designation !== undefined) user.designation = designation;
    if (employeeId !== undefined) user.employeeId = employeeId;
    if (department !== undefined) user.department = department;
    if (status !== undefined) user.status = status;

    await user.save();

    // Log to audit log
    if (status === 'INACTIVE' && oldStatus !== 'INACTIVE') {
      logAction({
        organizationId: admin.organizationId,
        actorId: admin._id,
        actorRole: 'ADMIN',
        action: 'EMPLOYEE_SUSPENDED',
        targetType: 'User',
        targetId: user._id,
        metadata: {
          employeeName: user.name,
          employeeEmail: user.email,
        }
      });
    } else {
      logAction({
        organizationId: admin.organizationId,
        actorId: admin._id,
        actorRole: 'ADMIN',
        action: 'EMPLOYEE_EDITED',
        targetType: 'User',
        targetId: user._id,
        metadata: {
          employeeName: user.name,
          employeeEmail: user.email,
          updatedFields: Object.keys(request.body as any).filter(k => k !== 'password')
        }
      });
    }

    return reply.ok({ message: 'Employee updated successfully' });
  });

  fastify.delete('/employee/:id', async (request, reply) => {
    const admin = request.user as any;
    const { id } = request.params as { id: string };

    const user = await User.findOneAndUpdate(
      { _id: id, organizationId: admin.organizationId },
      { status: 'REMOVED' },
      { new: true }
    );
    if (!user) return reply.notFound('Employee not found');

    // Log employee removal to audit log
    logAction({
      organizationId: admin.organizationId,
      actorId: admin._id,
      actorRole: 'ADMIN',
      action: 'EMPLOYEE_REMOVED',
      targetType: 'User',
      targetId: user._id,
      metadata: {
        employeeName: user.name,
        employeeEmail: user.email,
      }
    });

    return reply.ok({ message: 'Employee removed successfully' });
  });

  fastify.get('/employees', async (request, reply) => {
    const admin = request.user as any;
    const { status } = request.query as { status?: string };
    const queryStatus = status || 'ACTIVE';

    const employees = await User.find({
      role: 'EMPLOYEE',
      organizationId: admin.organizationId,
      status: queryStatus as any
    }).select('-password').lean();

    const today = new Date().toISOString().split('T')[0];
    const employeeIds = employees.map(e => e._id);
    const attendances = await Attendance.find({ date: today, userId: { $in: employeeIds } }).lean();

    const employeesWithStatus = await Promise.all(employees.map(async emp => {
      const att = attendances.find(a => a.userId.toString() === emp._id.toString());
      let profileImageUrl = "";
      if (emp.profileImage) {
        try {
          profileImageUrl = await createDownloadUrl({
            s3: fastify.s3,
            bucket: fastify.s3Bucket,
            key: emp.profileImage,
          });
        } catch (err) {
          console.error("Error signing profile image URL for employee list:", err);
        }
      }
      return {
        ...emp,
        profileImageUrl,
        attendanceStatus: att ? 'Present' : 'Absent',
        clockInTime: att ? att.checkInTime : null
      };
    }));

    return reply.ok({ employees: employeesWithStatus });
  });

  fastify.get('/stats', async (request, reply) => {
    const admin = request.user as any;
    const today = new Date().toISOString().split('T')[0];

    // Find all active employees in this org
    const orgEmployees = await User.find({
      role: 'EMPLOYEE',
      organizationId: admin.organizationId,
      status: 'ACTIVE'
    }).select('_id');
    const orgEmployeeIds = orgEmployees.map(e => e._id);
    const totalEmployees = orgEmployeeIds.length;

    // Find attendance for today only for these employees
    const present = await Attendance.countDocuments({ date: today, userId: { $in: orgEmployeeIds } });

    return reply.ok({
      stats: {
        totalEmployees,
        present,
        absent: totalEmployees - present
      }
    });
  });

  fastify.get('/employee/:id', async (request, reply) => {
    const admin = request.user as any;
    const { id } = request.params as any;
    const user = await User.findOne({ _id: id, organizationId: admin.organizationId }).populate('organizationId', 'name').select('-password').lean() as any;
    if (!user) return reply.notFound('Employee not found in your organization');

    let profileImageUrl = "";
    if (user.profileImage) {
      try {
        profileImageUrl = await createDownloadUrl({
          s3: fastify.s3,
          bucket: fastify.s3Bucket,
          key: user.profileImage,
        });
      } catch (err) {
        console.error("Error signing profile image URL for employee details:", err);
      }
    }
    user.profileImageUrl = profileImageUrl;

    const attendance = await Attendance.find({ userId: id }).sort({ date: -1 }).limit(5);
    const tasks = await Todo.find({ userId: id }).sort({ date: -1 }).limit(5);
    const reimbursements = await Reimbursement.find({ userId: id }).sort({ createdAt: -1 }).limit(5).lean();

    return reply.ok({ user, attendance, tasks, reimbursements });
  });

  fastify.get('/employee/:id/contribution', async (request, reply) => {
    const admin = request.user as any;
    const { id } = request.params as any;
    const { month, year } = request.query as any;

    // Check organization membership first
    const user = await User.findOne({ _id: id, organizationId: admin.organizationId }).select('_id');
    if (!user) {
      return reply.notFound('Employee not found in your organization');
    }

    const now = new Date();
    const targetYear = year ? Number(year) : now.getFullYear();
    const targetMonth = month ? Number(month) : (now.getMonth() + 1);

    const monthStr = String(targetMonth).padStart(2, '0');
    const monthPrefix = `${targetYear}-${monthStr}-`;

    const records = await Attendance.find({
      userId: id,
      date: { $regex: new RegExp('^' + monthPrefix) }
    })
      .select('date checkInTime checkOutTime')
      .lean();

    return reply.ok({ records });
  });

  fastify.get('/employee/:id/attendance', async (request, reply) => {
    const admin = request.user as any;
    const { id } = request.params as any;
    const { page = 1, limit = 10 } = request.query as any;

    const user = await User.findOne({ _id: id, organizationId: admin.organizationId }).select('_id');
    if (!user) return reply.notFound('Employee not found');

    const total = await Attendance.countDocuments({ userId: id });
    const records = await Attendance.find({ userId: id })
      .sort({ date: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    return reply.ok({ records, total, page: Number(page), limit: Number(limit) });
  });

  fastify.get('/employee/:id/todos', async (request, reply) => {
    const admin = request.user as any;
    const { id } = request.params as any;
    const { page = 1, limit = 10, search } = request.query as any;

    const user = await User.findOne({ _id: id, organizationId: admin.organizationId }).select('_id');
    if (!user) return reply.notFound('Employee not found');

    const query: any = { userId: id };
    if (search) {
      query.task = { $regex: search, $options: 'i' };
    }

    const total = await Todo.countDocuments(query);
    const todos = await Todo.find(query)
      .sort({ date: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    return reply.ok({ todos, total, page: Number(page), limit: Number(limit) });
  });

  fastify.get('/employee/:id/sample-collections', async (request, reply) => {
    const admin = request.user as any;
    const { id } = request.params as any;
    const { page = 1, limit = 10 } = request.query as any;

    const user = await User.findOne({ _id: id, organizationId: admin.organizationId }).select('_id');
    if (!user) return reply.notFound('Employee not found');

    const total = await SampleCollection.countDocuments({ userId: id });
    const collections = await SampleCollection.find({ userId: id })
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    const enriched = await Promise.all(
      collections.map(async (c: any) => {
        let sampleImageUrl = '';
        if (c.sampleImage) {
          try {
            sampleImageUrl = await createDownloadUrl({
              s3: fastify.s3,
              bucket: fastify.s3Bucket,
              key: c.sampleImage,
            });
          } catch (err) {
            console.error('Error signing sampleImage for admin:', err);
          }
        }
        return {
          id: c._id,
          purpose: c.purpose,
          sampleType: c.sampleType,
          clientEmail: c.clientEmail,
          status: c.status,
          startLocation: c.startLocation,
          endLocation: c.endLocation,
          sampleImage: c.sampleImage,
          sampleImageUrl,
          startedAt: c.startedAt,
          completedAt: c.completedAt
        };
      })
    );

    return reply.ok({
      collections: enriched,
      total,
      page: Number(page),
      limit: Number(limit)
    });
  });



  fastify.get('/organization', async (request, reply) => {
    const admin = request.user as any;
    const organization = await Organization.findById(admin.organizationId);
    if (!organization) return reply.notFound('Organization not found');
    return reply.ok({ organization });
  });

  fastify.put('/organization', async (request, reply) => {
    const admin = request.user as any;
    const { name, addressName, location, radius, workStartTime, workEndTime, leaveTypes } = request.body as any;

    const updateData: any = { name, addressName, location, radius };
    if (workStartTime !== undefined) updateData.workStartTime = workStartTime;
    if (workEndTime !== undefined) updateData.workEndTime = workEndTime;
    if (leaveTypes !== undefined) updateData.leaveTypes = leaveTypes;

    const organization = await Organization.findByIdAndUpdate(
      admin.organizationId,
      updateData,
      { new: true }
    );

    if (!organization) return reply.notFound('Organization not found');

    // Log organization settings update to audit log
    logAction({
      organizationId: admin.organizationId,
      actorId: admin._id,
      actorRole: 'ADMIN',
      action: 'ORGANIZATION_SETTINGS_UPDATED',
      targetType: 'Organization',
      targetId: organization._id,
      metadata: {
        organizationName: organization.name,
        updatedFields: Object.keys(updateData)
      }
    });

    return reply.ok({ message: 'Organization updated successfully', organization });
  });

  fastify.get('/reports', async (request, reply) => {
    const admin = request.user as any;

    const employees = await User.find({
      organizationId: admin.organizationId,
      role: 'EMPLOYEE',
      status: 'ACTIVE'
    }).select('_id').lean();

    const employeeIds = employees.map(e => e._id);

    // Aggregate Daily Attendance and Tasks for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const attendances = await Attendance.find({
      userId: { $in: employeeIds },
      date: { $gte: thirtyDaysAgoStr }
    }).lean();

    const todos = await Todo.find({
      userId: { $in: employeeIds },
      date: { $gte: thirtyDaysAgoStr }
    }).lean();

    const dailyMap: Record<string, { present: number; absent: number; completedTasks: number; pendingTasks: number }> = {};
    
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dailyMap[dateStr] = { present: 0, absent: employeeIds.length, completedTasks: 0, pendingTasks: 0 };
    }

    attendances.forEach(att => {
      if (dailyMap[att.date]) {
        dailyMap[att.date].present += 1;
        if (dailyMap[att.date].absent > 0) {
          dailyMap[att.date].absent -= 1;
        }
      }
    });

    todos.forEach(todo => {
      const dateStr = todo.date;
      if (dateStr && dailyMap[dateStr]) {
        if (todo.status === 'completed') {
          dailyMap[dateStr].completedTasks += 1;
        } else {
          dailyMap[dateStr].pendingTasks += 1;
        }
      }
    });

    const dailyReports = Object.entries(dailyMap)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Aggregate Monthly data for the last 6 months
    const monthlyReports: any[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
      const monthLabel = d.toLocaleString('default', { month: 'long', year: 'numeric' });

      const mAttendances = await Attendance.find({
        userId: { $in: employeeIds },
        date: { $regex: new RegExp('^' + monthPrefix) }
      }).lean();

      const mTodos = await Todo.find({
        userId: { $in: employeeIds },
        date: { $regex: new RegExp('^' + monthPrefix) }
      }).lean();

      const completedCount = mTodos.filter(t => t.status === 'completed').length;
      const pendingCount = mTodos.filter(t => t.status === 'pending').length;

      let daysInMonth = 30;
      if (i === 0) {
        daysInMonth = new Date().getDate();
      } else {
        daysInMonth = new Date(year, month, 0).getDate();
      }
      
      const totalUserDays = employeeIds.length * daysInMonth;
      const attendanceRate = totalUserDays > 0 ? Math.round((mAttendances.length / totalUserDays) * 100) : 0;

      monthlyReports.push({
        month: monthLabel,
        attendanceRate,
        completedTasks: completedCount,
        pendingTasks: pendingCount
      });
    }

    return reply.ok({ reports: { dailyReports, monthlyReports } });
  });

  // List all organization reimbursements
  fastify.get('/reimbursement', async (request, reply) => {
    const admin = request.user as any;
    const { status, employeeId } = request.query as any;

    const query: any = { organizationId: admin.organizationId };
    if (status && status !== 'all') {
      query.status = status === 'pending' ? 'submitted' : status;
    }
    if (employeeId) {
      query.userId = employeeId;
    }

    const reimbursements = await Reimbursement.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const enrichedReimbursements = await Promise.all(
      reimbursements.map(async (r: any) => {
        const user = await User.findById(r.userId).select('name designation employeeId profileImage').lean() as any;
        let profileImageUrl = "";
        if (user?.profileImage) {
          try {
            profileImageUrl = await createDownloadUrl({
              s3: fastify.s3,
              bucket: fastify.s3Bucket,
              key: user.profileImage,
            });
          } catch (err) {
            console.error("Error signing employee profile image in reimbursement list:", err);
          }
        }
        return {
          ...r,
          employee: user ? { ...user, profileImageUrl } : null,
        };
      })
    );

    return reply.ok({ reimbursements: enrichedReimbursements });
  });

  // Get specific reimbursement details for admin review
  fastify.get('/reimbursement/:id', async (request, reply) => {
    const admin = request.user as any;
    const { id } = request.params as any;

    const reimbursement = await Reimbursement.findOne({
      _id: id,
      organizationId: admin.organizationId,
    }).populate('comments.userId', 'name role profileImage');

    if (!reimbursement) {
      return reply.notFound('Reimbursement not found');
    }

    const employee = await User.findById(reimbursement.userId).select('name designation employeeId email phoneNumber profileImage').lean() as any;
    let profileImageUrl = "";
    if (employee?.profileImage) {
      try {
        profileImageUrl = await createDownloadUrl({
          s3: (fastify as any).s3,
          bucket: (fastify as any).s3Bucket,
          key: employee.profileImage,
        });
      } catch (err) {
        console.error("Error signing employee profile image in reimbursement details:", err);
      }
    }
    if (employee) {
      employee.profileImageUrl = profileImageUrl;
    }

    const items = await Promise.all(
      reimbursement.items.map(async (item: any) => {
        let imageUrl = '';
        if (item.imageKey) {
          try {
            imageUrl = await createDownloadUrl({
              s3: (fastify as any).s3,
              bucket: (fastify as any).s3Bucket,
              key: item.imageKey,
            });
          } catch (err) {
            console.error('Error signing imageKey:', item.imageKey, err);
          }
        }
        return {
          _id: item._id,
          imageKey: item.imageKey,
          amount: item.amount,
          category: item.category,
          label: item.label,
          imageUrl,
        };
      })
    );

    let billsPdfUrl = '';
    if (reimbursement.billsPdfKey) {
      try {
        billsPdfUrl = await createDownloadUrl({
          s3: (fastify as any).s3,
          bucket: (fastify as any).s3Bucket,
          key: reimbursement.billsPdfKey,
        });
      } catch (err) {
        console.error('Error signing billsPdfKey:', err);
      }
    }

    let invoicePdfUrl = '';
    if (reimbursement.invoicePdfKey) {
      try {
        invoicePdfUrl = await createDownloadUrl({
          s3: (fastify as any).s3,
          bucket: (fastify as any).s3Bucket,
          key: reimbursement.invoicePdfKey,
        });
      } catch (err) {
        console.error('Error signing invoicePdfKey:', err);
      }
    }

    const reimbursementObj = reimbursement.toObject() as any;
    if (reimbursementObj.comments) {
      for (const comment of reimbursementObj.comments) {
        if (comment.userId && comment.userId.profileImage) {
          try {
            comment.userId.profileImageUrl = await createDownloadUrl({
              s3: (fastify as any).s3,
              bucket: (fastify as any).s3Bucket,
              key: comment.userId.profileImage,
            });
          } catch (err) {
            console.error("Error signing admin comment profileImage:", err);
          }
        }
      }
    }

    return reply.ok({
      reimbursement: {
        ...reimbursementObj,
        items,
        billsPdfUrl,
        invoicePdfUrl,
        employee,
      },
    });
  });

  // Review a reimbursement (approve / reject)
  fastify.post('/reimbursement/:id/review', async (request, reply) => {
    const admin = request.user as any;
    const { id } = request.params as any;
    const { action, adminNote } = request.body as any;

    if (!['approve', 'reject'].includes(action)) {
      return reply.badRequest('400', 'Action must be approve or reject');
    }

    const reimbursement = await Reimbursement.findOne({
      _id: id,
      organizationId: admin.organizationId,
    });

    if (!reimbursement) {
      return reply.notFound('Reimbursement not found');
    }

    if (reimbursement.status !== 'submitted') {
      return reply.badRequest('400', 'Only submitted reimbursements can be reviewed');
    }

    reimbursement.status = action === 'approve' ? 'approved' : 'rejected';
    reimbursement.adminNote = adminNote || '';
    reimbursement.reviewedBy = admin._id;
    reimbursement.reviewedAt = new Date();

    await reimbursement.save();

    // Fetch employee info for notification and audit logging
    const employee = await User.findById(reimbursement.userId).select('name email emailNotificationsEnabled').lean() as any;

    // Log the review action to the audit log
    logAction({
      organizationId: admin.organizationId,
      actorId: admin._id,
      actorRole: 'ADMIN',
      action: action === 'approve' ? 'REIMBURSEMENT_APPROVED' : 'REIMBURSEMENT_REJECTED',
      targetType: 'Reimbursement',
      targetId: reimbursement._id,
      metadata: {
        employeeName: employee?.name || 'Unknown Employee',
        reimbursementTitle: reimbursement.title,
        amount: reimbursement.totalAmount,
        adminNote: reimbursement.adminNote,
        referenceNumber: reimbursement.referenceNumber
      }
    });

    // Notify the employee (fire-and-forget, error-isolated)
    notifyUser(reimbursement.userId, 'REIMBURSEMENT_REVIEWED', {
      title: reimbursement.title,
      action,
      reimbursementId: reimbursement._id.toString(),
    });

    try {
      if (employee) {
        const actionLabel = action === 'approve' ? 'approved' : 'rejected';
        // Email notification
        if (employee.emailNotificationsEnabled !== false && employee.email) {
          const html = getClaimReviewedEmployeeTemplate(
            employee.name,
            reimbursement.status,
            reimbursement.title,
            reimbursement.totalAmount,
            reimbursement.adminNote
          );
          sendMail({
            to: employee.email,
            subject: `Claim ${actionLabel === 'approved' ? 'Approved' : 'Rejected'}: ${reimbursement.referenceNumber}`,
            html,
          });
        }
      }
    } catch (err) {
      console.error("Failed to send claim review email to employee:", err);
    }

    return reply.ok({ reimbursement });
  });
}
