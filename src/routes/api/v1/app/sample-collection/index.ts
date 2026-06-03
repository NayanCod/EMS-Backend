import { FastifyInstance, FastifyRequest } from 'fastify';
import { SampleCollection } from '../../../../../models/SampleCollection';
import { sendMail } from '../../../../../services/emailService';
import { getSampleCollectionOTPTemplate } from '../../../../../utils/emailTemplates';
import { User } from '../../../../../models/User';

export default async function sampleCollectionRoutes(fastify: FastifyInstance) {
  // Require authentication for all endpoints here
  fastify.addHook('preValidation', fastify.authenticate);

  // POST / - Start a new sample collection
  fastify.post('/', async (request, reply) => {
    const user = request.user as any;
    const { purpose, sampleType, clientEmail, latitude, longitude, address } = request.body as any;

    if (!purpose || !sampleType || !clientEmail || latitude === undefined || longitude === undefined) {
      return reply.badRequest('MISSING_FIELDS', 'Purpose, sample type, client email, latitude and longitude are required');
    }

    // Fetch employee name
    const employee = await User.findById(user.id).select('name').lean();
    const employeeName = employee?.name || 'Employee';

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const collection = new SampleCollection({
      userId: user.id,
      purpose,
      sampleType,
      clientEmail,
      otp,
      status: 'pending',
      startLocation: {
        latitude,
        longitude,
        address
      },
      startedAt: new Date()
    });

    await collection.save();

    // Trigger OTP Email
    const html = getSampleCollectionOTPTemplate(purpose, sampleType, otp, employeeName);
    await sendMail({
      to: clientEmail,
      subject: `Sample Collection OTP Code: ${otp}`,
      html
    });

    // Return the response without exposing the OTP directly to the client screen
    // (though in a demo app it is okay, but let's hide it from response if we want it secure. Actually, let's keep it hidden, the email is sent!)
    return reply.created({
      message: 'Sample collection initiated. OTP sent to customer email.',
      collection: {
        id: collection._id,
        purpose: collection.purpose,
        sampleType: collection.sampleType,
        clientEmail: collection.clientEmail,
        status: collection.status,
        startLocation: collection.startLocation,
        startedAt: collection.startedAt
      }
    });
  });

  // POST /:id/complete - Verify OTP and complete the collection
  fastify.post('/:id/complete', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as { id: string };
    const { otp, latitude, longitude, address } = request.body as any;
    console.log(request.body);


    if (!otp || latitude === undefined || longitude === undefined) {
      return reply.badRequest('MISSING_FIELDS', 'OTP, latitude, and longitude are required');
    }

    const collection = await SampleCollection.findOne({ _id: id, userId: user.id });

    if (!collection) {
      return reply.notFound('Sample collection not found');
    }

    if (collection.status === 'completed') {
      return reply.badRequest('ALREADY_COMPLETED', 'This sample collection is already completed');
    }

    // Verify OTP code
    if (collection.otp !== otp.trim()) {
      return reply.badRequest('INVALID_OTP', 'The verification OTP is incorrect');
    }

    // Mark as completed
    collection.status = 'completed';
    collection.endLocation = {
      latitude,
      longitude,
      address
    };
    collection.completedAt = new Date();

    await collection.save();

    return reply.ok({
      message: 'Sample collection verified and completed successfully',
      collection: {
        id: collection._id,
        purpose: collection.purpose,
        sampleType: collection.sampleType,
        clientEmail: collection.clientEmail,
        status: collection.status,
        startLocation: collection.startLocation,
        endLocation: collection.endLocation,
        startedAt: collection.startedAt,
        completedAt: collection.completedAt
      }
    });
  });

  // GET / - List all collections for current employee (paginated)
  fastify.get('/', async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>, reply) => {
    const user = request.user as any;
    const { page = '1', limit = '10' } = request.query;

    const query = { userId: user.id };
    const total = await SampleCollection.countDocuments(query);
    const collections = await SampleCollection.find(query)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    return reply.ok({
      collections: collections.map((c: any) => ({
        id: c._id,
        purpose: c.purpose,
        sampleType: c.sampleType,
        clientEmail: c.clientEmail,
        status: c.status,
        startLocation: c.startLocation,
        endLocation: c.endLocation,
        startedAt: c.startedAt,
        completedAt: c.completedAt
      })),
      total,
      page: Number(page),
      limit: Number(limit)
    });
  });
}
