import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Organization } from '../../../../../models/Organization';
import * as reportService from '../../../../../services/reportService';
import * as reportPdfService from '../../../../../services/reportPdfService';
import * as reportExcelService from '../../../../../services/reportExcelService';

export default async function reportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', fastify.authenticate);

  // Helper to validate and calculate date ranges
  const getValidatedDates = (request: FastifyRequest, reply: FastifyReply) => {
    const { startDate, endDate, employeeId, format } = request.query as any;

    if (!format || (format !== 'pdf' && format !== 'excel')) {
      reply.badRequest('INVALID_FORMAT', 'Format query parameter must be either pdf or excel');
      return null;
    }

    // Default to last 30 days if not provided
    let startStr = startDate;
    let endStr = endDate;

    if (!startStr || !endStr) {
      const today = new Date();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      startStr = startStr || thirtyDaysAgo.toISOString().split('T')[0];
      endStr = endStr || today.toISOString().split('T')[0];
    }

    const start = new Date(startStr);
    const end = new Date(endStr);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      reply.badRequest('INVALID_DATES', 'Start date and end date must be valid dates (YYYY-MM-DD)');
      return null;
    }

    if (start > end) {
      reply.badRequest('INVALID_DATES', 'Start date must be less than or equal to end date');
      return null;
    }

    // 90-day range cap check for org-wide (if employeeId not provided and user role is admin)
    const user = request.user as any;
    const effectiveEmployeeId = user.role === 'EMPLOYEE' ? user.id : employeeId;

    if (!effectiveEmployeeId) {
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 90) {
        reply.badRequest('RANGE_EXCEEDED', 'Org-wide reports are limited to a 90-day range — narrow the date range or filter by employee');
        return null;
      }
    }

    return {
      startDate: startStr,
      endDate: endStr,
      format,
      employeeId: effectiveEmployeeId
    };
  };

  // Helper to fetch org name
  const getOrgName = async (orgId: string): Promise<string> => {
    const org = await Organization.findById(orgId).select('name').lean();
    return org?.name || 'Organization';
  };

  // Stream responder
  const streamFile = (reply: FastifyReply, buffer: Buffer, format: 'pdf' | 'excel', filename: string) => {
    const contentType = format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    reply.header('Content-Type', contentType);
    reply.header('Content-Disposition', `attachment; filename="${filename}.${format === 'pdf' ? 'pdf' : 'xlsx'}"`);
    reply.send(buffer);
  };

  // 1. Attendance Report
  fastify.get('/attendance', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as any;
    const validated = getValidatedDates(request, reply);
    if (!validated) return; // reply sent by helper

    const { startDate, endDate, format, employeeId } = validated;
    const orgName = await getOrgName(user.organizationId);
    const dateRange = `${startDate} to ${endDate}`;
    const generatedBy = `${user.name} (${user.role})`;

    const rows = await reportService.getAttendanceReportData(user.organizationId, {
      startDate,
      endDate,
      employeeId
    });

    let buffer: Buffer;
    if (format === 'pdf') {
      buffer = await reportPdfService.generateAttendancePdf(rows, orgName, dateRange, generatedBy);
    } else {
      buffer = await reportExcelService.generateAttendanceExcel(rows, orgName, dateRange, generatedBy);
    }

    streamFile(reply, buffer, format, `attendance-report-${startDate}-to-${endDate}`);
  });

  // 2. Leave Report
  fastify.get('/leave', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as any;
    const validated = getValidatedDates(request, reply);
    if (!validated) return;

    const { startDate, endDate, format, employeeId } = validated;
    const orgName = await getOrgName(user.organizationId);
    const dateRange = `${startDate} to ${endDate}`;
    const generatedBy = `${user.name} (${user.role})`;

    const rows = await reportService.getLeaveReportData(user.organizationId, {
      startDate,
      endDate,
      employeeId
    });

    let buffer: Buffer;
    if (format === 'pdf') {
      buffer = await reportPdfService.generateLeavePdf(rows, orgName, dateRange, generatedBy);
    } else {
      buffer = await reportExcelService.generateLeaveExcel(rows, orgName, dateRange, generatedBy);
    }

    streamFile(reply, buffer, format, `leave-report-${startDate}-to-${endDate}`);
  });

  // 3. Task Report (Admin only)
  fastify.get('/task', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as any;
    if (user.role !== 'ADMIN') {
      return reply.forbidden('FORBIDDEN', 'Only administrators can access task reports');
    }

    const validated = getValidatedDates(request, reply);
    if (!validated) return;

    const { startDate, endDate, format, employeeId } = validated;
    const { projectId } = request.query as any;

    const orgName = await getOrgName(user.organizationId);
    const dateRange = `${startDate} to ${endDate}`;
    const generatedBy = `${user.name} (${user.role})`;

    const rows = await reportService.getTaskReportData(user.organizationId, {
      startDate,
      endDate,
      employeeId,
      projectId
    });

    let buffer: Buffer;
    if (format === 'pdf') {
      buffer = await reportPdfService.generateTaskPdf(rows, orgName, dateRange, generatedBy);
    } else {
      buffer = await reportExcelService.generateTaskExcel(rows, orgName, dateRange, generatedBy);
    }

    streamFile(reply, buffer, format, `task-report-${startDate}-to-${endDate}`);
  });

  // 4. Reimbursement Report
  fastify.get('/reimbursement', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as any;
    const validated = getValidatedDates(request, reply);
    if (!validated) return;

    const { startDate, endDate, format, employeeId } = validated;
    const { category } = request.query as any;

    const orgName = await getOrgName(user.organizationId);
    const dateRange = `${startDate} to ${endDate}`;
    const generatedBy = `${user.name} (${user.role})`;

    const rows = await reportService.getReimbursementReportData(user.organizationId, {
      startDate,
      endDate,
      employeeId,
      category
    });

    let buffer: Buffer;
    if (format === 'pdf') {
      buffer = await reportPdfService.generateReimbursementPdf(rows, orgName, dateRange, generatedBy);
    } else {
      buffer = await reportExcelService.generateReimbursementExcel(rows, orgName, dateRange, generatedBy);
    }

    streamFile(reply, buffer, format, `reimbursement-report-${startDate}-to-${endDate}`);
  });

  // 5. Project Report (Admin only)
  fastify.get('/project', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as any;
    if (user.role !== 'ADMIN') {
      return reply.forbidden('FORBIDDEN', 'Only administrators can access project reports');
    }

    const validated = getValidatedDates(request, reply);
    if (!validated) return;

    const { startDate, endDate, format } = validated;
    const { projectId } = request.query as any;

    const orgName = await getOrgName(user.organizationId);
    const dateRange = `${startDate} to ${endDate}`;
    const generatedBy = `${user.name} (${user.role})`;

    const rows = await reportService.getProjectReportData(user.organizationId, {
      startDate,
      endDate,
      projectId
    });

    let buffer: Buffer;
    if (format === 'pdf') {
      buffer = await reportPdfService.generateProjectPdf(rows, orgName, dateRange, generatedBy);
    } else {
      buffer = await reportExcelService.generateProjectExcel(rows, orgName, dateRange, generatedBy);
    }

    streamFile(reply, buffer, format, `project-report-${startDate}-to-${endDate}`);
  });
}
