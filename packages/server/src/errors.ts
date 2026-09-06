/** خطأ يحمل رمز حالة ورسالة عربية صالحة للعرض للمستخدم. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, code = "bad_request") =>
  new HttpError(400, message, code);

export const unauthorized = (
  message = "سجّل الدخول أولاً",
  code = "unauthorized",
) => new HttpError(401, message, code);

export const forbidden = (
  message = "لا تملك صلاحية لهذا الإجراء",
  code = "forbidden",
) => new HttpError(403, message, code);

export const notFound = (message = "غير موجود", code = "not_found") =>
  new HttpError(404, message, code);
