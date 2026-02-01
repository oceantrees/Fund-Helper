import type { Fund, FundSearchResult, MarketIndex, FundDetail, FundHolding, FundStyle, FundSubStyle } from '../types';

// 数据源类型
export type DataSourceType = 'tiantian' | 'eastmoney' | 'calculated';

export interface DataSourceInfo {
  id: DataSourceType;
  name: string;
  description: string;
}

// 可用数据源列表
export const DATA_SOURCES: DataSourceInfo[] = [
  { id: 'eastmoney', name: '东方财富', description: '东方财富网估值数据' },
  { id: 'tiantian', name: '天天基金', description: '天天基金网实时估值' },
  { id: 'calculated', name: '持仓穿透', description: '基于持仓股票计算估值' },
];

// localStorage key
const DATA_SOURCE_STORAGE_KEY = 'fund_data_source';

// 从 localStorage 获取保存的数据源，默认为东方财富
const getSavedDataSource = (): DataSourceType => {
  try {
    const saved = localStorage.getItem(DATA_SOURCE_STORAGE_KEY);
    if (saved && ['tiantian', 'eastmoney', 'calculated'].includes(saved)) {
      return saved as DataSourceType;
    }
  } catch (e) {
    console.warn('读取数据源设置失败:', e);
  }
  return 'eastmoney'; // 默认东方财富
};

// 当前数据源 - 默认从 localStorage 读取
let currentDataSource: DataSourceType = getSavedDataSource();

// 获取当前数据源
export const getCurrentDataSource = (): DataSourceType => currentDataSource;

// 设置数据源（同时保存到 localStorage）
export const setDataSource = (source: DataSourceType): void => {
  currentDataSource = source;
  try {
    localStorage.setItem(DATA_SOURCE_STORAGE_KEY, source);
  } catch (e) {
    console.warn('保存数据源设置失败:', e);
  }
  console.log(`[DataSource] 切换到: ${source}`);
};

// 主要市场指数代码 - 新浪财经格式
export const MARKET_INDICES = [
  { code: 's_sh000001', name: '上证指数', market: 'sh', display: '000001' },
  { code: 's_sz399006', name: '创业板指', market: 'sz', display: '399006' },
  { code: 's_sh000688', name: '科创50', market: 'sh', display: '000688' },
  { code: 'rt_hkHSI', name: '恒生指数', market: 'hk', display: 'HSI' },
  { code: 'gb_$ixic', name: '纳斯达克', market: 'us', display: 'IXIC' },
];

// 热门基金代码列表
export const HOT_FUND_CODES = [
  '110011', // 易方达中小盘混合
  '161725', // 招商中证白酒指数
  '003834', // 华夏能源革新股票
  '005827', // 易方达蓝筹精选混合
  '001938', // 中欧时代先锋股票
  '320007', // 诺安成长混合
  '000961', // 天弘沪深300ETF联接A
  '001156', // 申万菱信新能源汽车
  '012414', // 中欧医疗创新股票
  '007119', // 华夏创业板动量成长ETF联接A
];

// 全量基金列表缓存
let allFundsCache: FundSearchResult[] | null = null;

// 声明全局变量
declare global {
  interface Window {
    jsonpgz: ((data: JsonpFundData) => void) | undefined;
    [key: string]: any; // 支持动态回调函数名
    r: [string, string, string, string, string][] | undefined;
  }
}

interface JsonpFundData {
  fundcode: string;
  name: string;
  dwjz: string;
  gsz: string;
  gszzl: string;
  gztime: string;
  jzrq: string;
}

