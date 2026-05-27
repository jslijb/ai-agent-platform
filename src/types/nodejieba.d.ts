declare module "nodejieba" {
  export function cut(text: string): string[];
  export function cutAll(text: string): string[];
  export function cutForSearch(text: string): string[];
  export function tag(text: string): Array<[string, string]>;
  export function extract(text: string, topN: number): Array<{ keyword: string; weight: number }>;
  export function insertWord(word: string): void;
  export function load(dict?: string): void;
}
