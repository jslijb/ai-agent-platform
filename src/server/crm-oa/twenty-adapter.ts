export interface TwentyConfig {
  baseUrl: string;
  apiKey: string;
}

export interface TwentyCustomerParams {
  name: string;
  domainName?: string;
  employees?: number;
  linkedinUrl?: string;
  xUrl?: string;
  annualRecurringRevenue?: number;
}

export interface TwentyOpportunityParams {
  name: string;
  companyId: string;
  amount?: number;
  closeDate?: string;
  stage?: string;
  probability?: number;
}

export interface TwentySearchParams {
  query: string;
  limit?: number;
  filter?: Record<string, unknown>;
}

export class TwentyAdapter {
  private config: TwentyConfig;

  constructor(config: TwentyConfig) {
    this.config = config;
  }

  private get graphqlUrl(): string {
    return `${this.config.baseUrl}/graphql`;
  }

  private get restUrl(): string {
    return `${this.config.baseUrl}/rest`;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  async graphql(query: string, variables?: Record<string, unknown>): Promise<unknown> {
    const resp = await fetch(this.graphqlUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ query, variables }),
    });

    const data = await resp.json();
    if (data.errors) {
      throw new Error(`Twenty GraphQL error: ${data.errors.map((e: { message: string }) => e.message).join(", ")}`);
    }
    return data.data;
  }

  async createCustomer(params: TwentyCustomerParams): Promise<Record<string, unknown>> {
    const query = `
      mutation CreateCompany($input: CreateCompanyInput!) {
        createCompany(input: $input) {
          id
          name
          domainName
          createdAt
        }
      }
    `;
    const result = await this.graphql(query, {
      input: {
        name: params.name,
        domainName: params.domainName,
        employees: params.employees,
        linkedinUrl: params.linkedinUrl,
        xUrl: params.xUrl,
        annualRecurringRevenue: params.annualRecurringRevenue,
      },
    });
    return (result as Record<string, unknown>).createCompany as Record<string, unknown>;
  }

  async searchCustomer(params: TwentySearchParams): Promise<Record<string, unknown>[]> {
    const query = `
      query GetCompanies($filter: CompanyFilter, $orderBy: [CompanyOrderBy], $limit: Int) {
        companies(filter: $filter, orderBy: $orderBy, first: $limit) {
          edges {
            node {
              id
              name
              domainName
              employees
              createdAt
            }
          }
        }
      }
    `;
    const result = await this.graphql(query, {
      filter: params.filter || { name: { ilike: `%${params.query}%` } },
      limit: params.limit || 10,
    });
    const companies = (result as Record<string, unknown>).companies as { edges: Array<{ node: Record<string, unknown> }> };
    return companies?.edges?.map((e) => e.node) || [];
  }

  async updateOpportunity(opportunityId: string, stage: string): Promise<Record<string, unknown>> {
    const query = `
      mutation UpdateOpportunity($id: ID!, $input: UpdateOpportunityInput!) {
        updateOpportunity(id: $id, input: $input) {
          id
          name
          stage
          amount
          closeDate
        }
      }
    `;
    const result = await this.graphql(query, {
      id: opportunityId,
      input: { stage },
    });
    return (result as Record<string, unknown>).updateOpportunity as Record<string, unknown>;
  }

  async createOpportunity(params: TwentyOpportunityParams): Promise<Record<string, unknown>> {
    const query = `
      mutation CreateOpportunity($input: CreateOpportunityInput!) {
        createOpportunity(input: $input) {
          id
          name
          stage
          amount
          closeDate
        }
      }
    `;
    const result = await this.graphql(query, {
      input: {
        name: params.name,
        companyId: params.companyId,
        amount: params.amount,
        closeDate: params.closeDate,
        stage: params.stage || "Prospecting",
        probability: params.probability,
      },
    });
    return (result as Record<string, unknown>).createOpportunity as Record<string, unknown>;
  }

  async generateReport(type: string, filters?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const query = `
      query GetReportData($type: String!, $filters: ReportFilter) {
        reportData(type: $type, filters: $filters) {
          data
          summary
        }
      }
    `;
    const result = await this.graphql(query, { type, filters });
    return (result as Record<string, unknown>).reportData as Record<string, unknown>;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.config.baseUrl}/health`);
      return resp.ok;
    } catch {
      return false;
    }
  }
}

export function createTwentyAdapter(config?: Partial<TwentyConfig>): TwentyAdapter {
  return new TwentyAdapter({
    baseUrl: config?.baseUrl || process.env.TWENTY_URL || "http://twenty:3000",
    apiKey: config?.apiKey || process.env.TWENTY_API_KEY || "",
  });
}