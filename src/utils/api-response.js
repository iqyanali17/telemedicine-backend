export class ApiResponse {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Response message
   * @param {any} [data=null] - Payload
   * @param {object} [meta=null] - Pagination or metadata
   */
  constructor(statusCode, message, data = null, meta = null) {
    this.success = statusCode >= 200 && statusCode < 300;
    this.statusCode = statusCode;
    this.message = message;
    if (data !== null) {
      this.data = data;
    }
    if (meta !== null) {
      this.meta = meta;
    }
  }

  static ok(res, message = 'Success', data = null, meta = null) {
    const response = new ApiResponse(200, message, data, meta);
    return res.status(200).json(response);
  }

  static created(res, message = 'Resource created successfully', data = null, meta = null) {
    const response = new ApiResponse(201, message, data, meta);
    return res.status(201).json(response);
  }

  static paginated(res, message, { summary = {}, items = [] }, pagination = {}) {
    const totalItems = pagination.total ?? pagination.totalItems ?? items.length;
    const page = Number(pagination.page) || 1;
    const limit = Number(pagination.limit) || 10;
    const totalPages = pagination.totalPages ?? Math.max(1, Math.ceil(totalItems / limit));

    const meta = {
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    const response = new ApiResponse(200, message, { summary, items }, meta);
    return res.status(200).json(response);
  }

  static noContent(res) {
    return res.status(204).send();
  }
}
