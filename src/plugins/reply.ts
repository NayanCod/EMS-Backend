import fp from "fastify-plugin";

export default fp(async (fastify, _opts) => {
    try {
        fastify.decorateReply('forbidden', function (code: string, message: string, tracking_id = undefined) {
            // Set the HTTP status code to 403 (Forbidden)
            this.status(403).send({ success: false, code, message, tracking_id: tracking_id ?? null });
        });

        fastify.decorateReply('badRequest', function (code: string, message: string, tracking_id = undefined) {
            // Set the HTTP status code to 400 (Bad Request)
            this.status(400).send({ success: false, code, message, tracking_id: tracking_id ?? null });
        });

        fastify.decorateReply('unknown', function (tracking_id = undefined) {
            // Set the HTTP status code to 400 (Unknown Error)
            this.status(400).send({ success: false, code: "UNKNOWN_ERROR", message: "Unknown Error Occured.", tracking_id: tracking_id ?? null });
        });

        fastify.decorateReply('unauthorised', function (tracking_id = undefined) {
            // Set the HTTP status code to 401 (Unauthorised)
            this.status(401).send({ success: false, code: "UNAUTHORISED", message: "Please try refreshing the page.", tracking_id: tracking_id ?? null });
        });

        fastify.decorateReply('ok', function (response: any) {
            // Set the HTTP status code to 200 (Ok)
            this.status(200).send({ success: true, data: response });
        });

        fastify.decorateReply('created', function (response: any) {
            // Set the HTTP status code to 201 (Created)
            this.status(201).send({ success: true, data: response });
        });

        fastify.decorateReply('notFound', function (msg = undefined) {
            // Set the HTTP status code to 204 (No Content)
            this.status(404).send({ success: false, code: "NOT_FOUND", message: msg ?? "Resource not found." });
        });

    } catch (err) {
        console.error("Error configuring reply decorators:", err);
    }
});

declare module "fastify" {
    export interface FastifyReply {
        forbidden: (code: string, message: string, tracking_id?: string) => void;
        badRequest: (code: string, message: string, tracking_id?: string) => void;
        unknown: (tracking_id?: string) => void;
        unauthorised: (tracking_id?: string) => void;
        ok: (response: any, tracking_id?: string) => void;
        created: (response: any, tracking_id?: string) => void;
        notFound: (msg?: string, tracking_id?: string) => void;
    }
}
