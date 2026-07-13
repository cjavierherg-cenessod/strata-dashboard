export const DPI_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const DPI_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const DPI_UPLOAD_RETRY_ATTEMPTS = 3;

export type DpiAllowedMimeType = typeof DPI_ALLOWED_MIME_TYPES[number];

export type DpiValidationResult = {
  valid: boolean;
  message?: string;
  mimeType?: DpiAllowedMimeType;
};

const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

const isPng = (bytes: Uint8Array) => (
  bytes[0] === 0x89
  && bytes[1] === 0x50
  && bytes[2] === 0x4e
  && bytes[3] === 0x47
  && bytes[4] === 0x0d
  && bytes[5] === 0x0a
  && bytes[6] === 0x1a
  && bytes[7] === 0x0a
);

const isWebp = (bytes: Uint8Array) => (
  bytes[0] === 0x52
  && bytes[1] === 0x49
  && bytes[2] === 0x46
  && bytes[3] === 0x46
  && bytes[8] === 0x57
  && bytes[9] === 0x45
  && bytes[10] === 0x42
  && bytes[11] === 0x50
);

export const detectDpiMimeType = (bytes: Uint8Array): DpiAllowedMimeType | null => {
  if (bytes.length >= 3 && isJpeg(bytes)) return 'image/jpeg';
  if (bytes.length >= 8 && isPng(bytes)) return 'image/png';
  if (bytes.length >= 12 && isWebp(bytes)) return 'image/webp';
  return null;
};

export const validateDpiUploadBasics = (
  file: Pick<File, 'size' | 'type'>,
  detectedMimeType?: DpiAllowedMimeType | null
): DpiValidationResult => {
  if (file.size <= 0) {
    return { valid: false, message: 'La imagen del DPI esta vacia.' };
  }

  if (file.size > DPI_MAX_UPLOAD_BYTES) {
    return { valid: false, message: 'La imagen del DPI supera el limite de 10 MB.' };
  }

  const declaredMimeType = file.type.toLowerCase();
  if (!DPI_ALLOWED_MIME_TYPES.includes(declaredMimeType as DpiAllowedMimeType)) {
    return { valid: false, message: 'Solo se permiten imagenes JPEG, PNG o WebP para el DPI.' };
  }

  if (detectedMimeType === null) {
    return { valid: false, message: 'El archivo no parece ser una imagen JPEG, PNG o WebP valida.' };
  }

  if (detectedMimeType && declaredMimeType !== detectedMimeType) {
    return { valid: false, message: 'El tipo real del archivo no coincide con la extension o cabecera enviada.' };
  }

  return { valid: true, mimeType: declaredMimeType as DpiAllowedMimeType };
};

export const validateDpiFileSignature = async (file: File): Promise<DpiValidationResult> => {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detectedMimeType = detectDpiMimeType(head);
  return validateDpiUploadBasics(file, detectedMimeType);
};

export const isRetryableDpiUploadError = (error: unknown) => {
  const message = String((error as { message?: unknown })?.message || error || '').toLowerCase();
  return (
    message.includes('network')
    || message.includes('fetch')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('failed to fetch')
    || message.includes('temporarily')
    || message.includes('econnreset')
    || message.includes('503')
    || message.includes('504')
  );
};

export const retryDpiUpload = async <T>(
  operation: () => Promise<T>,
  wait: (delayMs: number) => Promise<void> = delay => new Promise(resolve => globalThis.setTimeout(resolve, delay)),
  attempts = DPI_UPLOAD_RETRY_ATTEMPTS
) => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableDpiUploadError(error)) break;
      await wait(450 * attempt);
    }
  }

  throw lastError;
};
