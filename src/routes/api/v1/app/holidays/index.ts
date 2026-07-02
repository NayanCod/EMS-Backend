import { FastifyInstance } from 'fastify';
import { Holiday } from '../../../../../models/Holiday';

export default async function holidayRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', fastify.authenticate);

  // GET /api/v1/app/holidays - List holidays (Org-scoped, both roles)
  fastify.get('/', async (request, reply) => {
    const user = request.user as any;
    
    // Sort by date ascending
    const holidays = await Holiday.find({ organizationId: user.organizationId })
      .sort({ date: 1 })
      .lean();

    return reply.ok({ holidays });
  });

  // POST /api/v1/app/holidays - Create holiday (Admin only)
  fastify.post('/', async (request, reply) => {
    const user = request.user as any;
    const { name, date, recurring } = request.body as any;

    if (user.role !== 'ADMIN') {
      return reply.forbidden('403', 'Only admins can create holidays');
    }

    if (!name || !date) {
      return reply.badRequest('MISSING_FIELDS', 'Holiday name and date are required');
    }

    const existing = await Holiday.findOne({
      organizationId: user.organizationId,
      date,
    });

    if (existing) {
      return reply.badRequest('DUPLICATE_HOLIDAY', 'A holiday already exists on this date');
    }

    const holiday = new Holiday({
      organizationId: user.organizationId,
      name,
      date,
      recurring: !!recurring,
    });

    await holiday.save();

    return reply.created({ message: 'Holiday created successfully', holiday });
  });

  // PATCH /api/v1/app/holidays/:id - Edit holiday (Admin only)
  fastify.patch('/:id', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;
    const { name, date, recurring } = request.body as any;

    if (user.role !== 'ADMIN') {
      return reply.forbidden('403', 'Only admins can edit holidays');
    }

    const holiday = await Holiday.findOne({ _id: id, organizationId: user.organizationId });
    if (!holiday) {
      return reply.notFound('Holiday not found');
    }

    if (name !== undefined) holiday.name = name;
    if (recurring !== undefined) holiday.recurring = recurring;
    
    if (date !== undefined && date !== holiday.date) {
      const existing = await Holiday.findOne({
        organizationId: user.organizationId,
        date,
        _id: { $ne: id }
      });
      if (existing) {
        return reply.badRequest('DUPLICATE_HOLIDAY', 'A holiday already exists on this date');
      }
      holiday.date = date;
    }

    await holiday.save();

    return reply.ok({ message: 'Holiday updated successfully', holiday });
  });

  // DELETE /api/v1/app/holidays/:id - Delete holiday (Admin only)
  fastify.delete('/:id', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as any;

    if (user.role !== 'ADMIN') {
      return reply.forbidden('403', 'Only admins can delete holidays');
    }

    const holiday = await Holiday.findOneAndDelete({ _id: id, organizationId: user.organizationId });
    if (!holiday) {
      return reply.notFound('Holiday not found');
    }

    return reply.ok({ message: 'Holiday deleted successfully' });
  });
}
