declare module "neo4j-driver" {
  namespace neo4j {
    interface Driver {
      session(config?: Record<string, unknown>): Session;
      close(): void;
      verifyConnectivity(): Promise<void>;
    }
    interface Session {
      run(query: string, params?: Record<string, unknown>): Promise<Result>;
      beginTransaction(): Transaction;
      close(): Promise<void>;
    }
    interface Transaction {
      run(query: string, params?: Record<string, unknown>): Promise<Result>;
      commit(): Promise<void>;
      rollback(): Promise<void>;
    }
    interface Result {
      records: ResultRecord[];
      summary: Record<string, unknown>;
    }
    interface ResultRecord {
      keys: string[];
      values: unknown[];
      get(key: string): { toNumber(): number } & unknown;
    }
    const auth: {
      basic(username: string, password: string): AuthToken;
    };
    function driver(uri: string, authToken: AuthToken, config?: Record<string, unknown>): Driver;
  }
  type AuthToken = unknown;
  export default neo4j;
}
