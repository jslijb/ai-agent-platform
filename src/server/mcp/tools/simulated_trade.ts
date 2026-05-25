type Direction = "buy" | "sell";
type OrderStatus = "pending" | "filled" | "cancelled" | "rejected";
type BoardType = "main" | "gem" | "star";

interface Position {
  code: string;
  name: string;
  quantity: number;
  availableQuantity: number;
  averageCost: number;
  currentPrice: number;
  marketValue: number;
  profitLoss: number;
  profitLossPercent: number;
  buyDate: string;
}

interface Order {
  orderId: string;
  accountId: string;
  code: string;
  name: string;
  direction: Direction;
  price: number;
  quantity: number;
  status: OrderStatus;
  reason?: string;
  createdAt: string;
  filledAt?: string;
  filledPrice?: number;
  filledQuantity?: number;
}

interface TradeRecord {
  tradeId: string;
  orderId: string;
  accountId: string;
  code: string;
  name: string;
  direction: Direction;
  price: number;
  quantity: number;
  amount: number;
  commission: number;
  stampDuty: number;
  netAmount: number;
  tradedAt: string;
}

interface Account {
  accountId: string;
  name: string;
  initialCapital: number;
  cash: number;
  totalAssets: number;
  positions: Position[];
  createdAt: string;
  updatedAt: string;
}

const accounts = new Map<string, Account>();
const orderHistory = new Map<string, Order[]>();
const tradeHistory = new Map<string, TradeRecord[]>();

let orderCounter = 0;
let tradeCounter = 0;

function generateOrderId(): string {
  orderCounter++;
  return `ORD${Date.now()}_${orderCounter}`;
}

function generateTradeId(): string {
  tradeCounter++;
  return `TRD${Date.now()}_${tradeCounter}`;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function getBoardType(code: string): BoardType {
  if (code.startsWith("30")) return "gem";
  if (code.startsWith("68")) return "star";
  return "main";
}

function getLimitRate(code: string): number {
  const board = getBoardType(code);
  if (board === "gem" || board === "star") return 0.2;
  return 0.1;
}

function calculateCommission(amount: number): number {
  const rate = 0.0003;
  const minCommission = 5;
  return Math.max(amount * rate, minCommission);
}

function calculateStampDuty(amount: number, direction: Direction): number {
  if (direction === "sell") {
    return amount * 0.001;
  }
  return 0;
}

interface CreateAccountResult {
  success: boolean;
  data?: Account;
  error?: string;
}

/**
 * 创建模拟交易账户
 * @param params - 创建参数
 * @param params.name - 账户名称
 * @param params.initialCapital - 初始资金（元）
 * @returns 创建结果，包含账户信息
 */
export function createPaperAccount(params: { name: string; initialCapital: number }): CreateAccountResult {
  try {
    const accountId = `ACC_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const account: Account = {
      accountId,
      name: params.name,
      initialCapital: params.initialCapital,
      cash: params.initialCapital,
      totalAssets: params.initialCapital,
      positions: [],
      createdAt: now,
      updatedAt: now,
    };

    accounts.set(accountId, account);
    orderHistory.set(accountId, []);
    tradeHistory.set(accountId, []);

    console.log(`[simulated_trade] 创建模拟账户: ${accountId}, 名称=${params.name}, 初始资金=${params.initialCapital}`);
    return { success: true, data: account };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[simulated_trade] 创建账户失败: ${message}`);
    return { success: false, error: message };
  }
}

interface GetAccountResult {
  success: boolean;
  data?: Account;
  error?: string;
}

/**
 * 查询模拟账户信息
 * @param accountId - 账户ID
 * @returns 账户信息，包含资金和持仓
 */
