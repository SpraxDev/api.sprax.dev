import type { FastifySchemaCompiler } from 'fastify';

/**
 * A validator compiler that performs no validation and passes the data through unchanged.
 *
 * Used on the legacy `/mc/v1/` routes: their input schemas exist purely to document the
 * parameters in the OpenAPI spec, while the route handlers keep full control over
 * validation and the (backwards compatible) error responses.
 *
 * Recommendation: Explicitly weaken the response parameter's type, so the request schema is not inferred into it (`(request: FastifyRequest, reply) => {}`)
 */
const noopValidatorCompiler: FastifySchemaCompiler<unknown> = () => (data) => ({ value: data });
export default noopValidatorCompiler;
