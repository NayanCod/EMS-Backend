import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { User } from '../../../../../models/User';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const reqUser = request.user as any;
    const user = await User.findById(reqUser.id).select('-password').lean();
    if (!user) {
      return reply.notFound('User not found');
    }
    return reply.ok({ user });
  });

  fastify.put('/', async (request, reply) => {
    const reqUser = request.user as any;
    const { name, email, phoneNumber, password } = request.body as any;
    
    const user = await User.findById(reqUser.id);
    if (!user) {
      return reply.notFound('User not found');
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();
    return reply.ok({ message: 'Profile updated successfully', user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role
    }});
  });
}