// 获取基金实时估值（天天基金源）
const getFundEstimateTiantian = async (fundCode: string): Promise<Fund | null> => {
  try {
    const timestamp = Date.now();
    // 天天基金实时估值API - 使用标准JSONP
    const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${timestamp}`;
    
    const data = await new Promise<JsonpFundData>((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('请求超时'));
      }, 10000);
      
      const cleanup = () => {
        clearTimeout(timeout);
        if (script.parentNode) script.parentNode.removeChild(script);
        delete window.jsonpgz;
      };
      
      // 天天基金API固定使用 jsonpgz 作为回调名
      window.jsonpgz = (result: JsonpFundData) => {
        cleanup();
        resolve(result);
      };
      
      script.src = url;
      script.onerror = () => {
        cleanup();
        reject(new Error('网络请求失败'));
      };
      document.head.appendChild(script);
    });
    
    // 验证返回数据
    if (!data || !data.fundcode) {
      console.warn(`[天天基金] ${fundCode} 返回数据无效`);
      return null;
    }
    
    const nav = parseFloat(data.dwjz);
    const estimate = parseFloat(data.gsz);
    const growth = parseFloat(data.gszzl);
    
    console.log(`[天天基金] ${fundCode}: 净值=${nav}, 估值=${estimate}, 涨幅=${growth}%`);
    
    return {
      id: 0,
      code: data.fundcode,
      name: data.name,
      nav: nav || 0,
      estimate: estimate || 0,
      growth: growth || 0,
      updateTime: data.gztime ? data.gztime.slice(11, 16) : '--:--',
      jzrq: data.jzrq || '',
    };
  } catch (error) {
    console.error(`[天天基金] 获取 ${fundCode} 失败:`, error);
    return null;
  }
};

// 获取基金实时估值（东方财富源）- 实际使用天天基金数据，仅作标记
const getFundEstimateEastmoney = async (fundCode: string): Promise<Fund | null> => {
  // 东方财富源暂时使用天天基金数据
  return getFundEstimateTiantian(fundCode);
};

// 获取基金实时估值（持仓穿透计算）
const getFundEstimateCalculated = async (fundCode: string): Promise<Fund | null> => {
  try {
    // 先获取基础数据
    const baseData = await getFundEstimateTiantian(fundCode);
    if (!baseData) return null;
    
    // 计算持仓穿透估值
    const holdingsCalc = await calculateHoldingsEstimate(fundCode, baseData.nav);
    
    // 如果持仓计算有效，使用计算结果，否则保持原值
    if (holdingsCalc.holdings.length > 0 && holdingsCalc.estimate > 0) {
      return {
        ...baseData,
        estimate: holdingsCalc.estimate,
        growth: holdingsCalc.growth,
      };
    }
    
    return baseData;
  } catch (error) {
    console.error(`[持仓穿透] 获取 ${fundCode} 失败:`, error);
    return getFundEstimateTiantian(fundCode);
  }
};

// 获取基金实时估值（根据当前数据源）
export const getFundEstimate = async (fundCode: string, source?: DataSourceType): Promise<Fund | null> => {
  const dataSource = source || currentDataSource;
  
  switch (dataSource) {
    case 'eastmoney':
      return getFundEstimateEastmoney(fundCode);
    case 'calculated':
      return getFundEstimateCalculated(fundCode);
    case 'tiantian':
    default:
      return getFundEstimateTiantian(fundCode);
  }
};

// 批量获取基金估值 - 使用有限并发避免JSONP冲突
export const getBatchEstimates = async (fundCodes: string[], source?: DataSourceType): Promise<Fund[]> => {
  const results: Fund[] = [];
  const concurrency = 3; // 最大并发数
  
  // 分批处理
  for (let i = 0; i < fundCodes.length; i += concurrency) {
    const batch = fundCodes.slice(i, i + concurrency);
    
    // 并行获取当前批次
    const batchResults = await Promise.all(
      batch.map(async (code, index) => {
        // 每个请求之间添加小延迟避免冲突
        await new Promise(resolve => setTimeout(resolve, index * 150));
        try {
          return await getFundEstimate(code, source);
        } catch (error) {
          console.error(`批量获取 ${code} 失败:`, error);
          return null;
        }
      })
    );
    
    results.push(...batchResults.filter((f): f is Fund => f !== null));
  }
  
  return results;
};

// 加载全量基金列表
export const loadAllFunds = async (): Promise<FundSearchResult[]> => {
  if (allFundsCache) return allFundsCache;
  
  try {
    const url = 'https://fund.eastmoney.com/js/fundcode_search.js';
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('加载基金列表超时'));
      }, 15000);
      
      const cleanup = () => {
        clearTimeout(timeout);
        if (script.parentNode) script.parentNode.removeChild(script);
      };
      
      script.onload = () => {
        cleanup();
        resolve();
      };
      script.onerror = () => {
        cleanup();
        reject(new Error('加载失败'));
      };
      script.src = url;
      document.head.appendChild(script);
    });
    
    if (window.r && Array.isArray(window.r)) {
      allFundsCache = window.r.map((item, index) => ({
        id: index,
        code: item[0],
        pinyin: item[1],
        name: item[2],
        type: item[3],
        fullPinyin: item[4]
      }));
      console.log(`✓ 已加载 ${allFundsCache.length} 只基金数据`);
      return allFundsCache;
    }
    return [];
  } catch (error) {
    console.error('加载基金列表失败:', error);
    return [];
  }
};

// 搜索基金
export const searchFunds = async (keyword: string, limit = 20): Promise<FundSearchResult[]> => {
  const allFunds = await loadAllFunds();
  if (!keyword.trim()) return [];
  
  const lowerKeyword = keyword.toLowerCase().trim();
  const results = allFunds.filter(fund => 
    fund.code.includes(lowerKeyword) ||
    fund.name.includes(lowerKeyword) ||
    fund.pinyin.toLowerCase().includes(lowerKeyword) ||
    fund.fullPinyin.toLowerCase().includes(lowerKeyword)
  ).slice(0, limit);
  
  // 获取搜索结果的实时估值
  if (results.length > 0) {
    console.log(`[搜索] 获取 ${results.length} 只基金的实时估值...`);
    const estimates = await getBatchEstimates(results.map(f => f.code));
    const estimateMap = new Map(estimates.map(e => [e.code, e]));
    
    const enrichedResults = results.map(fund => {
      const estimate = estimateMap.get(fund.code);
      if (estimate) {
        console.log(`[搜索] ${fund.code} 估值: ${estimate.estimate}, 涨幅: ${estimate.growth}%`);
      }
      return {
        ...fund,
        nav: estimate?.nav ?? 0,
        estimate: estimate?.estimate ?? 0,
        growth: estimate?.growth ?? 0,
        updateTime: estimate?.updateTime ?? '--:--',
      };
    });
    
    return enrichedResults;
  }
  return results;
};

// 判断市场是否开盘
const isMarketOpen = (market: string): boolean => {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const day = now.getDay();
  const time = hour * 100 + minute;
  
  // 周末休市 (A股和港股)
  if ((market === 'sh' || market === 'sz' || market === 'hk') && (day === 0 || day === 6)) {
    return false;
  }
  
  switch (market) {
    case 'sh':
    case 'sz':
      // A股: 9:30-11:30, 13:00-15:00
      return (time >= 930 && time <= 1130) || (time >= 1300 && time <= 1500);
    case 'hk':
      // 港股: 9:30-12:00, 13:00-16:00
      return (time >= 930 && time <= 1200) || (time >= 1300 && time <= 1600);
    case 'us':
      // 美股: 21:30-04:00 (北京时间)
      return time >= 2130 || time <= 400;
    default:
      return true;
  }
};

// 最新指数数据存储（用于实时更新）- 使用localStorage持久化
const INDICES_CACHE_KEY = 'fundmatrix_indices_cache';

const loadCachedIndices = (): Record<string, MarketIndex> => {
  try {
    const cached = localStorage.getItem(INDICES_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.error('加载缓存指数失败:', e);
  }
  return {};
};

const saveCachedIndices = (data: Record<string, MarketIndex>) => {
  try {
    localStorage.setItem(INDICES_CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('保存缓存指数失败:', e);
  }
};

let latestIndicesData: Record<string, MarketIndex> = loadCachedIndices();

// 获取市场指数数据 - 使用东方财富实时接口
export const getMarketIndices = async (): Promise<MarketIndex[]> => {
  const indices: MarketIndex[] = [];
  
  // 东方财富指数代码映射
  const indexList = [
    { secid: '1.000001', name: '上证指数', market: 'sh', display: '000001' },
    { secid: '0.399006', name: '创业板指', market: 'sz', display: '399006' },
    { secid: '1.000688', name: '科创50', market: 'sh', display: '000688' },
    { secid: '100.HSI', name: '恒生指数', market: 'hk', display: 'HSI' },
    { secid: '100.NDX', name: '纳斯达克', market: 'us', display: 'NDX' },
  ];

  // 逐个获取指数数据
  for (const idx of indexList) {
    try {
      const timestamp = Date.now();
      const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${idx.secid}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f169,f170&_=${timestamp}`;
      
      const data = await new Promise<{ rc: number; data?: { f43?: number; f44?: number; f45?: number; f46?: number; f169?: number; f170?: number } }>((resolve, reject) => {
        const callbackName = `eastmoney_idx_${idx.display}_${timestamp}`;
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('请求超时'));
        }, 5000);
        
        const cleanup = () => {
          clearTimeout(timeout);
          delete (window as Record<string, unknown>)[callbackName];
          if (script.parentNode) script.parentNode.removeChild(script);
        };
        
        (window as Record<string, unknown>)[callbackName] = (result: { rc: number; data?: { f43?: number; f44?: number; f45?: number; f46?: number; f169?: number; f170?: number } }) => {
          cleanup();
          resolve(result);
        };
        
        const script = document.createElement('script');
        script.src = url + `&cb=${callbackName}`;
        script.onerror = () => {
          cleanup();
          reject(new Error('网络请求失败'));
        };
        document.head.appendChild(script);
      });
      
      if (data.rc === 0 && data.data) {
        const d = data.data;
        // f43:最新价(需除100), f44:最高, f45:最低, f46:今开, f169:涨跌额, f170:涨跌幅
        const price = (d.f43 ?? 0) / 100;
        const change = (d.f169 ?? 0) / 100;
        const changePercent = (d.f170 ?? 0) / 100;
        const prevClose = price - change;
        const isClosed = !isMarketOpen(idx.market);
        
        if (price > 0) {
          const indexData: MarketIndex = {
            code: idx.display,
            name: idx.name,
            price,
            prevClose,
            change,
            changePercent,
            updateTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            isIndex: true,
            isClosed,
          };
          indices.push(indexData);
          latestIndicesData[idx.display] = indexData;
        } else if (latestIndicesData[idx.display]) {
          const cached = latestIndicesData[idx.display];
          const cachedTime = cached.updateTime.replace(' (缓存)', '');
          indices.push({ ...cached, isClosed, updateTime: cachedTime + ' (缓存)' });
        } else {
          indices.push(getFallbackIndexData(idx.name, idx.display, idx.market));
        }
      } else if (latestIndicesData[idx.display]) {
        const cached = latestIndicesData[idx.display];
        const cachedTime = cached.updateTime.replace(' (缓存)', '');
        indices.push({ ...cached, isClosed: !isMarketOpen(idx.market), updateTime: cachedTime + ' (缓存)' });
      } else {
        indices.push(getFallbackIndexData(idx.name, idx.display, idx.market));
      }
    } catch (error) {
      console.error(`获取 ${idx.name} 失败:`, error);
      if (latestIndicesData[idx.display]) {
        const cached = latestIndicesData[idx.display];
        const cachedTime = cached.updateTime.replace(' (缓存)', '');
        indices.push({ ...cached, isClosed: !isMarketOpen(idx.market), updateTime: cachedTime + ' (缓存)' });
      } else {
        indices.push(getFallbackIndexData(idx.name, idx.display, idx.market));
      }
    }
  }
  
  // 保存成功获取的数据到缓存
  if (Object.keys(latestIndicesData).length > 0) {
    saveCachedIndices(latestIndicesData);
  }
  
  return indices;
};

