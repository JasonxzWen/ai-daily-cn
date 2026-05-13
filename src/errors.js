export class PublisherError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PublisherError";
    this.code = code;
    this.details = details;
  }
}

export function toPublishError(error) {
  if (error instanceof PublisherError) {
    return `${error.code}: ${error.message}`;
  }

  return `unexpected_error: ${error.message || String(error)}`;
}
