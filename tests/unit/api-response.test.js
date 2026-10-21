import { describe, it, expect, vi } from 'vitest';
import { ApiResponse } from '../../src/utils/api-response.js';

describe('ApiResponse Utility', () => {
  it('should format 200 OK response with metadata', () => {
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const res = { status: statusMock };

    ApiResponse.ok(res, 'Fetched successfully', { items: [1, 2, 3] }, { page: 1, limit: 10 });

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith({
      success: true,
      statusCode: 200,
      message: 'Fetched successfully',
      data: { items: [1, 2, 3] },
      meta: { page: 1, limit: 10 },
    });
  });

  it('should format 201 Created response', () => {
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const res = { status: statusMock };

    ApiResponse.created(res, 'Created successfully', { id: 'new-id' });

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(jsonMock).toHaveBeenCalledWith({
      success: true,
      statusCode: 201,
      message: 'Created successfully',
      data: { id: 'new-id' },
    });
  });

  it('should format paginated response with summary, items, and meta.pagination', () => {
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const res = { status: statusMock };

    const summary = { total: 20, verified: 15, unverified: 5 };
    const items = [{ id: 'doctor-1', name: 'Dr. Test' }];
    const pagination = { page: 1, limit: 10, total: 20 };

    ApiResponse.paginated(res, 'Doctors retrieved successfully', { summary, items }, pagination);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith({
      success: true,
      statusCode: 200,
      message: 'Doctors retrieved successfully',
      data: {
        summary: { total: 20, verified: 15, unverified: 5 },
        items: [{ id: 'doctor-1', name: 'Dr. Test' }],
      },
      meta: {
        pagination: {
          page: 1,
          limit: 10,
          totalItems: 20,
          totalPages: 2,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      },
    });
  });
});