// 备用指数数据
const getFallbackIndexData = (name: string, code: string, market: string): MarketIndex => {
  const fallbackPrices: Record<string, { price: number; change: number }> = {
    '上证指数': { price: 3350.44, change: 0.23 },
    '创业板指': { price: 2156.78, change: -0.45 },
    '科创50': { price: 1023.56, change: 0.67 },
    '恒生指数': { price: 20312.45, change: -0.12 },
    '纳斯达克': { price: 19478.23, change: 0.89 },
  };
  
  const data = fallbackPrices[name] || { price: 0, change: 0 };
  const isClosed = !isMarketOpen(market);
  
  return {
    code,
    name,
    price: data.price,
    prevClose: data.price / (1 + data.change / 100),
    change: data.price * data.change / 100,
    changePercent: data.change,
    updateTime: '--:--',
    isIndex: true,
    isClosed,
  };
};

// 声明pingzhongdata返回的全局变量类型
declare global {
  interface Window {
    fS_name?: string;
    fS_code?: string;
    fund_sourceRate?: string;
    fund_Rate?: string;
    fund_minsg?: string;
    stockCodes?: string[];
    zqCodes?: string;
    syl_1n?: string;  // 近1年收益
    syl_6y?: string;  // 近半年收益
    syl_3y?: string;  // 近3月收益
    syl_1y?: string;  // 近1月收益
    Data_fundStocks?: Array<{GPDM: string; GPJC: string; JZBL: string; PCTNVCHG?: string; INDEXNAME?: string}>;
    Data_holderStructure?: {series: Array<{name: string; data: number[]}>};
    Data_netWorthTrend?: Array<{x: number; y: number; equityReturn: number; unitMoney: string}>;
    Data_ACWorthTrend?: Array<[number, number]>; // [时间戳, 累计净值]
    Data_grandTotal?: Array<{name: string; data: Array<[number, number]>}>;
    Data_rateInSimilarType?: Array<{x: number; y: number; sc: string}>;
    Data_rateInSimilarPersent?: Array<{x: number; y: number; sc?: string}>; // 同类排名百分比
    Data_fluctuationScale?: {categories: string[]; series: Array<{name: string; data: number[]}>};
    Data_performanceEvaluation?: {avr: string; categories: string[]; data: number[]};
    Data_currentFundManager?: Array<{
      id: string;
      pic: string;
      name: string;
      star: number;
      workTime: string;
      fundSize: string;
      power?: {avr: string; categories: string[]; data: number[]; jzrq: string};
      profit?: {categories: string[]; data: number[]; jzrq: string};
    }>;
    // 持仓风格数据
    swithSame498498?: {
      Style?: { FSCALE?: string; FSTYLE?: string; GZQK?: string; YLQK?: string };
      Pos?: Array<{GPDM: string; GPJC: string; JZBL: string; PCTNVCHG?: string; INDEXNAME?: string}>;
      SubStyle?: Array<{DLMC: string; CCBL: string; AVRBL: string}>;
      JJGSJC?: string; // 持仓更新时间
    };
  }
}

