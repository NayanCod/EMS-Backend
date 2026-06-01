import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { User } from '../../../../../models/User';
import { Attendance } from '../../../../../models/Attendance';
import { Todo } from '../../../../../models/Todo';
import { Organization } from '../../../../../models/Organization';

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
    const { name, email, phoneNumber, password, designation, employeeId, department } = request.body as any;

    const user = await User.findOne({ _id: id, organizationId: admin.organizationId });
    if (!user) return reply.notFound('Employee not found');

    if (name) user.name = name;
    if (email) user.email = email;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (password) user.password = await bcrypt.hash(password, 10);
    if (designation) user.designation = designation;
    if (employeeId !== undefined) user.employeeId = employeeId;
    if (department !== undefined) user.department = department;

    await user.save();
    return reply.ok({ message: 'Employee updated successfully' });
  });

  fastify.delete('/employee/:id', async (request, reply) => {
    const admin = request.user as any;
    const { id } = request.params as { id: string };

    const user = await User.findOneAndDelete({ _id: id, organizationId: admin.organizationId });
    if (!user) return reply.notFound('Employee not found');

    return reply.ok({ message: 'Employee removed successfully' });
  });

  fastify.get('/employees', async (request, reply) => {
    const admin = request.user as any;
    const employees = await User.find({ role: 'EMPLOYEE', organizationId: admin.organizationId }).select('-password').lean();

    const today = new Date().toISOString().split('T')[0];
    const employeeIds = employees.map(e => e._id);
    const attendances = await Attendance.find({ date: today, userId: { $in: employeeIds } }).lean();

    const employeesWithStatus = employees.map(emp => {
      const att = attendances.find(a => a.userId.toString() === emp._id.toString());
      return {
        ...emp,
        status: att ? 'Present' : 'Absent',
        clockInTime: att ? att.checkInTime : null
      };
    });

    return reply.ok({ employees: employeesWithStatus });
  });

  fastify.get('/stats', async (request, reply) => {
    const admin = request.user as any;
    const today = new Date().toISOString().split('T')[0];

    // Find all employees in this org
    const orgEmployees = await User.find({ role: 'EMPLOYEE', organizationId: admin.organizationId }).select('_id');
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

    const attendance = await Attendance.find({ userId: id }).sort({ date: -1 });
    const tasks = await Todo.find({ userId: id }).sort({ date: -1 });

    return reply.ok({ user, attendance, tasks });
  });

  fastify.get('/employee/:id/contribution', async (request, reply) => {
    const admin = request.user as any;
    const { id } = request.params as any;

    // Check organization membership first
    const user = await User.findOne({ _id: id, organizationId: admin.organizationId }).select('_id');
    if (!user) {
      return reply.notFound('Employee not found in your organization');
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const monthPrefix = `${year}-${month}-`;

    const records = await Attendance.find({
      userId: id,
      date: { $regex: new RegExp('^' + monthPrefix) }
    })
      .select('date checkInTime checkOutTime')
      .lean();

    return reply.ok({ records });
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
}
