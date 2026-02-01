import React, { useState } from 'react';
import { Briefcase, Sparkles, TrendingUp, TrendingDown, Inbox, Trash2, Upload, RefreshCw, Clock, ArrowRightLeft, Percent, Database, Check, CheckCircle2 } from 'lucide-react';
import { SpotlightCard } from './SpotlightCard';
import { DATA_SOURCES, getCurrentDataSource, setDataSource, type DataSourceType } from '../services/fundApi';
import type { Holding } from '../types';

interface HoldingsPanelProps {
  holdings: Holding[];
  lastUpdateTime: string | null;
  onAnalyzePortfolio: () => void;
  onAnalyzeFund: (fund: Holding) => void;
  onRemoveHolding: (code: string) => void;
  onUpdateShares: (code: string, shares: string) => void;
  onUpdateCost: (code: string, cost: string) => void;
  onUpdateAmount: (code: string, amount: string) => void;
  onImportAlipay: (data: string) => void;
  onRefreshData: () => void;
  onFundClick?: (fund: Holding) => void;
}

export const HoldingsPanel: React.FC<HoldingsPanelProps> = ({
  holdings,
  lastUpdateTime,
  onAnalyzePortfolio,
  onAnalyzeFund,
  onRemoveHolding,
  onUpdateShares,
  onUpdateCost,
  onUpdateAmount,
  onImportAlipay,
  onRefreshData,
  onFundClick,
}) => {
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [showCompare, setShowCompare] = useState(true);
  const [showDataSourceModal, setShowDataSourceModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<DataSourceType>(getCurrentDataSource());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const totalAssets = holdings.reduce((acc, h) => acc + (h.shares * (h.estimate || h.nav)), 0);
  const todayProfit = holdings.reduce((acc, h) => acc + (h.shares * (h.estimate || h.nav) * (h.growth || 0) / 100), 0);
  const totalProfit = holdings.reduce((acc, h) => acc + (((h.estimate || h.nav) - h.cost) * h.shares), 0);

  const handleImport = () => {
    if (importText.trim()) {
      onImportAlipay(importText);
      setImportText('');
      setShowImportModal(false);
    }
  };

  // 切换数据源
  const handleDataSourceChange = async () => {
    setDataSource(selectedSource);
    setShowDataSourceModal(false);
    setIsRefreshing(true);
    await onRefreshData();
    setIsRefreshing(false);
  };

  // 获取当前数据源名称
  const currentSourceName = DATA_SOURCES.find(s => s.id === getCurrentDataSource())?.name || '天天基金';

  return (
    <div className="lg:col-span-2 space-y-6">
      <div className="scroll-animate" style={{transitionDelay: '0.2s'}}>
        {/* 头部操作栏 */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Briefcase className="text-red-500" /> 我的持仓
          </h2>
          <div className="flex items-center gap-2">
            {/* 更新时间 */}
            {lastUpdateTime && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground px-3 py-1.5 rounded-lg bg-surface border border-border">
                <Clock className="w-3 h-3" />
                <span>更新: {lastUpdateTime}</span>
              </div>
            )}
            {/* 刷新按钮 */}
            <button
              onClick={onRefreshData}
              className="p-2 rounded-lg bg-surface border border-border hover:bg-surface/80 transition-all text-muted-foreground hover:text-foreground"
              title="刷新数据"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {/* 数据源切换 */}
            <button
              onClick={() => setShowDataSourceModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border hover:bg-surface/80 transition-all text-sm font-medium text-muted-foreground hover:text-foreground"
              title="切换估值数据源"
            >
              <Database className="w-4 h-4" />
              {currentSourceName}
            </button>
            {/* 对比切换 */}
            <button
              onClick={() => setShowCompare(!showCompare)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all
                ${showCompare 
                  ? 'bg-secondary/20 text-secondary border-secondary/30' 
                  : 'bg-surface text-muted-foreground border-border hover:text-foreground'
                }`}
              title="显示估值与净值"
            >
              <ArrowRightLeft className="w-4 h-4" />
              估值/净值
            </button>
            {/* 导入按钮 */}
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border hover:bg-surface/80 transition-all text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <Upload className="w-4 h-4" />
              导入
            </button>
            {/* AI分析按钮 */}
            <button 
              onClick={onAnalyzePortfolio}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 border border-accent/30 transition-all active:scale-95 text-sm font-medium"
            >
              <Sparkles className="w-4 h-4" />
              智能诊断
            </button>
          </div>
        </div>
        
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <SpotlightCard>
            <div className="text-muted-foreground text-sm mb-1">总资产 (估算)</div>
            <div className="text-2xl font-mono font-bold text-foreground">
              ¥{totalAssets.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {holdings.length > 0 && (
              <div className={`mt-2 text-xs flex items-center gap-1 ${todayProfit >= 0 ? 'text-positive' : 'text-negative'}`}>
                {todayProfit >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {todayProfit >= 0 ? '+' : ''}{todayProfit.toFixed(2)} 今日
              </div>
            )}
          </SpotlightCard>
          <SpotlightCard>
            <div className="text-muted-foreground text-sm mb-1">累计盈亏</div>
            <div className={`text-2xl font-mono font-bold ${totalProfit >= 0 ? 'text-positive' : 'text-negative'}`}>
              {totalProfit >= 0 ? '+' : ''}¥{totalProfit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {holdings.length > 0 && totalProfit !== 0 && (
              <div className={`mt-2 text-xs ${totalProfit >= 0 ? 'text-positive' : 'text-negative'}`}>
                {((totalProfit / (totalAssets - totalProfit)) * 100).toFixed(2)}% 收益率
              </div>
            )}
          </SpotlightCard>
          <SpotlightCard>
            <div className="text-muted-foreground text-sm mb-1">持仓数量</div>
            <div className="text-2xl font-mono font-bold text-foreground">
              {holdings.length} <span className="text-sm font-normal text-muted-foreground">只</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              本地数据持久化
            </div>
          </SpotlightCard>
        </div>

        {/* 持仓表格 */}
        <SpotlightCard>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="pb-3 pl-2">基金名称</th>
                  <th className="pb-3">金额 / 份额</th>
                  <th className="pb-3">
                    {showCompare ? '估值 / 净值' : '现价 / 成本'}
                  </th>
                  <th className="pb-3 text-right">持有收益</th>
                  <th className="pb-3 text-right">收益率</th>
                  <th className="pb-3 pr-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {holdings.map((h, idx) => {
                  const currentValue = h.estimate || h.nav;
                  const holdingAmount = h.shares * currentValue;
                  const costAmount = h.shares * h.cost;
                  const profit = (currentValue - h.cost) * h.shares;
                  const profitRate = h.cost > 0 ? ((currentValue - h.cost) / h.cost * 100) : 0;
                  const isPositive = profit >= 0;
                  const hasAlipayData = h.alipayNav && h.alipayNav > 0;
                  const navDiff = hasAlipayData ? ((currentValue - h.alipayNav!) / h.alipayNav! * 100) : 0;
                  
                  return (
                    <tr key={`${h.code}-${idx}`} className="border-b border-border/50 last:border-0 hover:bg-surface/50 transition-colors group">
                      <td className="py-4 pl-2">
                        <div className="flex items-center gap-2">
                          <div 
                            className="cursor-pointer"
                            onClick={() => onFundClick?.(h)}
                          >
                            <div className="font-medium text-foreground flex items-center gap-2 hover:text-primary transition-colors">
                              {h.name}
                              {h.source === 'alipay' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/20 text-secondary">支付宝</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                              <span>{h.code}</span>
                              {/* 净值更新状态 - 显示已确认净值日期和涨幅 */}
                              {h.navUpdateDate && h.navUpdateGrowth !== undefined && (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                                  h.navUpdateGrowth >= 0
                                    ? 'bg-positive/10 text-positive'
                                    : 'bg-negative/10 text-negative'
                                }`}>
                                  <CheckCircle2 className="w-3 h-3" />
                                  {h.navUpdateDate.slice(5)} {h.navUpdateGrowth >= 0 ? '+' : ''}{h.navUpdateGrowth.toFixed(2)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); onAnalyzeFund(h); }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-accent hover:text-accent transition-opacity"
                            title="分析该基金"
                          >
                            <Sparkles className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-4 font-mono">
                        <div className="space-y-1">
                          {/* 持有金额 */}
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">¥</span>
                            <input 
                              type="number" 
                              value={holdingAmount.toFixed(2)}
                              onChange={(e) => onUpdateAmount(h.code, e.target.value)}
                              className="w-20 input-clean text-right text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          {/* 持有份额 */}
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              value={h.shares}
                              onChange={(e) => onUpdateShares(h.code, e.target.value)}
                              className="w-20 input-clean text-right text-xs text-muted-foreground"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-xs text-muted-foreground">份</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 font-mono">
                        {showCompare ? (
                          <div className="space-y-1.5">
                            {/* 双估值对比显示 */}
                            <div className="flex items-center gap-3">
                              {/* 实时估值 gsz */}
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-primary font-medium">估值</span>
                                <span className="text-foreground font-bold">{h.estimate.toFixed(4)}</span>
                              </div>
                              <span className="text-muted-foreground">/</span>
                              {/* 单位净值 dwjz */}
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-accent font-medium">净值</span>
                                <span className="text-accent">{h.nav.toFixed(4)}</span>
                              </div>
                            </div>
                            {/* 涨跌幅 */}
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${h.growth >= 0 ? 'text-positive' : 'text-negative'}`}>
                                {h.growth > 0 ? '+' : ''}{h.growth.toFixed(2)}%
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {h.updateTime}
                              </span>
                            </div>
                            {/* 支付宝导入数据对比 */}
                            {hasAlipayData && (
                              <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                                <span className="text-[10px] text-secondary font-medium">支付宝</span>
                                <span className="text-secondary">{h.alipayNav!.toFixed(4)}</span>
                                <span className={`text-xs ${navDiff >= 0 ? 'text-positive' : 'text-negative'}`}>
                                  差{navDiff > 0 ? '+' : ''}{navDiff.toFixed(3)}%
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {/* 现价 */}
                            <div className="text-foreground">{currentValue.toFixed(4)}</div>
                            {/* 成本 */}
                            <div className="flex items-center gap-1">
                              <input 
                                type="number" 
                                step="0.0001"
                                value={h.cost}
                                onChange={(e) => onUpdateCost(h.code, e.target.value)}
                                className="w-16 input-clean text-xs text-muted"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      {/* 持有收益（盈亏金额）*/}
                      <td className={`py-4 text-right font-mono font-bold ${isPositive ? 'text-positive' : 'text-negative'}`}>
                        <div className="flex items-center justify-end gap-1">
                          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          <span>{isPositive ? '+' : ''}¥{profit.toFixed(2)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground font-normal mt-0.5">
                          成本 ¥{costAmount.toFixed(2)}
                        </div>
                      </td>
                      {/* 收益率 */}
                      <td className={`py-4 text-right font-mono font-bold ${isPositive ? 'text-positive' : 'text-negative'}`}>
                        <div className="flex items-center justify-end gap-1">
                          <Percent className="w-3 h-3" />
                          <span>{isPositive ? '+' : ''}{profitRate.toFixed(2)}%</span>
                        </div>
                      </td>
                      <td className="py-4 pr-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); onRemoveHolding(h.code); }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-destructive hover:bg-destructive/20 transition-all"
                          title="删除持仓"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {holdings.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Inbox className="w-8 h-8 opacity-50" />
                        <span>暂无持仓，请从左侧搜索并添加基金</span>
                        <button
                          onClick={() => setShowImportModal(true)}
                          className="mt-2 text-primary hover:underline text-sm"
                        >
                          或导入已有持仓数据
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SpotlightCard>
      </div>

      {/* 导入弹窗 */}
      {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in">
            <div className="p-6 border-b border-border">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                导入持仓数据
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                支持支付宝、天天基金等平台导出的持仓数据
              </p>
            </div>
            <div className="p-6">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`粘贴持仓数据，每行一只基金：
基金代码  基金名称  净值  份额  成本
例如:
110011  易方达中小盘  2.5678  1000  2.4500
161725  招商白酒  1.2345  500  1.1000`}
                className="w-full h-48 p-4 bg-background border border-border rounded-lg text-foreground text-sm font-mono resize-none focus:outline-none focus:border-primary/50"
              />
              <div className="mt-4 text-xs text-muted-foreground">
                <p>支持格式：Tab分隔、逗号分隔、空格分隔</p>
                <p className="mt-1">必填字段：基金代码、名称、净值、份额</p>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3">
              <button
                onClick={() => { setShowImportModal(false); setImportText(''); }}
                className="px-4 py-2 rounded-lg border border-border hover:bg-surface/80 transition-colors text-muted-foreground"
              >
                取消
              </button>
              <button
                onClick={handleImport}
                disabled={!importText.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                导入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 数据源切换弹窗 */}
      {showDataSourceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-fade-in">
            <div className="p-5 border-b border-border">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                切换估值数据源
              </h3>
            </div>
            <div className="p-4 space-y-2">
              {DATA_SOURCES.map((source) => (
                <button
                  key={source.id}
                  onClick={() => setSelectedSource(source.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    selectedSource === source.id
                      ? 'bg-primary/10 border-primary/30 text-foreground'
                      : 'bg-background/50 border-border text-muted-foreground hover:bg-background hover:text-foreground'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedSource === source.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                  }`}>
                    {selectedSource === source.id && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium">{source.name}</div>
                    <div className="text-xs text-muted-foreground">{source.description}</div>
                  </div>
                  {source.id === 'eastmoney' && (
                    <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">推荐</span>
                  )}
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDataSourceModal(false);
                  setSelectedSource(getCurrentDataSource());
                }}
                className="px-4 py-2 rounded-lg border border-border hover:bg-surface/80 transition-colors text-muted-foreground"
              >
                取消
              </button>
              <button
                onClick={handleDataSourceChange}
                disabled={isRefreshing}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isRefreshing && <RefreshCw className="w-4 h-4 animate-spin" />}
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HoldingsPanel;