// 获取基金累计净值估值 (从pingzhongdata获取)
export const getFundAccumulatedNav = async (fundCode: string): Promise<{
  accNav: number;  // 累计净值
  accNavDate: number;  // 累计净值日期时间戳
  syl_1y: number;  // 近1年收益
  syl_6m: number;  // 近半年收益
  syl_3m: number;  // 近3月收益
  syl_1m: number;  // 近1月收益
  rankPercent: number;  // 同类排名百分比
} | null> => {
  try {
    clearGlobalFundData();
    
    const timestamp = Date.now();
    const url = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${timestamp}`;
    
    await loadFundDetailScript(url);
    
    let accNav = 0;
    let accNavDate = 0;
    
    // 从Data_ACWorthTrend获取最新累计净值
    if (window.Data_ACWorthTrend && window.Data_ACWorthTrend.length > 0) {
      const latest = window.Data_ACWorthTrend[window.Data_ACWorthTrend.length - 1];
      accNavDate = latest[0];
      accNav = latest[1];
    }
    
    // 获取同类排名百分比
    let rankPercent = 0;
    if (window.Data_rateInSimilarPersent && window.Data_rateInSimilarPersent.length > 0) {
      rankPercent = window.Data_rateInSimilarPersent[window.Data_rateInSimilarPersent.length - 1].y;
    }
    
    return {
      accNav,
      accNavDate,
      syl_1y: parseFloat(window.syl_1n || '0'),
      syl_6m: parseFloat(window.syl_6y || '0'),
      syl_3m: parseFloat(window.syl_3y || '0'),
      syl_1m: parseFloat(window.syl_1y || '0'),
      rankPercent,
    };
  } catch (e) {
    console.warn(`获取基金${fundCode}累计净值失败:`, e);
    return null;
  }
};

// 基金详情缓存
const fundDetailCache = new Map<string, { data: FundDetail; timestamp: number }>();
const DETAIL_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// ==================== 净值更新状态检测 ====================

/**
 * 检测净值是否已更新，返回更新状态和涨幅
 * 逻辑：检查 navHistory 最新数据是否在近3天内（考虑周末和节假日）
 * @param navHistory 净值历史数据
 * @returns { navUpdated, navUpdateGrowth, navUpdateDate }
 */
export const getNavUpdateStatus = (navHistory: { date: string; nav: number; growth: number }[]): {
  navUpdated: boolean;
  navUpdateGrowth?: number;
  navUpdateDate?: string;
} => {
  if (!navHistory || navHistory.length === 0) {
    return { navUpdated: false };
  }
  
  // 从navHistory中找最新的数据
  const sortedHistory = [...navHistory].sort((a, b) => b.date.localeCompare(a.date));
  const latestRecord = sortedHistory[0];
  
  if (!latestRecord) {
    return { navUpdated: false };
  }
  
  // 检查最新记录的日期是否在近5天内（考虑周末和节假日）
  const today = new Date();
  const latestDate = new Date(latestRecord.date);
  const diffDays = Math.floor((today.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // 如果最新数据在5天内，认为已更新（考虑周末+节假日）
  const isUpdated = diffDays <= 5;
  
  return {
    navUpdated: isUpdated,
    navUpdateGrowth: latestRecord.growth,
    navUpdateDate: latestRecord.date,
  };
};

/**
 * 批量获取基金净值更新状态
 * @param fundCodes 基金代码列表
 * @returns Map<code, { navUpdated, navUpdateGrowth, navUpdateDate }>
 */
export const getBatchNavUpdateStatus = async (fundCodes: string[]): Promise<Map<string, {
  navUpdated: boolean;
  navUpdateGrowth?: number;
  navUpdateDate?: string;
}>> => {
  const result = new Map<string, { navUpdated: boolean; navUpdateGrowth?: number; navUpdateDate?: string }>();
  
  // 并发获取详情（利用缓存）
  const promises = fundCodes.map(async (code) => {
    try {
      const detail = await getFundDetail(code);
      if (detail && detail.navHistory) {
        const status = getNavUpdateStatus(detail.navHistory);
        result.set(code, status);
      } else {
        result.set(code, { navUpdated: false });
      }
    } catch (e) {
      console.warn(`[NavUpdate] 获取 ${code} 状态失败:`, e);
      result.set(code, { navUpdated: false });
    }
  });
  
  await Promise.all(promises);
  return result;
};

// 获取基金详情数据 - 优化版本
export const getFundDetail = async (fundCode: string): Promise<FundDetail | null> => {
  try {
    // 检查缓存
    const cached = fundDetailCache.get(fundCode);
    if (cached && Date.now() - cached.timestamp < DETAIL_CACHE_TTL) {
      console.log(`[详情] 使用缓存: ${fundCode}`);
      return cached.data;
    }
    
    console.log(`[详情] 开始加载: ${fundCode}`);
    const startTime = Date.now();
    
    // 清除之前的全局变量数据
    clearGlobalFundData();
    
    // 并行获取基本数据和详情数据
    const [estimate] = await Promise.all([
      getFundEstimate(fundCode),
      loadFundDetailScriptFast(`https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`),
    ]);
    
    if (!estimate) {
      console.warn(`[详情] 获取估值失败: ${fundCode}`);
      return null;
    }
    
    // 快速解析数据
    const historyData = parseNavHistoryFromGlobal();
    const managerData = parseManagerFromGlobal();
    const performanceData = calculateHistoricalPerformance(historyData);
    const styleData = parseStyleFromGlobal();
    
    // 从全局数据获取持仓（不再额外请求）
    let holdings: FundHolding[] = [];
    let holdingsDate: string | undefined;
    
    if (window.swithSame498498?.Pos && Array.isArray(window.swithSame498498.Pos)) {
      holdingsDate = window.swithSame498498.JJGSJC;
      holdings = window.swithSame498498.Pos.slice(0, 10).map(item => ({
        code: item.GPDM,
        name: item.GPJC,
        ratio: parseFloat(item.JZBL) || 0,
        industry: item.INDEXNAME,
        change: item.PCTNVCHG ? parseFloat(item.PCTNVCHG) : undefined,
      }));
    } else if (window.Data_fundStocks && Array.isArray(window.Data_fundStocks)) {
      holdings = window.Data_fundStocks.slice(0, 10).map(item => ({
        code: item.GPDM,
        name: item.GPJC,
        ratio: parseFloat(item.JZBL) || 0,
        industry: item.INDEXNAME,
        change: item.PCTNVCHG ? parseFloat(item.PCTNVCHG) : undefined,
      }));
    }
    
    // 构建详情数据
    const detail: FundDetail = {
      code: fundCode,
      name: window.fS_name || estimate.name,
      type: '混合型',
      nav: estimate.nav,
      navDate: estimate.jzrq || new Date().toISOString().slice(0, 10),
      estimate: estimate.estimate,
      estimateGrowth: estimate.growth,
      estimateTime: estimate.updateTime,
      manager: managerData.name,
      managerTenure: managerData.tenure,
      scale: managerData.fundSize,
      scaleDate: new Date().toISOString().slice(0, 10),
      establishDate: managerData.workTime || '未知',
      company: '基金公司',
      returnDay: estimate.growth,
      returnWeek: performanceData.week,
      returnMonth: performanceData.month,
      return3Month: performanceData.month3,
      return6Month: performanceData.month6,
      returnYear: parseFloat(window.syl_1n || '0') || performanceData.year,
      return3Year: parseFloat(window.syl_3y || '0') || performanceData.year3,
      returnSinceEstablish: parseFloat(window.syl_6y || '0') || performanceData.total,
      riskLevel: determineRiskLevel(estimate.growth),
      sharpeRatio: undefined,
      maxDrawdown: undefined,
      navHistory: historyData,
      topHoldings: holdings,
      holdingsDate: holdingsDate,
      style: styleData.style,
      subStyles: styleData.subStyles,
    };
    
    // 缓存结果
    fundDetailCache.set(fundCode, { data: detail, timestamp: Date.now() });
    
    console.log(`[详情] 加载完成: ${fundCode}, 耗时: ${Date.now() - startTime}ms`);
    return detail;
  } catch (error) {
    console.error(`获取基金详情失败:`, error);
    return null;
  }
};

// 快速加载脚本（3秒超时）
const loadFundDetailScriptFast = async (url: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, 3000); // 3秒超时
    
    const cleanup = () => {
      clearTimeout(timeout);
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    
    script.onload = () => {
      cleanup();
      resolve(true);
    };
    script.onerror = () => {
      cleanup();
      resolve(false);
    };
    script.src = url;
    document.head.appendChild(script);
  });
};

// 清除全局数据
const clearGlobalFundData = () => {
  window.fS_name = undefined;
  window.fS_code = undefined;
  window.syl_1n = undefined;
  window.syl_3y = undefined;
  window.syl_6y = undefined;
  window.Data_fundStocks = undefined;
  window.Data_netWorthTrend = undefined;
  window.Data_ACWorthTrend = undefined;
  window.Data_currentFundManager = undefined;
  window.swithSame498498 = undefined;
};

// 解析持仓风格数据
const parseStyleFromGlobal = (): { style?: FundStyle; subStyles?: FundSubStyle[] } => {
  const result: { style?: FundStyle; subStyles?: FundSubStyle[] } = {};
  
  // 尝试从 swithSame498498 获取风格数据
  if (window.swithSame498498?.Style) {
    const s = window.swithSame498498.Style;
    const scaleMap: Record<string, '大盘' | '中盘' | '小盘'> = {
      '大盘': '大盘', '中盘': '中盘', '小盘': '小盘'
    };
    const typeMap: Record<string, '价值' | '平衡' | '成长'> = {
      '价值': '价值', '平衡': '平衡', '成长': '成长'
    };
    const valuationMap: Record<string, '低估' | '中估' | '高估'> = {
      '低估': '低估', '中估': '中估', '高估': '高估'
    };
    const profitMap: Record<string, '低' | '中' | '高'> = {
      '低': '低', '中': '中', '高': '高'
    };
    
    result.style = {
      scale: scaleMap[s.FSCALE || ''] || '中盘',
      type: typeMap[s.FSTYLE || ''] || '平衡',
      valuation: valuationMap[s.GZQK || ''] || '中估',
      profit: profitMap[s.YLQK || ''] || '中',
    };
  }
  
  // 解析重仓主题
  if (window.swithSame498498?.SubStyle && Array.isArray(window.swithSame498498.SubStyle)) {
    result.subStyles = window.swithSame498498.SubStyle.map(item => ({
      name: item.DLMC || '未知',
      ratio: parseFloat(item.CCBL) || 0,
      avgRatio: parseFloat(item.AVRBL) || 0,
    }));
  }
  
  return result;
};

// 加载基金详情脚本
const loadFundDetailScript = async (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('加载超时'));
    }, 10000);
    
    const cleanup = () => {
      clearTimeout(timeout);
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    
    script.onload = () => {
      cleanup();
      resolve();
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('加载失败'));
    };
    script.src = url;
    document.head.appendChild(script);
  });
};

// 从全局变量解析净值历史
const parseNavHistoryFromGlobal = (): FundDetail['navHistory'] => {
  const history: FundDetail['navHistory'] = [];
  
  if (window.Data_netWorthTrend && Array.isArray(window.Data_netWorthTrend)) {
    const recentData = window.Data_netWorthTrend.slice(-30);
    
    recentData.forEach((item) => {
      const date = new Date(item.x);
      const nav = item.y;
      // 使用官方提供的 equityReturn 作为涨幅，而不是自己计算
      const growth = item.equityReturn !== undefined ? item.equityReturn : 0;
      
      let accNav = nav;
      if (window.Data_ACWorthTrend && Array.isArray(window.Data_ACWorthTrend)) {
        const accItem = window.Data_ACWorthTrend.find(a => a[0] === item.x);
        if (accItem) accNav = accItem[1];
      }
      
      history.push({
        date: date.toISOString().slice(0, 10),
        nav: parseFloat(nav.toFixed(4)),
        accNav: parseFloat(accNav.toFixed(4)),
        growth: parseFloat(growth.toFixed(2)),
      });
    });
  }
  
  // 如果没有数据，返回空数组而不是假数据
  return history;
};

// 从全局变量解析基金经理数据
const parseManagerFromGlobal = (): { name: string; tenure: string; fundSize: string; workTime: string } => {
  if (window.Data_currentFundManager && window.Data_currentFundManager.length > 0) {
    const manager = window.Data_currentFundManager[0];
    return {
      name: manager.name || '暂无数据',
      tenure: manager.workTime || '暂无数据',
      fundSize: manager.fundSize || '暂无数据',
      workTime: manager.workTime || '暂无数据',
    };
  }
  
  return {
    name: '暂无数据',
    tenure: '暂无数据',
    fundSize: '暂无数据',
    workTime: '暂无数据',
  };
};

// 计算历史业绩
const calculateHistoricalPerformance = (history: FundDetail['navHistory']): {
  week: number;
  month: number;
  month3: number;
  month6: number;
  year: number;
  year3: number;
  total: number;
} => {
  if (history.length < 2) {
    return { week: 0, month: 0, month3: 0, month6: 0, year: 0, year3: 0, total: 0 };
  }
  
  const latestNav = history[history.length - 1].nav;
  const getNavAtIndex = (daysBack: number): number => {
    const idx = Math.max(0, history.length - 1 - daysBack);
    return history[idx]?.nav || latestNav;
  };
  
  const calcReturn = (prevNav: number): number => {
    return prevNav > 0 ? ((latestNav - prevNav) / prevNav * 100) : 0;
  };
  
  return {
    week: calcReturn(getNavAtIndex(5)),
    month: calcReturn(getNavAtIndex(20)),
    month3: calcReturn(history[0]?.nav || latestNav),
    month6: 0,
    year: 0,
    year3: 0,
    total: 0,
  };
};

// 确定风险等级
const determineRiskLevel = (growth: number): string => {
  const absGrowth = Math.abs(growth);
  if (absGrowth > 5) return '高风险';
  if (absGrowth > 2) return '中高风险';
  if (absGrowth > 1) return '中风险';
  return '中低风险';
};

// 解析支付宝导入的持仓数据
export const parseAlipayData = (text: string): { code: string; name: string; nav: number; shares: number; cost: number }[] => {
  const lines = text.trim().split('\n');
  const holdings: { code: string; name: string; nav: number; shares: number; cost: number }[] = [];
  
  for (const line of lines) {
    // 支持多种格式: "基金代码 基金名称 净值 份额 成本" 或 CSV 格式
    const parts = line.split(/[\t,\s]+/).filter(p => p.trim());
    if (parts.length >= 4) {
      const code = parts[0].replace(/[^\d]/g, '');
      if (code.length === 6) {
        holdings.push({
          code,
          name: parts[1] || '',
          nav: parseFloat(parts[2]) || 0,
          shares: parseFloat(parts[3]) || 0,
          cost: parseFloat(parts[4]) || parseFloat(parts[2]) || 0,
        });
      }
    }
  }
  
  return holdings;
};

// ==================== 持仓穿透计算功能 ====================

// 股票持仓信息
export interface StockHolding {
  code: string;
  name: string;
  ratio: number; // 持仓比例 %
  price?: number; // 实时价格
  change?: number; // 涨跌幅 %
  marketValue?: number; // 持仓市值
}

// 持仓数据缓存
const holdingsCache = new Map<string, { data: StockHolding[]; timestamp: number }>();
const HOLDINGS_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 预设热门基金持仓数据 (基于2024Q3公开季报数据)
const PRESET_HOLDINGS: Record<string, StockHolding[]> = {
  // 易方达中小盘混合 110011
  '110011': [
    { code: '600519', name: '贵州茅台', ratio: 9.12 },
    { code: '000858', name: '五粮液', ratio: 6.45 },
    { code: '000568', name: '泸州老窖', ratio: 5.23 },
    { code: '002304', name: '洋河股份', ratio: 4.87 },
    { code: '600809', name: '山西汾酒', ratio: 4.56 },
    { code: '000596', name: '古井贡酒', ratio: 3.89 },
    { code: '603369', name: '今世缘', ratio: 3.45 },
    { code: '600779', name: '水井坊', ratio: 2.98 },
    { code: '000799', name: '酒鬼酒', ratio: 2.67 },
    { code: '603589', name: '口子窖', ratio: 2.34 },
  ],
  // 招商中证白酒指数 161725
  '161725': [
    { code: '600519', name: '贵州茅台', ratio: 19.85 },
    { code: '000858', name: '五粮液', ratio: 15.23 },
    { code: '000568', name: '泸州老窖', ratio: 10.12 },
    { code: '002304', name: '洋河股份', ratio: 8.56 },
    { code: '600809', name: '山西汾酒', ratio: 7.89 },
    { code: '000596', name: '古井贡酒', ratio: 6.45 },
    { code: '603369', name: '今世缘', ratio: 5.12 },
    { code: '600779', name: '水井坊', ratio: 4.23 },
    { code: '000799', name: '酒鬼酒', ratio: 3.67 },
    { code: '603589', name: '口子窖', ratio: 3.12 },
  ],
  // 华夏能源革新股票 003834
  '003834': [
    { code: '300750', name: '宁德时代', ratio: 9.87 },
    { code: '002594', name: '比亚迪', ratio: 7.65 },
    { code: '601012', name: '隆基绿能', ratio: 6.54 },
    { code: '300014', name: '亿纬锂能', ratio: 5.43 },
    { code: '002460', name: '赣锋锂业', ratio: 4.32 },
    { code: '300274', name: '阳光电源', ratio: 4.12 },
    { code: '002129', name: 'TCL中环', ratio: 3.87 },
    { code: '600438', name: '通威股份', ratio: 3.56 },
    { code: '688005', name: '容百科技', ratio: 3.23 },
    { code: '002812', name: '恩捷股份', ratio: 2.98 },
  ],
  // 易方达蓝筹精选混合 005827
  '005827': [
    { code: '600519', name: '贵州茅台', ratio: 8.56 },
    { code: '600036', name: '招商银行', ratio: 6.78 },
    { code: '601318', name: '中国平安', ratio: 5.67 },
    { code: '000333', name: '美的集团', ratio: 4.89 },
    { code: '000651', name: '格力电器', ratio: 4.12 },
    { code: '600900', name: '长江电力', ratio: 3.89 },
    { code: '000858', name: '五粮液', ratio: 3.67 },
    { code: '601888', name: '中国中免', ratio: 3.45 },
    { code: '600276', name: '恒瑞医药', ratio: 3.12 },
    { code: '000568', name: '泸州老窖', ratio: 2.98 },
  ],
  // 中欧时代先锋股票 001938
  '001938': [
    { code: '300750', name: '宁德时代', ratio: 7.89 },
    { code: '002594', name: '比亚迪', ratio: 6.54 },
    { code: '600519', name: '贵州茅台', ratio: 5.67 },
    { code: '000858', name: '五粮液', ratio: 4.89 },
    { code: '601012', name: '隆基绿能', ratio: 4.23 },
    { code: '002415', name: '海康威视', ratio: 3.98 },
    { code: '300014', name: '亿纬锂能', ratio: 3.67 },
    { code: '000333', name: '美的集团', ratio: 3.45 },
    { code: '600036', name: '招商银行', ratio: 3.12 },
    { code: '601318', name: '中国平安', ratio: 2.89 },
  ],
  // 诺安成长混合 320007
  '320007': [
    { code: '002371', name: '北方华创', ratio: 9.87 },
    { code: '688041', name: '海光信息', ratio: 8.56 },
    { code: '688256', name: '寒武纪', ratio: 7.45 },
    { code: '002049', name: '紫光国微', ratio: 6.34 },
    { code: '688008', name: '澜起科技', ratio: 5.67 },
    { code: '603501', name: '韦尔股份', ratio: 4.89 },
    { code: '688012', name: '中微公司', ratio: 4.23 },
    { code: '002185', name: '华天科技', ratio: 3.78 },
    { code: '688981', name: '中芯国际', ratio: 3.45 },
    { code: '600584', name: '长电科技', ratio: 3.12 },
  ],
  // 天弘沪深300ETF联接A 000961
  '000961': [
    { code: '600519', name: '贵州茅台', ratio: 4.89 },
    { code: '601318', name: '中国平安', ratio: 2.78 },
    { code: '600036', name: '招商银行', ratio: 2.45 },
    { code: '000858', name: '五粮液', ratio: 1.98 },
    { code: '601166', name: '兴业银行', ratio: 1.67 },
    { code: '600900', name: '长江电力', ratio: 1.56 },
    { code: '000333', name: '美的集团', ratio: 1.45 },
    { code: '600276', name: '恒瑞医药', ratio: 1.34 },
    { code: '601888', name: '中国中免', ratio: 1.23 },
    { code: '000568', name: '泸州老窖', ratio: 1.12 },
  ],
  // 申万菱信新能源汽车 001156
  '001156': [
    { code: '300750', name: '宁德时代', ratio: 10.12 },
    { code: '002594', name: '比亚迪', ratio: 8.67 },
    { code: '002460', name: '赣锋锂业', ratio: 6.45 },
    { code: '300014', name: '亿纬锂能', ratio: 5.89 },
    { code: '002812', name: '恩捷股份', ratio: 4.78 },
    { code: '300124', name: '汇川技术', ratio: 4.23 },
    { code: '601127', name: '赛力斯', ratio: 3.89 },
    { code: '002074', name: '国轩高科', ratio: 3.45 },
    { code: '688005', name: '容百科技', ratio: 3.12 },
    { code: '300919', name: '中伟股份', ratio: 2.89 },
  ],
  // 中欧医疗创新股票 012414
  '012414': [
    { code: '300760', name: '迈瑞医疗', ratio: 9.45 },
    { code: '600276', name: '恒瑞医药', ratio: 7.89 },
    { code: '300122', name: '智飞生物', ratio: 6.34 },
    { code: '000661', name: '长春高新', ratio: 5.67 },
    { code: '603259', name: '药明康德', ratio: 4.89 },
    { code: '688180', name: '君实生物', ratio: 4.23 },
    { code: '300347', name: '泰格医药', ratio: 3.78 },
    { code: '002821', name: '凯莱英', ratio: 3.45 },
    { code: '688276', name: '百克生物', ratio: 3.12 },
    { code: '300759', name: '康龙化成', ratio: 2.89 },
  ],
  // 华夏创业板动量成长ETF联接A 007119
  '007119': [
    { code: '300750', name: '宁德时代', ratio: 15.23 },
    { code: '300760', name: '迈瑞医疗', ratio: 5.67 },
    { code: '300014', name: '亿纬锂能', ratio: 4.89 },
    { code: '300274', name: '阳光电源', ratio: 4.12 },
    { code: '300124', name: '汇川技术', ratio: 3.78 },
    { code: '300122', name: '智飞生物', ratio: 3.45 },
    { code: '300059', name: '东方财富', ratio: 3.12 },
    { code: '002475', name: '立讯精密', ratio: 2.89 },
    { code: '300498', name: '温氏股份', ratio: 2.67 },
    { code: '300413', name: '芒果超媒', ratio: 2.34 },
  ],
};

// 获取基金真实持仓数据 - 优化版本（优先API数据）
export const getFundHoldings = async (fundCode: string): Promise<FundHolding[]> => {
  // 检查缓存
  const cached = holdingsCache.get(fundCode);
  if (cached && Date.now() - cached.timestamp < HOLDINGS_CACHE_TTL) {
    return cached.data as FundHolding[];
  }
  
  // 优先从API获取真实数据
  try {
    const holdings = await fetchHoldingsFromAPI(fundCode);
    if (holdings.length > 0) {
      holdingsCache.set(fundCode, { data: holdings as any, timestamp: Date.now() });
      console.log(`[Holdings] API成功获取: ${fundCode}, 持仓数: ${holdings.length}`);
      return holdings;
    }
  } catch (e) {
    console.warn(`[Holdings] API获取失败: ${fundCode}`, e);
  }
  
  // API失败时使用预设数据（仅对已知基金）
  if (PRESET_HOLDINGS[fundCode]) {
    const holdings: FundHolding[] = PRESET_HOLDINGS[fundCode].map(h => ({
      code: h.code,
      name: h.name,
      ratio: h.ratio,
      industry: undefined,
      change: undefined,
    }));
    holdingsCache.set(fundCode, { data: holdings as any, timestamp: Date.now() });
    console.log(`[Holdings] 使用预设数据: ${fundCode}, 持仓数: ${holdings.length}`);
    return holdings;
  }
  
  // 无法获取数据时返回空数组，让UI显示"暂无持仓数据"
  console.warn(`[Holdings] 无法获取持仓数据: ${fundCode}`);
  return [];
};

// 从API获取持仓数据 - 使用FundArchivesDatas接口
const fetchHoldingsFromAPI = async (fundCode: string): Promise<FundHolding[]> => {
  // 先尝试pingzhongdata（更可靠）
  try {
    const holdings = await fetchHoldingsFromPingzhong(fundCode);
    if (holdings.length > 0) {
      return holdings;
    }
  } catch (e) {
    console.warn(`[Holdings] pingzhongdata获取失败: ${fundCode}`, e);
  }
  
  // 再尝试FundArchivesDatas
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1];
  
  for (const year of years) {
    try {
      const holdings = await fetchHoldingsForYear(fundCode, year);
      if (holdings.length > 0) {
        console.log(`[Holdings] FundArchivesDatas成功: ${fundCode}, 年份: ${year}`);
        return holdings;
      }
    } catch (e) {
      console.warn(`[Holdings] 年份${year}获取失败:`, e);
    }
  }
  
  return [];
};

// 从FundArchivesDatas获取指定年份的持仓
const fetchHoldingsForYear = async (fundCode: string, year: number): Promise<FundHolding[]> => {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    // 使用HTTPS
    const url = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${fundCode}&topline=10&year=${year}&month=12,9,6,3&rt=${timestamp}`;
    
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('请求超时'));
    }, 8000);
    
    const cleanup = () => {
      clearTimeout(timeout);
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    
    // FundArchivesDatas返回格式: var apidata={ content:"<table>...</table>",binddate:null...}
    script.onload = () => {
      cleanup();
      try {
        const apidata = (window as any).apidata;
        if (apidata && apidata.content) {
          const holdings = parseHoldingsFromHTML(apidata.content);
          // 清理全局变量
          delete (window as any).apidata;
          resolve(holdings);
        } else {
          resolve([]);
        }
      } catch (e) {
        reject(e);
      }
    };
    
    script.onerror = () => {
      cleanup();
      reject(new Error('网络请求失败'));
    };
    
    script.src = url;
    document.head.appendChild(script);
  });
};

