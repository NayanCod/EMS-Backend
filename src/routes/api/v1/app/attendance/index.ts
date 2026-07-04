import { FastifyInstance } from 'fastify';
import { Attendance } from '../../../../../models/Attendance';
import { Organization } from '../../../../../models/Organization';
import { Leave } from '../../../../../models/Leave';
import { Holiday } from '../../../../../models/Holiday';

export default async function attendanceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', fastify.authenticate);

  // POST /check-in
  fastify.post('/check-in', async (request, reply) => {
    const user = request.user as any;
    const { latitude, longitude } = request.body as { latitude: number; longitude: number };

    if (latitude == null || longitude == null) {
      return reply.badRequest('MISSING_FIELDS', 'Latitude and longitude are required');
    }

    const today = new Date().toISOString().split('T')[0];

    // Check if on approved leave today
    const onLeave = await Leave.findOne({
      employeeId: user.id,
      startDate: { $lte: today },
      endDate: { $gte: today },
      status: 'approved'
    });
    if (onLeave) {
      return reply.badRequest('ON_APPROVED_LEAVE', "You're on approved leave today");
    }

    // Check if already checked in today
    const existing = await Attendance.findOne({ userId: user.id, date: today });
    if (existing) {
      return reply.badRequest('ALREADY_CHECKED_IN', 'You have already checked in today');
    }

    // Geofence check
    const org = await Organization.findById(user.organizationId);
    if (org?.location && org.radius) {
      const dist = getDistance(
        org.location.latitude,
        org.location.longitude,
        latitude,
        longitude
      );
      if (dist > org.radius) {
        return reply.badRequest('OUTSIDE_RADIUS', 'You are outside the office radius');
      }
    }

    const record = new Attendance({
      userId: user.id,
      date: today,
      checkInTime: new Date(),
      latitude,
      longitude,
    });

    await record.save();
    return reply.created({ message: 'Checked in successfully', record });
  });

  // POST /check-out
  fastify.post('/check-out', async (request, reply) => {
    const user = request.user as any;
    const today = new Date().toISOString().split('T')[0];

    const record = await Attendance.findOne({ userId: user.id, date: today });
    if (!record) {
      return reply.badRequest('NOT_CHECKED_IN', 'You have not checked in today');
    }

    if (record.checkOutTime) {
      return reply.badRequest('ALREADY_CHECKED_OUT', 'You have already checked out today');
    }

    record.checkOutTime = new Date();
    await record.save();

    return reply.ok({ message: 'Checked out successfully', record });
  });

  // GET /history
  fastify.get('/history', async (request, reply) => {
    const user = request.user as any;
    const { page = 1, limit = 10, status = 'all' } = request.query as any;

    const earliestRecord = await Attendance.findOne({ userId: user.id })
      .sort({ date: 1 })
      .lean();

    let limitDays = 60;
    if (earliestRecord) {
      const [ey, em, ed] = earliestRecord.date.split('-').map(Number);
      const earliestDate = new Date(ey, em - 1, ed);

      const now = new Date();
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const diffTime = todayDate.getTime() - earliestDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

      limitDays = Math.max(1, diffDays);
    } else {
      limitDays = 1;
    }

    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - (limitDays - 1));
    const startDateStr = startDate.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    const attendanceRecords = await Attendance.find({
      userId: user.id,
      date: { $gte: startDateStr, $lte: todayStr }
    }).lean();

    const leaves = await Leave.find({
      employeeId: user.id,
      status: 'approved',
      startDate: { $lte: todayStr },
      endDate: { $gte: startDateStr }
    }).lean();

    const holidays = await Holiday.find({
      organizationId: user.organizationId
    }).lean();

    const attendanceMap = new Map();
    for (const record of attendanceRecords) {
      attendanceMap.set(record.date, record);
    }

    const allItems = [];
    for (let i = 0; i < limitDays; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);

      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const record = attendanceMap.get(dateStr);

      if (record) {
        allItems.push({
          _id: record._id.toString(),
          date: dateStr,
          checkInTime: record.checkInTime,
          checkOutTime: record.checkOutTime,
          status: 'present',
        });
      } else {
        const monthDay = dateStr.slice(5); // "MM-DD"
        const holidayRecord = holidays.find((h: any) => h.date === dateStr || (h.recurring && h.date.slice(5) === monthDay));
        const leaveRecord = leaves.find((l: any) => dateStr >= l.startDate && dateStr <= l.endDate);

        const dayOfWeek = d.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (leaveRecord) {
          allItems.push({
            _id: `leave-${dateStr}`,
            date: dateStr,
            status: 'leave',
            leaveType: leaveRecord.type,
          });
        } else if (holidayRecord) {
          allItems.push({
            _id: `holiday-${dateStr}`,
            date: dateStr,
            status: 'holiday',
            holidayName: holidayRecord.name,
          });
        } else {
          allItems.push({
            _id: `absent-${dateStr}`,
            date: dateStr,
            status: isWeekend ? 'off-day' : 'absent',
          });
        }
      }
    }

    let filteredItems = allItems;
    if (status !== 'all') {
      filteredItems = allItems.filter(item => item.status === status);
    }

    const total = filteredItems.length;
    const paginatedItems = filteredItems.slice((Number(page) - 1) * Number(limit), Number(page) * Number(limit));

    return reply.ok({ records: paginatedItems, total, page: Number(page), limit: Number(limit) });
  });

  // GET /contribution — highly optimized attendance for contribution graph (selected or current month/year)
  fastify.get('/contribution', async (request, reply) => {
    const user = request.user as any;
    const { month, year } = request.query as any;

    const now = new Date();
    const targetYear = year ? Number(year) : now.getFullYear();
    const targetMonth = month ? Number(month) : (now.getMonth() + 1);

    const monthStr = String(targetMonth).padStart(2, '0');
    const monthPrefix = `${targetYear}-${monthStr}-`;

    const records = await Attendance.find({
      userId: user.id,
      date: { $regex: new RegExp('^' + monthPrefix) }
    })
      .select('date checkInTime checkOutTime')
      .lean();

    const startOfMonth = `${targetYear}-${monthStr}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endOfMonth = `${targetYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

    const leaves = await Leave.find({
      employeeId: user.id,
      status: 'approved',
      startDate: { $lte: endOfMonth },
      endDate: { $gte: startOfMonth }
    })
      .select('startDate endDate type')
      .lean();

    return reply.ok({ records, leaves });
  });


  // GET /stats — weekly working hours, punctuality, and org start time
  fastify.get('/stats', async (request, reply) => {
    const user = request.user as any;

    // Get current week boundaries (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const mondayStr = monday.toISOString().split('T')[0];
    const sundayStr = sunday.toISOString().split('T')[0];

    const weekRecords = await Attendance.find({
      userId: user.id,
      date: { $gte: mondayStr, $lte: sundayStr },
    }).lean();

    // Calculate total working hours this week
    let totalMinutes = 0;
    for (const rec of weekRecords) {
      if (rec.checkInTime && rec.checkOutTime) {
        totalMinutes += (new Date(rec.checkOutTime).getTime() - new Date(rec.checkInTime).getTime()) / 60000;
      }
    }
    const workingHours = Math.round(totalMinutes / 60);

    // Get organization start time for punctuality calculation
    const org = await Organization.findById(user.organizationId).lean();
    const workStartTime = org?.workStartTime || '09:00';

    // Punctuality: % of days this week checked in at or before start time
    let onTimeDays = 0;
    if (weekRecords.length > 0) {
      const [startH, startM] = workStartTime.split(':').map(Number);
      for (const rec of weekRecords) {
        const checkIn = new Date(rec.checkInTime);
        const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
        const startMinutes = startH * 60 + startM;
        if (checkInMinutes <= startMinutes) {
          onTimeDays++;
        }
      }
    }
    const punctuality = weekRecords.length > 0
      ? Math.round((onTimeDays / weekRecords.length) * 100)
      : 0;

    return reply.ok({ workingHours, punctuality, workStartTime });
  });
}

// Haversine distance in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