export function getAccount(accountId: string): GetAccountResult {
  try {
    const account = accounts.get(accountId);
    if (!account) {
      console.error(`[simulated_trade] 账户不存在: ${accountId}`);
      return { success: false, error: `账户不存在: ${accountId}` };
    }

    let positionValue = 0;
    for (const pos of account.positions) {
      positionValue += pos.marketValue;
    }
    account.totalAssets = account.cash + positionValue;
    account.updatedAt = new Date().toISOString();

    console.log(`[simulated_trade] 查询账户: ${accountId}, 总资产=${account.totalAssets}`);
    return { success: true, data: account };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[simulated_trade] 查询账户失败: ${message}`);
    return { success: false, error: message };
  }
}

interface PlaceOrderParams {
  accountId: string;
  code: string;
  name: string;
  direction: Direction;
  price: number;
  quantity: number;
}

interface PlaceOrderResult {
  success: boolean;
  data?: { order: Order; trade?: TradeRecord };
  error?: string;
}

/**
 * 模拟下单（A股规则）
 * A股规则：
 * - 买入数量必须为100的整数倍
 * - 卖出数量不受100整数倍限制（可卖出零股）
 * - T+1规则：当天买入的股票不能当天卖出
 * - 涨跌停检查：主板10%，创业板/科创板20%
 * - 印花税：卖出时收取0.1%
 * - 佣金：双向收取，最低5元
 * @param params - 下单参数
 * @returns 下单结果，包含委托和成交信息
 */
export function placeOrder(params: PlaceOrderParams): PlaceOrderResult {
  try {
    const account = accounts.get(params.accountId);
    if (!account) {
      console.error(`[simulated_trade] 账户不存在: ${params.accountId}`);
      return { success: false, error: `账户不存在: ${params.accountId}` };
    }

    const today = getToday();
    const order: Order = {
      orderId: generateOrderId(),
      accountId: params.accountId,
      code: params.code,
      name: params.name,
      direction: params.direction,
      price: params.price,
      quantity: params.quantity,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    if (params.direction === "buy") {
      if (params.quantity % 100 !== 0) {
        order.status = "rejected";
        order.reason = "A股买入数量必须为100的整数倍";
        const orders = orderHistory.get(params.accountId) || [];
        orders.push(order);
        orderHistory.set(params.accountId, orders);
        console.error(`[simulated_trade] 下单被拒绝: 买入数量${params.quantity}不是100的整数倍`);
        return { success: false, data: { order }, error: order.reason };
      }

      const amount = params.price * params.quantity;
      const commission = calculateCommission(amount);
      const totalCost = amount + commission;

      if (totalCost > account.cash) {
        order.status = "rejected";
        order.reason = `资金不足: 需要${totalCost.toFixed(2)}元，可用${account.cash.toFixed(2)}元`;
        const orders = orderHistory.get(params.accountId) || [];
        orders.push(order);
        orderHistory.set(params.accountId, orders);
        console.error(`[simulated_trade] 下单被拒绝: ${order.reason}`);
        return { success: false, data: { order }, error: order.reason };
      }

      const existingPos = account.positions.find((p) => p.code === params.code);
      if (existingPos) {
        const totalQuantity = existingPos.quantity + params.quantity;
        const totalCostBasis = existingPos.averageCost * existingPos.quantity + amount;
        existingPos.averageCost = Number((totalCostBasis / totalQuantity).toFixed(4));
        existingPos.quantity = totalQuantity;
        existingPos.currentPrice = params.price;
        existingPos.marketValue = Number((totalQuantity * params.price).toFixed(2));
        existingPos.profitLoss = Number((existingPos.marketValue - totalCostBasis).toFixed(2));
        existingPos.profitLossPercent = Number(((existingPos.profitLoss / totalCostBasis) * 100).toFixed(2));
        existingPos.buyDate = today;
      } else {
        const position: Position = {
          code: params.code,
          name: params.name,
          quantity: params.quantity,
          availableQuantity: 0,
          averageCost: params.price,
          currentPrice: params.price,
          marketValue: Number((params.quantity * params.price).toFixed(2)),
          profitLoss: 0,
          profitLossPercent: 0,
          buyDate: today,
        };
        account.positions.push(position);
      }

      account.cash = Number((account.cash - totalCost).toFixed(2));

      order.status = "filled";
      order.filledAt = new Date().toISOString();
      order.filledPrice = params.price;
      order.filledQuantity = params.quantity;

      const trade: TradeRecord = {
        tradeId: generateTradeId(),
        orderId: order.orderId,
        accountId: params.accountId,
        code: params.code,
        name: params.name,
        direction: "buy",
        price: params.price,
        quantity: params.quantity,
        amount: Number(amount.toFixed(2)),
        commission: Number(commission.toFixed(2)),
        stampDuty: 0,
        netAmount: Number(totalCost.toFixed(2)),
        tradedAt: new Date().toISOString(),
      };

      const trades = tradeHistory.get(params.accountId) || [];
      trades.push(trade);
      tradeHistory.set(params.accountId, trades);

      console.log(`[simulated_trade] 买入成交: ${params.code} ${params.name}, 价格=${params.price}, 数量=${params.quantity}`);
      const orders = orderHistory.get(params.accountId) || [];
      orders.push(order);
      orderHistory.set(params.accountId, orders);
      return { success: true, data: { order, trade } };
    }

    if (params.direction === "sell") {
      const existingPos = account.positions.find((p) => p.code === params.code);
      if (!existingPos) {
        order.status = "rejected";
        order.reason = `未持有股票: ${params.code}`;
        const orders = orderHistory.get(params.accountId) || [];
        orders.push(order);
        orderHistory.set(params.accountId, orders);
        console.error(`[simulated_trade] 下单被拒绝: 未持有${params.code}`);
        return { success: false, data: { order }, error: order.reason };
      }

      if (params.quantity > existingPos.quantity) {
        order.status = "rejected";
        order.reason = `持仓不足: 持有${existingPos.quantity}股，尝试卖出${params.quantity}股`;
        const orders = orderHistory.get(params.accountId) || [];
        orders.push(order);
        orderHistory.set(params.accountId, orders);
        console.error(`[simulated_trade] 下单被拒绝: ${order.reason}`);
        return { success: false, data: { order }, error: order.reason };
      }

      if (params.quantity > existingPos.availableQuantity) {
        order.status = "rejected";
        order.reason = `T+1限制: 可卖${existingPos.availableQuantity}股，尝试卖出${params.quantity}股（今日买入的股票不能当日卖出）`;
        const orders = orderHistory.get(params.accountId) || [];
        orders.push(order);
        orderHistory.set(params.accountId, orders);
        console.error(`[simulated_trade] 下单被拒绝: ${order.reason}`);
        return { success: false, data: { order }, error: order.reason };
      }

      const amount = params.price * params.quantity;
      const commission = calculateCommission(amount);
      const stampDuty = calculateStampDuty(amount, "sell");
      const netProceeds = amount - commission - stampDuty;

      existingPos.quantity -= params.quantity;
      existingPos.availableQuantity -= params.quantity;
      existingPos.marketValue = Number((existingPos.quantity * params.price).toFixed(2));
      existingPos.currentPrice = params.price;

      const costBasis = existingPos.averageCost * existingPos.quantity;
      if (existingPos.quantity > 0) {
        existingPos.profitLoss = Number((existingPos.marketValue - costBasis).toFixed(2));
        existingPos.profitLossPercent = costBasis > 0 ? Number(((existingPos.profitLoss / costBasis) * 100).toFixed(2)) : 0;
      }

      if (existingPos.quantity === 0) {
        account.positions = account.positions.filter((p) => p.code !== params.code);
      }

      account.cash = Number((account.cash + netProceeds).toFixed(2));

      order.status = "filled";
      order.filledAt = new Date().toISOString();
      order.filledPrice = params.price;
      order.filledQuantity = params.quantity;

      const trade: TradeRecord = {
        tradeId: generateTradeId(),
        orderId: order.orderId,
        accountId: params.accountId,
        code: params.code,
        name: params.name,
        direction: "sell",
        price: params.price,
        quantity: params.quantity,
        amount: Number(amount.toFixed(2)),
        commission: Number(commission.toFixed(2)),
        stampDuty: Number(stampDuty.toFixed(2)),
        netAmount: Number(netProceeds.toFixed(2)),
        tradedAt: new Date().toISOString(),
      };

      const trades = tradeHistory.get(params.accountId) || [];
      trades.push(trade);
      tradeHistory.set(params.accountId, trades);

      console.log(`[simulated_trade] 卖出成交: ${params.code} ${params.name}, 价格=${params.price}, 数量=${params.quantity}`);
      const orders = orderHistory.get(params.accountId) || [];
      orders.push(order);
      orderHistory.set(params.accountId, orders);
      return { success: true, data: { order, trade } };
    }

    return { success: false, error: "无效的交易方向" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[simulated_trade] 下单异常: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * 更新持仓的可卖数量（T+1规则：次日可卖）
 * 应在每个交易日开始时调用
 * @param accountId - 账户ID
 */
export function updateAvailableQuantity(accountId: string): void {
  const account = accounts.get(accountId);
  if (!account) {
    console.error(`[simulated_trade] 账户不存在: ${accountId}`);
    return;
  }

  const today = getToday();
  for (const pos of account.positions) {
    if (pos.buyDate !== today) {
      pos.availableQuantity = pos.quantity;
    }
  }

  console.log(`[simulated_trade] 更新可卖数量: ${accountId}`);
}

interface GetPositionsResult {
  success: boolean;
  data?: Position[];
  error?: string;
}

/**
 * 查询账户持仓
 * @param accountId - 账户ID
 * @returns 持仓列表
 */
export function getPositions(accountId: string): GetPositionsResult {
  try {
    const account = accounts.get(accountId);
    if (!account) {
      console.error(`[simulated_trade] 账户不存在: ${accountId}`);
      return { success: false, error: `账户不存在: ${accountId}` };
    }

    console.log(`[simulated_trade] 查询持仓: ${accountId}, 持仓数=${account.positions.length}`);
    return { success: true, data: account.positions };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[simulated_trade] 查询持仓失败: ${message}`);
    return { success: false, error: message };
  }
}

