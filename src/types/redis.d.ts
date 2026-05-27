declare module "redis" {
  function createClient(options?: Record<string, unknown>): any;
  export { createClient };
}
