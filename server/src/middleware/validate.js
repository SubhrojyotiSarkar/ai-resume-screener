/**
 * Validate request parts with zod schemas. Parsed values (with coercions and
 * defaults applied) are stored on `req.valid.{params,query,body}`, because
 * Express 5 does not allow reassigning `req.query`.
 * Zod errors are turned into 400 responses by the central error handler.
 */
export function validate({ params, query, body }) {
  return (req, res, next) => {
    req.valid = {
      params: params ? params.parse(req.params) : req.params,
      query: query ? query.parse(req.query) : req.query,
      body: body ? body.parse(req.body ?? {}) : req.body,
    };
    next();
  };
}
