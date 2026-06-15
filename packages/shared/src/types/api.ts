/** Body lỗi chuẩn từ global exception filter của API. */
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  errorCode: string;
  details?: unknown;
}

/**
 * Kết quả dạng discriminated union cho caller không muốn try/catch
 * (vd Server Components). Fetch wrapper FE cung cấp cả 2 kiểu:
 * throw `ApiError` hoặc trả `ApiResponse<T>`.
 */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiErrorBody };

/** Kết quả phân trang page-based. */
export interface Paginated<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/** Kết quả phân trang cursor-based (infinite scroll). */
export interface CursorPaginated<T> {
  items: T[];
  nextCursor: string | null;
}
