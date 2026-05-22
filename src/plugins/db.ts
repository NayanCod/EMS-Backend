import mongoose, { Mongoose } from "mongoose";
import fp from "fastify-plugin";

export default fp(async (fastify, _opts) => {
  try {
    // console.log("MongoDB connecting", process.env.DATABASE_URL);
    console.log("MongoDB connecting");
    const mongoClient = await mongoose.connect(process.env.DATABASE_URL!);
    console.log("MongoDB connected");

    fastify.dbClient = mongoClient;

    console.log("MongoDB connected");
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
  }

  // Register models using fastify-autoload
  // fastify.register(autoload, {
  //   dir: `${__dirname}/../models`,
  // });

  // Close the MongoDB connection when Fastify shuts down
  fastify.addHook("onClose", async () => {
    await mongoose.disconnect();
    console.log("MongoDB Disconnected");
  });
});

declare module "fastify" {
  export interface FastifyInstance {
    dbClient: Mongoose;
  }
}
