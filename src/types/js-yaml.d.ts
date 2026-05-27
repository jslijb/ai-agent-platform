declare module "js-yaml" {
  function load(input: string, options?: Record<string, unknown>): any;
  function safeLoad(input: string, options?: Record<string, unknown>): any;
  function dump(input: any, options?: Record<string, unknown>): string;
  function safeDump(input: any, options?: Record<string, unknown>): string;
  const YAMLException: any;
  export { load, safeLoad, dump, safeDump, YAMLException };
  export default { load, safeLoad, dump, safeDump, YAMLException };
}