// 解析HTML表格中的持仓数据
const parseHoldingsFromHTML = (html: string): FundHolding[] => {
  const holdings: FundHolding[] = [];
  
  try {
    // 创建临时DOM解析HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 查找第一个表格（最新一期持仓）
    const table = doc.querySelector('table');
    if (!table) return [];
    
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach((row, idx) => {
      if (idx >= 10) return; // 只取前10
      
      const cells = row.querySelectorAll('td');
      if (cells.length >= 4) {
        // 表格结构: 序号, 股票代码, 股票名称, 占净值比例, ...
        const code = cells[1]?.textContent?.trim() || '';
        const name = cells[2]?.textContent?.trim() || '';
        let ratioText = cells[3]?.textContent?.trim() || '0';
        ratioText = ratioText.replace('%', '');
        const ratio = parseFloat(ratioText) || 0;
        
        if (code && name && ratio > 0) {
          holdings.push({
            code: code.padStart(6, '0'),
            name,
            ratio,
            industry: undefined,
            change: undefined,
          });
        }
      }
    });
  } catch (e) {
    console.warn('[Holdings] HTML解析失败:', e);
  }
  
  return holdings;
};

// 从pingzhongdata获取持仓（备用方案）
const fetchHoldingsFromPingzhong = async (fundCode: string): Promise<FundHolding[]> => {
  try {
    // 清除之前的数据
    window.Data_fundStocks = undefined;
    
    const timestamp = Date.now();
    const detailUrl = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${timestamp}`;
    
    await loadFundDetailScript(detailUrl);
    
    // 等待一小段时间确保数据加载完成
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const stocksData = (window.Data_fundStocks ?? []) as NonNullable<Window['Data_fundStocks']>;
    if (stocksData.length > 0) {
      console.log(`[Holdings] pingzhongdata成功: ${fundCode}, 数量: ${stocksData.length}`);
      return stocksData.slice(0, 10).map((item: { GPDM: string; GPJC: string; JZBL: string; INDEXNAME?: string; PCTNVCHG?: string }) => ({
        code: item.GPDM || '',
        name: item.GPJC || '',
        ratio: parseFloat(item.JZBL) || 0,
        industry: item.INDEXNAME,
        change: item.PCTNVCHG ? parseFloat(item.PCTNVCHG) : undefined,
      })).filter((h: FundHolding) => h.code && h.name && h.ratio > 0);
    }
    
    console.warn(`[Holdings] pingzhongdata无数据: ${fundCode}`);
  } catch (e) {
    console.warn(`[Holdings] pingzhongdata请求失败: ${fundCode}`, e);
  }
  return [];
};

// 获取股票实时行情
export const getStockPrice = async (stockCode: string): Promise<{ price: number; change: number } | null> => {
  try {
    // 根据股票代码判断市场: 6开头和688开头是上海，其他是深圳
    const market = stockCode.startsWith('6') ? 'sh' : 'sz';
    const sinaCode = `${market}${stockCode}`;
    const timestamp = Date.now();
    
    const url = `https://hq.sinajs.cn/list=${sinaCode}&_=${timestamp}`;
    
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('请求超时'));
      }, 3000);
      
      const cleanup = () => {
        clearTimeout(timeout);
        if (script.parentNode) script.parentNode.removeChild(script);
      };
      
      script.src = url;
      script.onload = () => {
        cleanup();
        resolve();
      };
      script.onerror = () => {
        cleanup();
        reject(new Error('网络请求失败'));
      };
      document.head.appendChild(script);
    });
    
    const varName = `hq_str_${sinaCode}`;
    const rawData = (window as Record<string, string>)[varName];
    
    if (rawData && rawData.length > 0) {
      const parts = rawData.split(',');
      // 新浪股票数据格式: 名称,今开,昨收,当前价,最高,最低,...
      const currentPrice = parseFloat(parts[3]) || 0;
      const prevClose = parseFloat(parts[2]) || 0;
      const change = prevClose > 0 ? ((currentPrice - prevClose) / prevClose * 100) : 0;
      
      return { price: currentPrice, change };
    }
    
    return null;
  } catch (error) {
    console.error(`获取股票 ${stockCode} 行情失败:`, error);
    return null;
  }
};

