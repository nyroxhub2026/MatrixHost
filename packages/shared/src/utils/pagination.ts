export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function paginateArray<T>(
  items: T[],
  page = 1,
  limit = 20
): PaginationResult<T> {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error("Page must be a positive integer");
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Limit must be between 1 and 100");
  }

  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;

  return {
    items: items.slice(start, start + limit),
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1
  };
}
