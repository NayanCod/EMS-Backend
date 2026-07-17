import { Attendance } from '../models/Attendance';

export async function processForgottenCheckouts(userId?: string) {
  // We identify forgotten checkouts as records where date < today and checkOutTime is null/undefined.
  const todayStr = new Date().toISOString().split('T')[0];

  const query: any = {
    date: { $lt: todayStr },
    $or: [
      { checkOutTime: { $exists: false } },
      { checkOutTime: null }
    ]
  };

  if (userId) {
    query.userId = userId;
  }

  const forgottenRecords = await Attendance.find(query);
  if (forgottenRecords.length > 0) {
    console.log(`[AttendanceService] Found ${forgottenRecords.length} forgotten checkouts to process.`);
  }

  for (const record of forgottenRecords) {
    // Set checkOutTime to 6 hours after checkInTime (representing a half-day mark)
    const checkIn = new Date(record.checkInTime);
    const checkOut = new Date(checkIn.getTime() + 6 * 60 * 60 * 1000); // 6 hours later

    record.checkOutTime = checkOut;
    record.forgotCheckout = true;
    record.forgotCheckoutAlertShown = false;

    const msg = "Forgot to checkout - marked halfday (6h after checkin)";
    if (record.reason) {
      record.reason = `${record.reason} | ${msg}`;
    } else {
      record.reason = msg;
    }

    await record.save();
    console.log(`[AttendanceService] Processed forgotten checkout for user ${record.userId} on date ${record.date}`);
  }
}