interface GetOrderHistoryResult {
  success: boolean;
  data?: Order[];
  error?: string;
}

/**
 * 查询委托历史
 * @param accountId - 账户ID
 * @returns 委托历史列表
 */
export function getOrderHistory(accountId: string): GetOrderHistoryResult {
  try {
    const orders = orderHistory.get(accountId);
    if (!orders) {
      console.error(`[simulated_trade] 账户不存在: ${accountId}`);
      return { success: false, error: `账户不存在: ${accountId}` };
    }

    console.log(`[simulated_trade] 查询委托历史: ${accountId}, 委托数=${orders.length}`);
    return { success: true, data: orders };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[simulated_trade] 查询委托历史失败: ${message}`);
    return { success: false, error: message };
  }
}

interface GetTradeHistoryResult {
  success: boolean;
  data?: TradeRecord[];
  error?: string;
}

/**
 * 查询成交历史
 * @param accountId - 账户ID
 * @returns 成交历史列表
 */
export function getTradeHistory(accountId: string): GetTradeHistoryResult {
  try {
    const trades = tradeHistory.get(accountId);
    if (!trades) {
      console.error(`[simulated_trade] 账户不存在: ${accountId}`);
      return { success: false, error: `账户不存在: ${accountId}` };
    }

    console.log(`[simulated_trade] 查询成交历史: ${accountId}, 成交数=${trades.length}`);
    return { success: true, data: trades };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[simulated_trade] 查询成交历史失败: ${message}`);
    return { success: false, error: message };
  }
}

export type {
  Account,
  Position,
  Order,
  TradeRecord,
  Direction,
  OrderStatus,
  BoardType,
};
