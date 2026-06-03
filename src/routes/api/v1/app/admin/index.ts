import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { User } from '../../../../../models/User';
import { Attendance } from '../../../../../models/Attendance';
import { Todo } from '../../../../../models/Todo';
import { Organization } from '../../../../../models/Organization';
import { SampleCollection } from '../../../../../models/SampleCollection';


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
    return reply.created({ message: 'Employee created', user: { id: user._id, name, email, phoneNumber, designation, employeeId, department, organizationId: user.organizationId } });
  });

  fastify.put('/employee/:id', async (request, reply) => {
    const admin = request.user as any;
    const { id } = request.params as { id: string };
    const { name, email, phoneNumber, password, designation, employeeId, department, status } = request.body as any;

    const user = await User.findOne({ _id: id, organizationId: admin.organizationId });
    if (!user) return reply.notFound('Employee not found');

    if (name) user.name = name;
    if (email) user.email = email;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (password) user.password = await bcrypt.hash(password, 10);
    if (designation !== undefined) user.designation = designation;
    if (employeeId !== undefined) user.employeeId = employeeId;
    if (department !== undefined) user.department = department;
    if (status !== undefined) user.status = status;

    await user.save();
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

    const employeesWithStatus = employees.map(emp => {
      const att = attendances.find(a => a.userId.toString() === emp._id.toString());
      return {
        ...emp,
        attendanceStatus: att ? 'Present' : 'Absent',
        clockInTime: att ? att.checkInTime : null
      };
    });

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
    const user = await User.findOne({ _id: id, organizationId: admin.organizationId }).select('-password');
    if (!user) return reply.notFound('Employee not found in your organization');

    const attendance = await Attendance.find({ userId: id }).sort({ date: -1 }).limit(5);
    const tasks = await Todo.find({ userId: id }).sort({ date: -1 }).limit(5);

    return reply.ok({ user, attendance, tasks });
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
    const { page = 1, limit = 10 } = request.query as any;

    const user = await User.findOne({ _id: id, organizationId: admin.organizationId }).select('_id');
    if (!user) return reply.notFound('Employee not found');

    const total = await Todo.countDocuments({ userId: id });
    const todos = await Todo.find({ userId: id })
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

    return reply.ok({
      collections: collections.map((c: any) => ({
        id: c._id,
        purpose: c.purpose,
        sampleType: c.sampleType,
        clientEmail: c.clientEmail,
        status: c.status,
        startLocation: c.startLocation,
        endLocation: c.endLocation,
        startedAt: c.startedAt,
        completedAt: c.completedAt
      })),
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
    const { name, addressName, location, radius, workStartTime, workEndTime } = request.body as any;

    const updateData: any = { name, addressName, location, radius };
    if (workStartTime !== undefined) updateData.workStartTime = workStartTime;
    if (workEndTime !== undefined) updateData.workEndTime = workEndTime;

    const organization = await Organization.findByIdAndUpdate(
      admin.organizationId,
      updateData,
      { new: true }
    );

    if (!organization) return reply.notFound('Organization not found');
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
}
