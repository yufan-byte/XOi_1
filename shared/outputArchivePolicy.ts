/** Binary uploads reuse the existing 128 MiB media boundary; old JSON clients retain 18 MiB. */
export const MAX_OUTPUT_ARCHIVE_BYTES = 128 * 1024 * 1024;
export const LEGACY_OUTPUT_JSON_BYTES = 18 * 1024 * 1024;
