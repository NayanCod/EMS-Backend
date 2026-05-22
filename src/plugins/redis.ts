import fp from "fastify-plugin";
import redis, {
  FastifyRedisPluginOptions,
  type FastifyRedis,
} from "@fastify/redis";

export default fp<FastifyRedisPluginOptions>(
  async (fastify) => {
    fastify.register(redis, {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT ?? "6379"),
      // username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
      family: 4, // 4: ipv4, 6: ipv6
    });

    await fastify.after();

    console.log("Redis connected", typeof fastify.redis);

    fastify.cacheClient = fastify.redis;
  },
  { name: "cache" }
);

declare module "fastify" {
  export interface FastifyInstance {
    cacheClient: FastifyRedis;
  }
}
