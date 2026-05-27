declare module "pgvector" {
  export function toSql(vector: number[]): string;
  export function fromSql(sql: string): number[];
}
