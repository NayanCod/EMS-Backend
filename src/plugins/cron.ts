import fp from 'fastify-plugin';
import cron from 'node-cron';
import axios from 'axios';
import { User } from '../models/User';
import { Attendance } from '../models/Attendance';
import { Todo } from '../models/Todo';
import { Organization } from '../models/Organization';
import { Leave } from '../models/Leave';
import { Holiday } from '../models/Holiday';
import { sendMail } from '../services/emailService';
import { notifyUsers } from '../services/notificationService';
import {
  getDailyReportTemplate,
  getMonthlyReportTemplate,
  IEmployeeDailyRecord,
  IEmployeeMonthlyRecord,
} from '../utils/emailTemplates';

function getOffsetTimeStr(timeStr: string | undefined, offsetMinutes: number): string | null {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);

  let totalMinutes = hour * 60 + minute + offsetMinutes;
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }
  totalMinutes %= (24 * 60);

  const finalHour = Math.floor(totalMinutes / 60);
  const finalMinute = totalMinutes % 60;

  return `${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}`;
}

async function getMotivationalQuote(): Promise<string> {
  try {
    const res = await axios.get('https://zenquotes.io/api/random', { timeout: 3000 });
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      const q = res.data[0];
      return `"${q.q}" — ${q.a}`;
    }
  } catch (err: any) {
    console.error('[Cron] Failed to fetch motivational quote, using fallback:', err.message);
  }
  const fallbacks = [
    "Believe you can and you're halfway there. — Theodore Roosevelt",
    "The only way to do great work is to love what you do. — Steve Jobs",
    "Success is not final, failure is not fatal: it is the courage to continue that counts. — Winston Churchill",
    "Act as if what you do makes a difference. It does. — William James",
    "Keep your face always toward the sunshine - and shadows will fall behind you. — Walt Whitman"
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

async function getLunchAdvice(): Promise<string> {
  try {
    const res = await axios.get('https://api.adviceslip.com/advice', { timeout: 3000 });
    if (res.status === 200 && res.data?.slip?.advice) {
      return res.data.slip.advice;
    }
  } catch (err: any) {
    console.error('[Cron] Failed to fetch lunch advice, using fallback:', err.message);
  }
  const fallbacks = [
    "Time to step away from the keyboard and recharge.",
    "Feed your body and rest your mind. You've earned this break!",
    "A hungry mind needs a fed body.",
    "Step away, stretch your legs, and enjoy a nice meal.",
    "Don't skip lunch! Take some time to refuel."
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

async function getCheckoutAdvice(): Promise<string> {
  try {
    const res = await axios.get('https://api.adviceslip.com/advice', { timeout: 3000 });
    if (res.status === 200 && res.data?.slip?.advice) {
      return res.data.slip.advice;
    }
  } catch (err: any) {
    console.error('[Cron] Failed to fetch checkout advice, using fallback:', err.message);
  }
  const fallbacks = [
    "Fantastic job today! Wrap up your tasks and document your progress.",
    "Almost time to head home! Make sure your timesheet is updated and enjoy your evening.",
    "The day is winding down. Wrap up your pending items and prepare for a restful evening.",
    "You worked hard today. Take a moment to log out, checkout, and relax.",
    "Time to close the laptop! Enjoy your off-hours, you did great."
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

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

  // ─── Workday Reminders: Check every minute ───
  cron.schedule('* * * * *', async () => {
    console.log("runnning every minute cron of workday reminder");

    try {
      const now = new Date();
      // Use local timezone hours/minutes matching system/org definitions
      const currentHourStr = String(now.getHours()).padStart(2, '0');
      const currentMinuteStr = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHourStr}:${currentMinuteStr}`;

      const currentDateStr = now.toISOString().split('T')[0];
      const currentMonthDay = currentDateStr.slice(5); // MM-DD
      const currentDay = now.getDay(); // 0 (Sunday) to 6 (Saturday)

      // Skip on Saturday (6) or Sunday (0)
      // if (currentDay === 0 || currentDay === 6) {
      if (currentDay === 0) {
        return;
      }

      const orgs = await Organization.find().lean();
      if (orgs.length === 0) return;

      for (const org of orgs) {
        // Check if today is a registered holiday
        const isHoliday = await Holiday.findOne({
          organizationId: org._id,
          $or: [
            { date: currentDateStr },
            { recurring: true, date: { $regex: new RegExp(`^\\d{4}-${currentMonthDay}$`) } }
          ]
        }).lean();

        if (isHoliday) continue;

        const startReminderTime = getOffsetTimeStr(org.workStartTime || '09:00', -30);
        const lunchReminderTime = '13:00';
        const endReminderTime = getOffsetTimeStr(org.workEndTime || '18:00', -15);
        const lateCheckinTime = getOffsetTimeStr(org.workStartTime || '09:00', 30);
        const forgotCheckoutTime = getOffsetTimeStr(org.workEndTime || '18:00', 30);

        const isStart = currentTimeStr === startReminderTime;
        const isLunch = currentTimeStr === lunchReminderTime;
        const isEnd = currentTimeStr === endReminderTime;
        const isLateCheckin = currentTimeStr === lateCheckinTime;
        const isForgotCheckout = currentTimeStr === forgotCheckoutTime;

        console.log("current time", currentTimeStr);
        console.log("start reminder time", startReminderTime);
        console.log("lunch reminder time", lunchReminderTime);
        console.log("end reminder time", endReminderTime);
        console.log("late checkin time", lateCheckinTime);
        console.log("forgot checkout time", forgotCheckoutTime);


        if (!isStart && !isLunch && !isEnd && !isLateCheckin && !isForgotCheckout) {
          continue;
        }

        // Get active employees for this organization
        const employees = await User.find({
          organizationId: org._id,
          role: 'EMPLOYEE',
          status: 'ACTIVE'
        }).select('_id').lean();

        if (employees.length === 0) continue;

        // Filter out employees who have approved leave today
        const eligibleEmployees: string[] = [];
        for (const emp of employees) {
          const leave = await Leave.findOne({
            employeeId: emp._id,
            startDate: { $lte: currentDateStr },
            endDate: { $gte: currentDateStr },
            status: 'approved'
          }).lean();

          if (!leave) {
            eligibleEmployees.push(emp._id.toString());
          }
        }

        if (eligibleEmployees.length === 0) continue;

        if (isStart) {
          const quote = await getMotivationalQuote();
          console.log(`[Cron] Sending WORK_START_REMINDER to ${eligibleEmployees.length} employees of ${org.name}`);
          await notifyUsers(eligibleEmployees, 'WORK_START_REMINDER', {
            message: `Good morning! ☕ Office starts in 30 minutes (${org.workStartTime || '09:00'}).\n${quote}`
          }, false);
        } else if (isLunch) {
          const checkedInRecipientIds: string[] = [];
          for (const empId of eligibleEmployees) {
            const att = await Attendance.findOne({
              userId: empId,
              date: currentDateStr
            }).lean();
            if (att && att.checkInTime) {
              checkedInRecipientIds.push(empId);
            }
          }

          if (checkedInRecipientIds.length > 0) {
            const advice = await getLunchAdvice();
            console.log(`[Cron] Sending LUNCH_BREAK_REMINDER to ${checkedInRecipientIds.length} employees of ${org.name}`);
            await notifyUsers(checkedInRecipientIds, 'LUNCH_BREAK_REMINDER', {
              message: `${advice}🍕🥤🌮`
            }, false);
          }
        } else if (isEnd) {
          const checkedInRecipientIds: string[] = [];
          for (const empId of eligibleEmployees) {
            const att = await Attendance.findOne({
              userId: empId,
              date: currentDateStr
            }).lean();
            if (att && att.checkInTime && !att.checkOutTime) {
              checkedInRecipientIds.push(empId);
            }
          }

          if (checkedInRecipientIds.length > 0) {
            const advice = await getCheckoutAdvice();
            console.log(`[Cron] Sending WORK_END_REMINDER to ${checkedInRecipientIds.length} employees of ${org.name}`);
            await notifyUsers(checkedInRecipientIds, 'WORK_END_REMINDER', {
              message: `Office wraps up in 15 minutes (${org.workEndTime || '18:00'}).\n${advice}\nDon't forget to check out! 💼`
            }, false);
          }
        } else if (isLateCheckin) {
          const lateRecipientIds: string[] = [];
          for (const empId of eligibleEmployees) {
            const att = await Attendance.findOne({
              userId: empId,
              date: currentDateStr
            }).lean();

            if (!att || !att.checkInTime) {
              lateRecipientIds.push(empId);
            }
          }

          if (lateRecipientIds.length > 0) {
            const lateMessagesList = [
              "Oh, seems like you are late today! Did you forget to check in? ⏰",
              "Running a bit behind schedule? Don't forget to mark your attendance! 🏃‍♂️",
              "Good morning! We noticed you haven't checked in yet. Are you on your way? 🚗",
              "Time is ticking! Let us know you're here by checking in. ⏱️",
              "Hello! Just a reminder to check in and register your start of day. 📅"
            ];
            const randomMsg = lateMessagesList[Math.floor(Math.random() * lateMessagesList.length)];
            console.log(`[Cron] Sending LATE_CHECKIN_WARNING to ${lateRecipientIds.length} employees of ${org.name}`);
            await notifyUsers(lateRecipientIds, 'LATE_CHECKIN_WARNING', {
              message: randomMsg
            }, false);
          }
        } else if (isForgotCheckout) {
          const forgotRecipientIds: string[] = [];
          for (const empId of eligibleEmployees) {
            const att = await Attendance.findOne({
              userId: empId,
              date: currentDateStr
            }).lean();

            if (att && att.checkInTime && !att.checkOutTime) {
              forgotRecipientIds.push(empId);
            }
          }

          if (forgotRecipientIds.length > 0) {
            const checkoutMessagesList = [
              "Working late? Or did you forget to check out? 🏢",
              "Still at the office? Remember to check out for the day! 🌅",
              "Time to head home! Make sure to mark your checkout. 🏠",
              "Don't forget to wrap up your day and checkout. Rest well! 🛋️",
              "Are you done for the day? Please complete your check out. 🚪"
            ];
            const randomMsg = checkoutMessagesList[Math.floor(Math.random() * checkoutMessagesList.length)];
            console.log(`[Cron] Sending FORGOT_CHECKOUT_WARNING to ${forgotRecipientIds.length} employees of ${org.name}`);
            await notifyUsers(forgotRecipientIds, 'FORGOT_CHECKOUT_WARNING', {
              message: randomMsg
            }, false);
          }
        }
      }
    } catch (err) {
      console.error('[Cron] Workday reminder job failed:', err);
    }
  });

  // ─── TESTING CRON JOB: Runs every minute and sends all 5 workday notifications to all active employees ───
  // cron.schedule('* * * * *', async () => {
  //   console.log('[Cron Test] Running workday notifications test job...');
  //   try {
  //     const employees = await User.find({ role: 'EMPLOYEE', status: 'ACTIVE' }).select('_id').lean();
  //     const recipientIds = employees.map(emp => emp._id.toString());
  //     if (recipientIds.length === 0) {
  //       console.log('[Cron Test] No active employees found to send test notifications.');
  //       return;
  //     }

  //     console.log(`[Cron Test] Sending test notifications to ${recipientIds.length} employees...`);

  //     // 1. Start Reminder
  //     const quote = await getMotivationalQuote();
  //     await notifyUsers(recipientIds, 'WORK_START_REMINDER', {
  //       message: `[TEST] Good morning! ☕ Office starts in 30 minutes.\n${quote}`
  //     }, false);

  //     // 2. Lunch Break
  //     const lunchAdvice = await getLunchAdvice();
  //     await notifyUsers(recipientIds, 'LUNCH_BREAK_REMINDER', {
  //       message: `[TEST] Lunch break time! 🍔\n${lunchAdvice}\n🍕🥤🌮`
  //     }, false);

  //     // 3. End Reminder
  //     const checkoutAdvice = await getCheckoutAdvice();
  //     await notifyUsers(recipientIds, 'WORK_END_REMINDER', {
  //       message: `[TEST] Office wraps up in 15 minutes. 🌅\n${checkoutAdvice}\nDon't forget to check out! 💼`
  //     }, false);

  //     // 4. Late Check-in
  //     const lateMessagesList = [
  //       "Oh, seems like you are late today! Did you forget to check in? ⏰",
  //       "Running a bit behind schedule? Don't forget to mark your attendance! 🏃‍♂️",
  //       "Good morning! We noticed you haven't checked in yet. Are you on your way? 🚗"
  //     ];
  //     await notifyUsers(recipientIds, 'LATE_CHECKIN_WARNING', {
  //       message: `[TEST] ${lateMessagesList[Math.floor(Math.random() * lateMessagesList.length)]}`
  //     }, false);

  //     // 5. Forgot Checkout
  //     const checkoutMessagesList = [
  //       "Working late? Or did you forget to check out? 🏢",
  //       "Still at the office? Remember to check out for the day! 🌅",
  //       "Time to head home! Make sure to mark your checkout. 🏠"
  //     ];
  //     await notifyUsers(recipientIds, 'FORGOT_CHECKOUT_WARNING', {
  //       message: `[TEST] ${checkoutMessagesList[Math.floor(Math.random() * checkoutMessagesList.length)]}`
  //     }, false);

  //     console.log('[Cron Test] Sent all 5 workday test notifications successfully.');
  //   } catch (err) {
  //     console.error('[Cron Test] Failed to send test notifications:', err);
  //   }
  // });

  console.log('[Cron] Scheduled: Daily report at 11:30 AM, Monthly report on 1st at 12:30 PM, workday reminders, test cron job.');
});