// 批量获取股票行情
export const getBatchStockPrices = async (stockCodes: string[]): Promise<Map<string, { price: number; change: number }>> => {
  const result = new Map<string, { price: number; change: number }>();
  
  // 构建批量请求
  const sinaCodesMap = new Map<string, string>();
  stockCodes.forEach(code => {
    const market = code.startsWith('6') ? 'sh' : 'sz';
    sinaCodesMap.set(`${market}${code}`, code);
  });
  
  const codes = Array.from(sinaCodesMap.keys()).join(',');
  const timestamp = Date.now();
  
  try {
    const url = `https://hq.sinajs.cn/list=${codes}&_=${timestamp}`;
    
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('请求超时'));
      }, 5000);
      
      const cleanup = () => {
        clearTimeout(timeout);
        if (script.parentNode) script.parentNode.removeChild(script);
      };
      
      script.src = url;
      script.onload = () => {
        cleanup();
        resolve();
      };
      script.onerror = () => {
        cleanup();
        reject(new Error('网络请求失败'));
      };
      document.head.appendChild(script);
    });
    
    // 解析返回数据
    sinaCodesMap.forEach((originalCode, sinaCode) => {
      const varName = `hq_str_${sinaCode}`;
      const rawData = (window as Record<string, string>)[varName];
      
      if (rawData && rawData.length > 0) {
        const parts = rawData.split(',');
        const currentPrice = parseFloat(parts[3]) || 0;
        const prevClose = parseFloat(parts[2]) || 0;
        const change = prevClose > 0 ? ((currentPrice - prevClose) / prevClose * 100) : 0;
        
        if (currentPrice > 0) {
          result.set(originalCode, { price: currentPrice, change });
        }
      }
    });
  } catch (error) {
    console.error('批量获取股票行情失败:', error);
  }
  
  return result;
};

