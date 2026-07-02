import { FastifyInstance } from 'fastify';
import { Leave } from '../../../../../models/Leave';
import { Holiday } from '../../../../../models/Holiday';
import { Organization } from '../../../../../models/Organization';
import { User } from '../../../../../models/User';
import { Notification } from '../../../../../models/Notification';
import { sendMail } from '../../../../../services/emailService';
import {
  getLeaveSubmittedAdminTemplate,
  getLeaveReviewedEmployeeTemplate,
} from '../../../../../utils/emailTemplates';

// Helper: Check if a date is a holiday or weekend
export async function isHolidayOrWeekend(dateStr: string, organizationId: string): Promise<boolean> {
  const date = new Date(dateStr);
  const day = date.getDay();
  // Sunday = 0, Saturday = 6
  if (day === 0 || day === 6) {
    return true;
  }

  const monthDay = dateStr.slice(5); // "MM-DD"
  const holiday = await Holiday.findOne({
    organizationId,
    $or: [
      { date: dateStr },
      { recurring: true, date: { $regex: new RegExp(`^\\d{4}-${monthDay}$`) } }
    ]
  });

  return !!holiday;
}

// Helper: Calculate leave day count excluding holidays/weekends
export async function calculateLeaveDays(startDateStr: string, endDateStr: string, organizationId: string): Promise<number> {
  let count = 0;
  let current = new Date(startDateStr);
  const end = new Date(endDateStr);

  while (current <= end) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    const currentStr = `${yyyy}-${mm}-${dd}`;

    const isOff = await isHolidayOrWeekend(currentStr, organizationId);
    if (!isOff) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export default async function leaveRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', fastify.authenticate);

  // POST /api/v1/app/leaves - Create leave request
  fastify.post('/', async (request, reply) => {
    const user = request.user as any;
    const { type, startDate, endDate, reason } = request.body as any;

    if (!type || !startDate || !endDate || !reason) {
      return reply.badRequest('MISSING_FIELDS', 'Type, start date, end date, and reason are required');
    }

    if (startDate > endDate) {
      return reply.badRequest('INVALID_DATE_RANGE', 'Start date must be before or equal to end date');
    }

    // 1. Overlapping check: check if any pending or approved leaves overlap
    const overlap = await Leave.findOne({
      employeeId: user.id,
      status: { $in: ['pending', 'approved'] },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });

    if (overlap) {
      return reply.badRequest('OVERLAPPING_LEAVE', 'You already have a pending or approved leave for this date range');
    }

    // 2. Calculate dayCount excluding weekends and holidays
    const dayCount = await calculateLeaveDays(startDate, endDate, user.organizationId);
    if (dayCount === 0) {
      return reply.badRequest('ZERO_LEAVE_DAYS', 'The requested date range contains only weekends and holidays');
    }

    // 3. Balance verification (skip for Unpaid)
    if (type.toLowerCase() !== 'unpaid') {
      const org = await Organization.findById(user.organizationId).lean();
      const leaveTypeConfig = org?.leaveTypes?.find(t => t.name.toLowerCase() === type.toLowerCase());
      const allotment = leaveTypeConfig ? leaveTypeConfig.annualAllotment : 12; // fallback to 12 if not found

      const currentYear = new Date().getFullYear();
      const startOfYear = `${currentYear}-01-01`;
      const endOfYear = `${currentYear}-12-31`;

      const approvedLeaves = await Leave.find({
        employeeId: user.id,
        type: { $regex: new RegExp(`^${type}$`, 'i') },
        status: 'approved',
        startDate: { $gte: startOfYear, $lte: endOfYear }
      }).lean();

      const approvedDays = approvedLeaves.reduce((sum, l) => sum + l.dayCount, 0);
      const remaining = allotment - approvedDays;

      if (dayCount > remaining) {
        return reply.badRequest('INSUFFICIENT_BALANCE', `Insufficient balance. Requested: ${dayCount} days, Remaining: ${remaining} days.`);
      }
    }

    const leave = new Leave({
      employeeId: user.id,
      organizationId: user.organizationId,
      type,
      startDate,
      endDate,
      dayCount,
      reason,
      status: 'pending',
    });

    await leave.save();

    // 4. Send Notifications to Admins
    const admins = await User.find({
      organizationId: user.organizationId,
      role: 'ADMIN',
    }).lean();

    const employeeName = user.name || 'An employee';

    for (const admin of admins) {
      if (admin.appNotificationsEnabled !== false) {
        await Notification.create({
          userId: admin._id,
          title: 'New Leave Request',
          message: `${employeeName} requested ${dayCount} day(s) of ${type} leave starting from ${startDate}.`
        });
      }

      if (admin.emailNotificationsEnabled !== false && admin.email) {
        const html = getLeaveSubmittedAdminTemplate(
          admin.name,
          employeeName,
          type,
          startDate,
          endDate,
          dayCount,
          reason
        );
        sendMail({
          to: admin.email,
          subject: `New Leave Request - ${employeeName}`,
          html,
        }).catch(err => console.error('Admin leave request email failed:', err));
      }
    }

    return reply.created({ message: 'Leave request submitted successfully', leave });
  });

  // GET /api/v1/app/leaves - List leaves
  fastify.get('/', async (request, reply) => {
    const user = request.user as any;
    const { status, employeeId, page = 1, limit = 10 } = request.query as any;

    const query: any = {};

    if (user.role === 'ADMIN') {
      query.organizationId = user.organizationId;
      if (employeeId) {
        query.employeeId = employeeId;
      }
    } else {
      query.employeeId = user.id;
    }

    if (status) {
      query.status = status;
    }

    const total = await Leave.countDocuments(query);
    const leaves = await Leave.find(query)
      .populate('employeeId', 'name email employeeId')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    return reply.ok({ leaves, total, page: Number(page), limit: Number(limit) });
  });

  // GET /api/v1/app/leaves/balance - Get leave balances (Employee only)
  fastify.get('/balance', async (request, reply) => {
    const user = request.user as any;

    const org = await Organization.findById(user.organizationId).lean();
    const leaveTypes = org?.leaveTypes || [
      { name: 'Sick', annualAllotment: 12 },
      { name: 'Casual', annualAllotment: 12 },
      { name: 'Paid', annualAllotment: 15 },
      { name: 'Unpaid', annualAllotment: 365 },
    ];

    const currentYear = new Date().getFullYear();
    const startOfYear = `${currentYear}-01-01`;
    const endOfYear = `${currentYear}-12-31`;

    const approvedLeaves = await Leave.find({
      employeeId: user.id,
      status: 'approved',
      startDate: { $gte: startOfYear, $lte: endOfYear }
    }).lean();

    const balances = leaveTypes.map(t => {
      const typeApprovedDays = approvedLeaves
        .filter(l => l.type.toLowerCase() === t.name.toLowerCase())
        .reduce((sum, l) => sum + l.dayCount, 0);

      return {
        type: t.name,
        allotment: t.annualAllotment,
        approvedCount: typeApprovedDays,
        remaining: t.name.toLowerCase() === 'unpaid' ? 999 : Math.max(0, t.annualAllotment - typeApprovedDays),
      };
    });

    return reply.ok({ balances });
  });

  // GET /api/v1/app/leaves/:id - Leave detail
  fastify.get('/:id', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;

    const leave = await Leave.findById(id)
      .populate('employeeId', 'name email department designation')
      .populate('reviewedBy', 'name');

    console.log("leave: ", leave);


    if (!leave) {
      return reply.notFound('Leave request not found');
    }

    if (user.role !== 'ADMIN' && leave.employeeId._id.toString() !== user.id) {
      return reply.forbidden('403', 'You are not authorized to view this leave request');
    }

    return reply.ok({ leave });
  });

  // PATCH /api/v1/app/leaves/:id/cancel - Cancel pending leave
  fastify.patch('/:id/cancel', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;

    const leave = await Leave.findOne({ _id: id, employeeId: user.id });
    if (!leave) {
      return reply.notFound('Leave request not found');
    }

    if (leave.status !== 'pending') {
      return reply.badRequest('LOCKED_STATUS', 'Only pending leave requests can be cancelled');
    }

    leave.status = 'cancelled';
    await leave.save();

    return reply.ok({ message: 'Leave request cancelled successfully', leave });
  });

  // PATCH /api/v1/app/leaves/:id/review - Review leave (Admin only)
  fastify.patch('/:id/review', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;
    const { status, comment } = request.body as any;

    if (user.role !== 'ADMIN') {
      return reply.forbidden('403', 'Only admins can review leave requests');
    }

    if (!status || !['approved', 'rejected'].includes(status)) {
      return reply.badRequest('INVALID_STATUS', 'Status must be either approved or rejected');
    }

    const leave = await Leave.findById(id).populate('employeeId');
    if (!leave) {
      return reply.notFound('Leave request not found');
    }

    if (leave.status !== 'pending') {
      return reply.badRequest('LOCKED_STATUS', 'Only pending leaves can be approved or rejected');
    }

    leave.status = status;
    leave.reviewedBy = user.id;
    leave.reviewComment = comment || undefined;
    await leave.save();

    // Notify employee
    const targetEmployee = leave.employeeId as any;
    if (targetEmployee) {
      if (targetEmployee.appNotificationsEnabled !== false) {
        await Notification.create({
          userId: targetEmployee._id,
          title: `Leave Request ${status === 'approved' ? 'Approved' : 'Rejected'}`,
          message: `Your leave request from ${leave.startDate} to ${leave.endDate} has been ${status}.`
        });
      }

      if (targetEmployee.emailNotificationsEnabled !== false && targetEmployee.email) {
        const html = getLeaveReviewedEmployeeTemplate(
          targetEmployee.name,
          status,
          leave.type,
          leave.startDate,
          leave.endDate,
          leave.dayCount,
          comment
        );
        sendMail({
          to: targetEmployee.email,
          subject: `Leave Request ${status.charAt(0).toUpperCase() + status.slice(1)} - Cluix`,
          html,
        }).catch(err => console.error('Employee leave review email failed:', err));
      }
    }

    return reply.ok({ message: `Leave request ${status} successfully`, leave });
  });
}
