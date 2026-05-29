import { FastifyInstance } from 'fastify';
import { Attendance } from '../../../../../models/Attendance';
import { Organization } from '../../../../../models/Organization';

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

    const records = await Attendance.find({ userId: user.id })
      .sort({ date: -1 })
      .limit(30)
      .lean();

    return reply.ok({ records });
  });

  // GET /contribution — highly optimized attendance for contribution graph (current month)
  fastify.get('/contribution', async (request, reply) => {
    const user = request.user as any;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const monthPrefix = `${year}-${month}-`;

    const records = await Attendance.find({
      userId: user.id,
      date: { $regex: new RegExp('^' + monthPrefix) }
    })
      .select('date checkInTime checkOutTime')
      .lean();

    return reply.ok({ records });
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
