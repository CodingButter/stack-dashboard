/**
 * Side-effect module: importing it registers every service poller into the
 * registry. Client pollers are added here in Segment S3.2. Keeping the wiring
 * in one place means the worker's import list never changes.
 */
export {};
