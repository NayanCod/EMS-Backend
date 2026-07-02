import fp from 'fastify-plugin';
import cron from 'node-cron';
import { User } from '../models/User';
import { Attendance } from '../models/Attendance';
import { Todo } from '../models/Todo';
import { Organization } from '../models/Organization';
import { Leave } from '../models/Leave';
import { Holiday } from '../models/Holiday';
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
    console.log('[Cron] Running daily report job...');
    try {
      const orgs = await Organization.find().lean();

      for (const org of orgs) {
        // Find all admins for this org with email notifications enabled
        const admins = await User.find({
          organizationId: org._id,
          role: 'ADMIN',
          emailNotificationsEnabled: true,
        }).select('email').lean();

        if (admins.length === 0) continue;

        // Yesterday's date
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const yesterdayMonthDay = yesterdayStr.slice(5); // MM-DD

        // Check if yesterday was a holiday
        const yesterdayHoliday = await Holiday.findOne({
          organizationId: org._id,
          $or: [
            { date: yesterdayStr },
            { recurring: true, date: { $regex: new RegExp(`^\\d{4}-${yesterdayMonthDay}$`) } }
          ]
        }).lean();

        // All employees in org
        const employees = await User.find({
          organizationId: org._id,
          role: 'EMPLOYEE',
          status: 'ACTIVE'
        }).select('name _id').lean();

        const employeeIds = employees.map(e => e._id);

        // Attendance records for yesterday
        const attendances = await Attendance.find({
          userId: { $in: employeeIds },
          date: yesterdayStr,
        }).lean();

        // Todos for yesterday
        const todos = await Todo.find({
          userId: { $in: employeeIds },
          date: yesterdayStr,
        }).lean();

        const records: IEmployeeDailyRecord[] = [];
        for (const emp of employees) {
          const att = attendances.find(a => a.userId.toString() === emp._id.toString());
          const empTodos = todos.filter(t => t.userId.toString() === emp._id.toString());

          // Check if employee was on approved leave yesterday
          const leave = await Leave.findOne({
            employeeId: emp._id,
            startDate: { $lte: yesterdayStr },
            endDate: { $gte: yesterdayStr },
            status: 'approved'
          }).lean();

          let status = 'Absent';
          if (att) {
            status = yesterdayHoliday ? 'Present (Holiday)' : 'Present';
          } else if (leave) {
            status = `On Leave (${leave.type})`;
          } else if (yesterdayHoliday) {
            status = 'Holiday';
          }

          records.push({
            name: emp.name,
            status,
            checkIn: att?.checkInTime
              ? new Date(att.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '-',
            checkOut: att?.checkOutTime
              ? new Date(att.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '-',
            completedTasks: empTodos.filter(t => t.status === 'completed').map(t => t.task),
            pendingTasks: empTodos.filter(t => t.status === 'pending').map(t => t.task),
          });
        }

        const html = getDailyReportTemplate(yesterdayStr, org.name, records);
        const adminEmails = admins.map(a => a.email);

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

        // Calculate weekdays (workingDays) in previous month
        let workingDaysInMonth = 0;
        let dIter = new Date(firstDayPrevMonth);
        while (dIter <= lastDayPrevMonth) {
          const day = dIter.getDay();
          if (day !== 0 && day !== 6) { // not Sat/Sun
            workingDaysInMonth++;
          }
          dIter.setDate(dIter.getDate() + 1);
        }

        // Fetch organization holidays to deduct
        const orgHolidays = await Holiday.find({ organizationId: org._id }).lean();
        let holidayDaysInMonth = 0;
        dIter = new Date(firstDayPrevMonth);
        while (dIter <= lastDayPrevMonth) {
          const yyyy = dIter.getFullYear();
          const mm = String(dIter.getMonth() + 1).padStart(2, '0');
          const dd = String(dIter.getDate()).padStart(2, '0');
          const dStr = `${yyyy}-${mm}-${dd}`;
          const monthDay = dStr.slice(5);

          const isHoliday = orgHolidays.some(h => h.date === dStr || (h.recurring && h.date.slice(5) === monthDay));
          const day = dIter.getDay();

          // Only count weekday holidays to avoid double deduction
          if (isHoliday && day !== 0 && day !== 6) {
            holidayDaysInMonth++;
          }
          dIter.setDate(dIter.getDate() + 1);
        }

        const denominator = Math.max(1, workingDaysInMonth - holidayDaysInMonth);

        const employees = await User.find({
          organizationId: org._id,
          role: 'EMPLOYEE',
          status: 'ACTIVE'
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

        const records: IEmployeeMonthlyRecord[] = [];
        for (const emp of employees) {
          const empAttendances = attendances.filter(a => a.userId.toString() === emp._id.toString());
          const empTodos = todos.filter(t => t.userId.toString() === emp._id.toString());

          // Find approved leaves for this employee in previous month
          const empLeaves = await Leave.find({
            employeeId: emp._id,
            status: 'approved',
            startDate: { $lte: endStr },
            endDate: { $gte: startStr }
          }).lean();

          // Calculate leave days overlapping the previous month (excluding weekends/holidays)
          let leaveDaysTaken = 0;
          for (const leave of empLeaves) {
            const overlapStartStr = leave.startDate > startStr ? leave.startDate : startStr;
            const overlapEndStr = leave.endDate < endStr ? leave.endDate : endStr;

            let lIter = new Date(overlapStartStr);
            const overlapEnd = new Date(overlapEndStr);

            while (lIter <= overlapEnd) {
              const yyyy = lIter.getFullYear();
              const mm = String(lIter.getMonth() + 1).padStart(2, '0');
              const dd = String(lIter.getDate()).padStart(2, '0');
              const dStr = `${yyyy}-${mm}-${dd}`;
              const monthDay = dStr.slice(5);

              const isWeekend = lIter.getDay() === 0 || lIter.getDay() === 6;
              const isHoliday = orgHolidays.some(h => h.date === dStr || (h.recurring && h.date.slice(5) === monthDay));

              if (!isWeekend && !isHoliday) {
                leaveDaysTaken++;
              }
              lIter.setDate(lIter.getDate() + 1);
            }
          }

          const presentDays = empAttendances.length;
          const attendanceRate = denominator > 0 ? Math.round((presentDays / denominator) * 100) : 0;

          records.push({
            name: emp.name,
            presentDays,
            totalDays: denominator,
            attendanceRate,
            leaveDaysTaken,
            completedTasksCount: empTodos.filter(t => t.status === 'completed').length,
            pendingTasksCount: empTodos.filter(t => t.status === 'pending').length,
          });
        }

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
