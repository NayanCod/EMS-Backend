import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { User } from '../../../../../models/User';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body as any;

    const user = await User.findOne({ email }).populate('organizationId');
    if (!user) {
      return reply.unauthorised();
    }

    const isValid = await bcrypt.compare(password, user.password!);
    if (!isValid) {
      return reply.unauthorised();
    }

    const token = fastify.jwt.sign({ 
      id: user._id, 
      role: user.role, 
      name: user.name, 
      organizationId: user.organizationId._id 
    });

    return reply.ok({
      message: 'Login successful',
      token,
      user: { id: user._id, name: user.name, role: user.role },
      organization: user.organizationId
    });
  });
}
