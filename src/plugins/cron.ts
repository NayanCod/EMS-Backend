import fp from 'fastify-plugin';
import cron from 'node-cron';
import { User } from '../models/User';
import { Attendance } from '../models/Attendance';
import { Todo } from '../models/Todo';
import { Organization } from '../models/Organization';
import { sendMail } from '../services/emailService';
import {
  getDailyReportTemplate,
  getMonthlyReportTemplate,
  IEmployeeDailyRecord,
  IEmployeeMonthlyRecord,
} from '../utils/emailTemplates';

export default fp(async (fastify, _opts) => {
  // ─── Daily Report: Every day at 11:30 AM ───
  cron.schedule('30 11 * * *', async () => {
    // cron.schedule('*/30 * * * * *', async () => {
    console.log('[Cron] Running daily report job...');
    try {
      const orgs = await Organization.find().lean();
      console.log("orgs", orgs)

      for (const org of orgs) {
        // Find all admins for this org with email notifications enabled
        const admins = await User.find({
          organizationId: org._id,
          role: 'ADMIN',
          emailNotificationsEnabled: true,
        }).select('email').lean();
        console.log("admins", admins)

        if (admins.length === 0) continue;

        // Yesterday's date
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // All employees in org
        const employees = await User.find({
          organizationId: org._id,
          role: 'EMPLOYEE',
        }).select('name _id').lean();
        console.log("employees", employees)

        const employeeIds = employees.map(e => e._id);

        // Attendance records for yesterday
        const attendances = await Attendance.find({
          userId: { $in: employeeIds },
          date: yesterdayStr,
        }).lean();
        console.log("attendances", attendances)

        // Todos for yesterday
        const todos = await Todo.find({
          userId: { $in: employeeIds },
          date: yesterdayStr,
        }).lean();
        console.log("todos", todos)

        const records: IEmployeeDailyRecord[] = employees.map(emp => {
          const att = attendances.find(a => a.userId.toString() === emp._id.toString());
          const empTodos = todos.filter(t => t.userId.toString() === emp._id.toString());

          return {
            name: emp.name,
            status: att ? 'Present' : 'Absent',
            checkIn: att?.checkInTime
              ? new Date(att.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '-',
            checkOut: att?.checkOutTime
              ? new Date(att.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '-',
            completedTasks: empTodos.filter(t => t.status === 'completed').map(t => t.task),
            pendingTasks: empTodos.filter(t => t.status === 'pending').map(t => t.task),
          };
        });

        const html = getDailyReportTemplate(yesterdayStr, org.name, records);
        const adminEmails = admins.map(a => a.email);
        console.log("adminEmails", adminEmails)

        await sendMail({
          to: adminEmails,
          subject: `Daily Report - ${org.name} - ${yesterdayStr}`,
          html,
        });
      }

      console.log('[Cron] Daily report job completed.');
    } catch (err) {
      console.error('[Cron] Daily report job failed:', err);
    }
  });

  // ─── Monthly Report: 1st of every month at 12:30 PM ───
  cron.schedule('30 12 1 * *', async () => {
    console.log('[Cron] Running monthly report job...');
    try {
      const orgs = await Organization.find().lean();

      for (const org of orgs) {
        const admins = await User.find({
          organizationId: org._id,
          role: 'ADMIN',
          emailNotificationsEnabled: true,
        }).select('email').lean();

        if (admins.length === 0) continue;

        // Previous month boundaries
        const now = new Date();
        const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        const totalDays = lastDayPrevMonth.getDate();

        const startStr = firstDayPrevMonth.toISOString().split('T')[0];
        const endStr = lastDayPrevMonth.toISOString().split('T')[0];

        const monthName = firstDayPrevMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

        const employees = await User.find({
          organizationId: org._id,
          role: 'EMPLOYEE',
        }).select('name _id').lean();

        const employeeIds = employees.map(e => e._id);

        // All attendance records for previous month
        const attendances = await Attendance.find({
          userId: { $in: employeeIds },
          date: { $gte: startStr, $lte: endStr },
        }).lean();

        // All todos for previous month
        const todos = await Todo.find({
          userId: { $in: employeeIds },
          date: { $gte: startStr, $lte: endStr },
        }).lean();

        const records: IEmployeeMonthlyRecord[] = employees.map(emp => {
          const empAttendances = attendances.filter(a => a.userId.toString() === emp._id.toString());
          const empTodos = todos.filter(t => t.userId.toString() === emp._id.toString());

          const presentDays = empAttendances.length;
          const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

          return {
            name: emp.name,
            presentDays,
            totalDays,
            attendanceRate,
            completedTasksCount: empTodos.filter(t => t.status === 'completed').length,
            pendingTasksCount: empTodos.filter(t => t.status === 'pending').length,
          };
        });

        const html = getMonthlyReportTemplate(monthName, org.name, records);
        const adminEmails = admins.map(a => a.email);

        await sendMail({
          to: adminEmails,
          subject: `Monthly Report - ${org.name} - ${monthName}`,
          html,
        });
      }

      console.log('[Cron] Monthly report job completed.');
    } catch (err) {
      console.error('[Cron] Monthly report job failed:', err);
    }
  });

  console.log('[Cron] Scheduled: Daily report at 11:30 AM, Monthly report on 1st at 12:30 PM');
});