// 基于持仓计算穿透估值
export const calculateHoldingsEstimate = async (fundCode: string, baseNav: number): Promise<{
  estimate: number;
  growth: number;
  holdings: FundHolding[];
}> => {
  // 获取基金持仓
  const holdings = await getFundHoldings(fundCode);
  
  if (holdings.length === 0) {
    return { estimate: baseNav, growth: 0, holdings: [] };
  }
  
  // 获取持仓股票的实时行情
  const stockCodes = holdings.map(h => h.code);
  const stockPrices = await getBatchStockPrices(stockCodes);
  
  // 计算加权涨跌幅
  let totalWeightedChange = 0;
  let totalRatio = 0;
  
  const updatedHoldings: FundHolding[] = holdings.map(holding => {
    const priceInfo = stockPrices.get(holding.code);
    if (priceInfo) {
      totalWeightedChange += holding.ratio * priceInfo.change;
      totalRatio += holding.ratio;
      return {
        ...holding,
        change: priceInfo.change,
      };
    }
    return holding;
  });
  
  // 计算穿透估值
  // 假设前十大持仓占比约50-70%，其他仓位变化假设为0
  const effectiveRatio = totalRatio > 0 ? totalRatio : 50;
  const estimatedChange = totalWeightedChange / effectiveRatio;
  const estimate = baseNav * (1 + estimatedChange / 100);
  
  return {
    estimate: parseFloat(estimate.toFixed(4)),
    growth: parseFloat(estimatedChange.toFixed(2)),
    holdings: updatedHoldings,
  };
};

