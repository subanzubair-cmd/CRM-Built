'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'

interface Props {
  arv?: number | null
  propertyId?: string
}

type CalcMode = 'basic' | 'advanced'
type PurchaseType = 'cash' | 'financing'
type InputMode = 'percent' | 'dollar'

function fmt(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function parse(raw: string): number {
  const n = parseFloat(raw.replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}
function pctOf(base: number, pct: number): number {
  return base * (pct / 100)
}

const STORAGE_PREFIX = 'hp-calc-'

interface CalcState {
  mode: CalcMode
  // Basic
  arvInput: string; percentRule: string; repairMode: InputMode; repairsInput: string; wholesaleFee: string
  // Advanced
  advArv: string; minProfit: string; profitMode: InputMode; advWholesaleFee: string
  repairCosts: string; repairCostMode: InputMode; projectDuration: string; purchaseType: PurchaseType
  purchaseClosing: string; appraisalFee: string; homeInspection: string; otherFee: string
  loanAmount: string; lenderPoints: string; interestRate: string; lenderFees: string
  propTax: string; electricity: string; gas: string; water: string; garbage: string
  hoa: string; propInsurance: string; lawnCare: string; otherHolding: string
  commission: string; salesClosing: string; closingCredit: string
}

function defaultState(arv?: number | null): CalcState {
  const a = arv ? String(arv) : '0'
  return {
    mode: 'basic',
    arvInput: a, percentRule: '0', repairMode: 'percent', repairsInput: '0', wholesaleFee: '',
    advArv: a, minProfit: '0', profitMode: 'percent', advWholesaleFee: '0',
    repairCosts: '0', repairCostMode: 'percent', projectDuration: '0', purchaseType: 'cash',
    purchaseClosing: '0', appraisalFee: '0', homeInspection: '0', otherFee: '0',
    loanAmount: '0', lenderPoints: '0', interestRate: '0', lenderFees: '0',
    propTax: '0', electricity: '0', gas: '0', water: '0', garbage: '0',
    hoa: '0', propInsurance: '0', lawnCare: '0', otherHolding: '0',
    commission: '0', salesClosing: '0', closingCredit: '0',
  }
}

export function DealCalculator({ arv: initialArv, propertyId }: Props) {
  const storageKey = propertyId ? `${STORAGE_PREFIX}${propertyId}` : null

  const [s, setS] = useState<CalcState>(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(storageKey)
        if (saved) return JSON.parse(saved) as CalcState
      } catch {}
    }
    return defaultState(initialArv)
  })

  // Save to localStorage on every change
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(s))
    }
  }, [s, storageKey])

  const set = useCallback(<K extends keyof CalcState>(key: K, val: CalcState[K]) => {
    setS((prev) => ({ ...prev, [key]: val }))
  }, [])

  const mode = s.mode

  // ── Basic Calculations ──
  const basic = useMemo(() => {
    const arv = parse(s.arvInput)
    const pct = parse(s.percentRule)
    const allocation = pctOf(arv, pct)
    const repairs = s.repairMode === 'percent' ? pctOf(arv, parse(s.repairsInput)) : parse(s.repairsInput)
    const repairsPct = s.repairMode === 'percent' ? parse(s.repairsInput) : (arv > 0 ? (repairs / arv) * 100 : 0)
    const fixFlipMAO = allocation - repairs
    const wf = parse(s.wholesaleFee)
    const wholesaleMAO = fixFlipMAO - wf
    return { arv, allocation, repairs, repairsPct, fixFlipMAO, wholesaleMAO }
  }, [s.arvInput, s.percentRule, s.repairMode, s.repairsInput, s.wholesaleFee])

  // ── Advanced Calculations ──
  const adv = useMemo(() => {
    const resalePrice = parse(s.advArv)
    const dur = parse(s.projectDuration) || 1
    const minProfitVal = s.profitMode === 'percent' ? pctOf(resalePrice, parse(s.minProfit)) : parse(s.minProfit)
    const minProfitPct = resalePrice > 0 ? (minProfitVal / resalePrice) * 100 : 0
    const wf = parse(s.advWholesaleFee)
    const repVal = s.repairCostMode === 'percent' ? pctOf(resalePrice, parse(s.repairCosts)) : parse(s.repairCosts)
    const pc = parse(s.purchaseClosing); const af = parse(s.appraisalFee)
    const hi = parse(s.homeInspection); const of2 = parse(s.otherFee)
    const la = parse(s.loanAmount); const lp = parse(s.lenderPoints)
    const ir = parse(s.interestRate); const lf = parse(s.lenderFees)
    const loanInterest = la * (ir / 100 / 12) * dur
    const loanPointsVal = pctOf(la, lp)
    const monthlyHolding = [s.propTax, s.electricity, s.gas, s.water, s.garbage, s.hoa, s.propInsurance, s.lawnCare, s.otherHolding].map(parse)
    const totalHolding = monthlyHolding.reduce((sum, v) => sum + v, 0) * dur
    const commVal = pctOf(resalePrice, parse(s.commission))
    const sc = parse(s.salesClosing); const cc = parse(s.closingCredit)
    const totalSelling = commVal + sc + cc
    const totalPurchaseCosts = pc + af + hi + of2
    const totalLenderCosts = loanInterest + loanPointsVal + lf
    const maxPurchasePrice = resalePrice - minProfitVal - wf - repVal - totalPurchaseCosts - totalLenderCosts - totalHolding - totalSelling
    const totalFundsNeeded = maxPurchasePrice + repVal + totalPurchaseCosts + totalHolding + af + hi + of2
    const outOfPocket = totalFundsNeeded - la
    const totalCosts = totalPurchaseCosts + repVal + totalHolding + totalLenderCosts + totalSelling
    const netProfit = resalePrice - maxPurchasePrice - totalCosts
    const roi = maxPurchasePrice > 0 ? (netProfit / maxPurchasePrice) * 100 : 0
    const monthlyPayment = la > 0 && ir > 0 ? la * (ir / 100 / 12) : 0
    return { resalePrice, minProfitVal, minProfitPct, wf, repVal, pc, af, hi, of2, loanInterest, loanPointsVal, lf, monthlyHolding, totalHolding, commVal, sc, cc, totalSelling, totalPurchaseCosts, totalLenderCosts, maxPurchasePrice, totalFundsNeeded, la, outOfPocket, netProfit, roi, monthlyPayment, dur, ir, lp }
  }, [s.advArv, s.minProfit, s.profitMode, s.advWholesaleFee, s.repairCosts, s.repairCostMode, s.projectDuration, s.purchaseType, s.purchaseClosing, s.appraisalFee, s.homeInspection, s.otherFee, s.loanAmount, s.lenderPoints, s.interestRate, s.lenderFees, s.propTax, s.electricity, s.gas, s.water, s.garbage, s.hoa, s.propInsurance, s.lawnCare, s.otherHolding, s.commission, s.salesClosing, s.closingCredit])

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header + Mode toggle */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h3 className="text-base font-semibold text-gray-900">Calculator</h3>
        <div className="flex gap-2">
          <button onClick={() => set('mode', 'basic')} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${mode === 'basic' ? 'bg-blue-600 text-white' : 'text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>Basic Calculator</button>
          <button onClick={() => set('mode', 'advanced')} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${mode === 'advanced' ? 'bg-blue-600 text-white' : 'text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>Advanced Calculator</button>
        </div>
      </div>

      {mode === 'basic' ? (
        /* ═══ BASIC CALCULATOR ═══ */
        <div className="px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Inputs</p>

          <Row label="ARV of the property">
            <$Input value={s.arvInput} onChange={(v) => set('arvInput', v)} />
          </Row>

          <Row label="% Rule">
            <PctInput value={s.percentRule} onChange={(v) => set('percentRule', v)} />
          </Row>

          <Row label="% Allocation">
            <Calc value={basic.allocation} />
          </Row>

          <div className="border-t border-red-100 my-3" />

          {/* Repairs with toggle */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-sm text-red-700 font-medium">Repairs</label>
              <div className="flex border border-gray-200 rounded overflow-hidden">
                <button
                  onClick={() => {
                    if (s.repairMode === 'dollar') {
                      const pct = basic.arv > 0 ? (parse(s.repairsInput) / basic.arv) * 100 : 0
                      set('repairsInput', pct.toFixed(0))
                    }
                    set('repairMode', 'percent')
                  }}
                  className={`px-2 py-0.5 text-xs font-bold transition-colors ${s.repairMode === 'percent' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >%</button>
                <button
                  onClick={() => {
                    if (s.repairMode === 'percent') {
                      set('repairsInput', String(Math.round(basic.repairs)))
                    }
                    set('repairMode', 'dollar')
                  }}
                  className={`px-2 py-0.5 text-xs font-bold transition-colors ${s.repairMode === 'dollar' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >$</button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {s.repairMode === 'percent' ? (
                <>
                  <div className="w-28"><PctInput value={s.repairsInput} onChange={(v) => set('repairsInput', v)} /></div>
                  <Calc value={basic.repairs} />
                </>
              ) : (
                <div className="w-36"><$Input value={s.repairsInput} onChange={(v) => set('repairsInput', v)} /></div>
              )}
            </div>
          </div>

          <div className="border-t border-red-100 my-3" />

          <Row label={<span className="font-bold text-gray-900">Fix and Flip MAO</span>}>
            <Calc value={basic.fixFlipMAO} bold />
          </Row>

          <div className="border-t border-red-100 my-3" />

          <Row label={<span className="text-red-700 font-medium">Wholesale Fee</span>}>
            <$Input value={s.wholesaleFee} onChange={(v) => set('wholesaleFee', v)} placeholder="$ xx" />
          </Row>

          <div className="border-t border-red-100 my-3" />

          <Row label={<span className="font-bold text-gray-900">Wholesale MAO</span>}>
            <Calc value={basic.wholesaleMAO} bold />
          </Row>
        </div>
      ) : (
        /* ═══ ADVANCED CALCULATOR ═══ */
        <div className="flex gap-0 divide-x divide-gray-100">
          {/* LEFT: Inputs */}
          <div className="flex-1 px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
            <Sect title="INPUTS">
              <Row label="Resale Price after Fix Up (ARV)"><$Input value={s.advArv} onChange={(v) => set('advArv', v)} placeholder="$ xx.xx" /></Row>
              <Row label={<span>Minimum Required Profit <Toggle mode={s.profitMode} onToggle={() => set('profitMode', s.profitMode === 'percent' ? 'dollar' : 'percent')} /></span>}>
                {s.profitMode === 'percent' ? <PctInput value={s.minProfit} onChange={(v) => set('minProfit', v)} /> : <$Input value={s.minProfit} onChange={(v) => set('minProfit', v)} />}
              </Row>
              <Row label="Wholesale Profit Fee"><$Input value={s.advWholesaleFee} onChange={(v) => set('advWholesaleFee', v)} /></Row>
              <Row label={<span>Repair Costs <Toggle mode={s.repairCostMode} onToggle={() => set('repairCostMode', s.repairCostMode === 'percent' ? 'dollar' : 'percent')} /></span>}>
                {s.repairCostMode === 'percent' ? <PctInput value={s.repairCosts} onChange={(v) => set('repairCosts', v)} /> : <$Input value={s.repairCosts} onChange={(v) => set('repairCosts', v)} />}
              </Row>
              <Row label="Project Duration (months)"><NumInput value={s.projectDuration} onChange={(v) => set('projectDuration', v)} /></Row>
              <Row label="Cash or Financing?">
                <div className="flex gap-1">
                  <button onClick={() => set('purchaseType', 'cash')} className={`px-3 py-1 text-xs font-medium rounded-md ${s.purchaseType === 'cash' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Cash</button>
                  <button onClick={() => set('purchaseType', 'financing')} className={`px-3 py-1 text-xs font-medium rounded-md ${s.purchaseType === 'financing' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Financing</button>
                </div>
              </Row>
            </Sect>
            <Sect title="">
              <Row label="Purchase Closing Costs"><$Input value={s.purchaseClosing} onChange={(v) => set('purchaseClosing', v)} /></Row>
              <Row label="Appraisal Fee"><$Input value={s.appraisalFee} onChange={(v) => set('appraisalFee', v)} /></Row>
              <Row label="Home Inspection Fee"><$Input value={s.homeInspection} onChange={(v) => set('homeInspection', v)} /></Row>
              <Row label="Other Fee"><$Input value={s.otherFee} onChange={(v) => set('otherFee', v)} /></Row>
            </Sect>
            {s.purchaseType === 'financing' && (
              <Sect title="FINANCING">
                <Row label="Loan Amount ($)"><$Input value={s.loanAmount} onChange={(v) => set('loanAmount', v)} /></Row>
                <Row label="Lender Points (%)"><PctInput value={s.lenderPoints} onChange={(v) => set('lenderPoints', v)} /></Row>
                <Row label="Interest Rate (%)"><PctInput value={s.interestRate} onChange={(v) => set('interestRate', v)} /></Row>
                <Row label="Lender Fees"><$Input value={s.lenderFees} onChange={(v) => set('lenderFees', v)} /></Row>
              </Sect>
            )}
            <Sect title="MONTHLY HOLDING COSTS">
              <Row label="Property Taxes"><$Input value={s.propTax} onChange={(v) => set('propTax', v)} /></Row>
              <Row label="Electricity"><$Input value={s.electricity} onChange={(v) => set('electricity', v)} /></Row>
              <Row label="Gas"><$Input value={s.gas} onChange={(v) => set('gas', v)} /></Row>
              <Row label="Water"><$Input value={s.water} onChange={(v) => set('water', v)} /></Row>
              <Row label="Garbage"><$Input value={s.garbage} onChange={(v) => set('garbage', v)} /></Row>
              <Row label="HOA"><$Input value={s.hoa} onChange={(v) => set('hoa', v)} /></Row>
              <Row label="Property Insurance"><$Input value={s.propInsurance} onChange={(v) => set('propInsurance', v)} /></Row>
              <Row label="Lawn Care/Snow Removal"><$Input value={s.lawnCare} onChange={(v) => set('lawnCare', v)} /></Row>
              <Row label="Other Holding Costs"><$Input value={s.otherHolding} onChange={(v) => set('otherHolding', v)} /></Row>
            </Sect>
            <Sect title="SELLING COSTS">
              <Row label="Commission (%)"><PctInput value={s.commission} onChange={(v) => set('commission', v)} /></Row>
              <Row label="Closing Costs"><$Input value={s.salesClosing} onChange={(v) => set('salesClosing', v)} /></Row>
              <Row label="Closing Costs Credit to Buyer"><$Input value={s.closingCredit} onChange={(v) => set('closingCredit', v)} /></Row>
            </Sect>
          </div>

          {/* RIGHT: Results */}
          <div className="flex-1 px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto bg-gray-50">
            <RSection title="MAXIMUM PURCHASE PRICE CALCULATION">
              <RRow label="Resale Price" value={adv.resalePrice} />
              <RRow label="Minimum Required Profit" value={-adv.minProfitVal} pct={adv.minProfitPct} negative />
              <RRow label="Wholesale Fee" value={-adv.wf} pct={adv.resalePrice > 0 ? (adv.wf / adv.resalePrice) * 100 : 0} negative />
              <RRow label="Repair Costs" value={-adv.repVal} pct={adv.resalePrice > 0 ? (adv.repVal / adv.resalePrice) * 100 : 0} negative />
              <div className="mt-2 pt-1 border-t border-gray-200"><p className="text-xs font-semibold text-gray-600 mb-1">Purchase Costs</p>
                <RRow label="Purchase Closing Cost" value={-adv.pc} negative /><RRow label="Appraisal Fee" value={-adv.af} negative />
                <RRow label="Home Inspection Fee" value={-adv.hi} negative /><RRow label="Other Fee" value={-adv.of2} negative />
              </div>
              {s.purchaseType === 'financing' && <div className="mt-2 pt-1 border-t border-gray-200"><p className="text-xs font-semibold text-gray-600 mb-1">Lender Costs</p>
                <RRow label="Loan Interest" value={-adv.loanInterest} negative /><RRow label="Lender Points" value={-adv.loanPointsVal} negative /><RRow label="Lender Fees" value={-adv.lf} negative />
              </div>}
              <div className="mt-2 pt-1 border-t border-gray-200"><p className="text-xs font-semibold text-gray-600 mb-1">Holding Costs</p>
                {['Property Taxes','Electricity','Gas','Water','Garbage','HOA','Property Insurance','Lawn Care/Snow Removal','Other Holding Costs'].map((lbl, i) => (
                  <RRow key={lbl} label={lbl} value={-(adv.monthlyHolding[i] * adv.dur)} pct={adv.resalePrice > 0 ? ((adv.monthlyHolding[i] * adv.dur) / adv.resalePrice) * 100 : 0} negative />
                ))}
              </div>
              <div className="mt-2 pt-1 border-t border-gray-200"><p className="text-xs font-semibold text-gray-600 mb-1">Selling Costs</p>
                <RRow label="Commission" value={-adv.commVal} pct={parse(s.commission)} negative />
                <RRow label="Sales Closing Costs" value={-parse(s.salesClosing)} negative />
                <RRow label="Closing Costs Credit" value={-parse(s.closingCredit)} negative />
              </div>
              <div className="mt-2 pt-2 border-t-2 border-gray-300 flex justify-between"><span className="text-sm font-bold">Maximum Purchase Price</span><span className={`text-sm font-bold ${adv.maxPurchasePrice >= 0 ? 'text-gray-900' : 'text-red-600'}`}>${fmt(adv.maxPurchasePrice)}</span></div>
            </RSection>
            <RSection title="PERSONAL FUNDS NEEDED">
              <RRow label="Purchase Price" value={adv.maxPurchasePrice} /><RRow label="Repair Costs" value={adv.repVal} />
              <RRow label="Purchase Closing Costs" value={adv.totalPurchaseCosts} /><RRow label="Holding Cost" value={adv.totalHolding} />
              <RRow label="Appraisal Fee" value={adv.af} /><RRow label="Home Inspection Fee" value={adv.hi} /><RRow label="Other Fee" value={adv.of2} />
              <div className="mt-1 pt-1 border-t border-gray-200"><RRow label="Total Funds Needed" value={adv.totalFundsNeeded} bold /><RRow label="Total Loan Amount" value={-adv.la} negative /></div>
              <div className="mt-1 pt-1 border-t-2 border-gray-300"><RRow label="Out of Pocket Funds" value={adv.outOfPocket} bold /></div>
            </RSection>
            <RSection title="FINANCIAL SUMMARY">
              <RRow label="Resale Price (ARV)" value={adv.resalePrice} /><RRow label="Purchase Price" value={adv.maxPurchasePrice} green />
              <RRow label="Purchase Costs" value={adv.totalPurchaseCosts} green /><RRow label="Repairs" value={adv.repVal} green />
              <RRow label="Holding Costs" value={adv.totalHolding} green /><RRow label="Lender Costs" value={adv.totalLenderCosts} green />
              <RRow label="Selling Costs" value={adv.totalSelling} green />
              <div className="mt-1 pt-1 border-t-2 border-gray-300"><RRow label="Net Profit" value={adv.netProfit} bold /></div>
              <div className="mt-2 space-y-1"><RRow label="Project ROI" value={adv.roi} suffix="%" /><RRow label="Project Duration (months)" value={adv.dur} suffix="" /></div>
              <div className="mt-1 pt-1 border-t-2 border-gray-300"><RRow label="Monthly Loan Payment" value={adv.monthlyPayment} bold /></div>
            </RSection>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══ Sub-components ═══ */

function Sect({ title, children }: { title: string; children: React.ReactNode }) {
  return <div>{title && <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">{title}</p>}<div className="space-y-2.5">{children}</div></div>
}
function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 mb-3"><label className="shrink-0 text-sm text-gray-600">{label}</label><div className="w-40">{children}</div></div>
}
function fmtCommas(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const parts = cleaned.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0]
}
function $Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400"><span className="mr-1 text-sm text-gray-400">$</span><input type="text" inputMode="decimal" value={fmtCommas(value)} onChange={(e) => onChange(e.target.value.replace(/,/g, ''))} placeholder={placeholder ?? '0'} className="w-full bg-transparent text-right text-sm text-gray-900 outline-none placeholder:text-gray-300" /></div>
}
function PctInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <div className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400"><input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" className="w-full bg-transparent text-right text-sm text-gray-900 outline-none placeholder:text-gray-300" /><span className="ml-1 text-sm text-gray-400">%</span></div>
}
function NumInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <div className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400"><input type="text" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" className="w-full bg-transparent text-right text-sm text-gray-900 outline-none placeholder:text-gray-300" /></div>
}
function Calc({ value, bold }: { value: number; bold?: boolean }) {
  return <div className="flex items-center rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5"><span className="mr-1 text-sm text-gray-400">$</span><span className={`w-full text-right text-sm ${bold ? 'font-bold' : 'font-medium'} ${value < 0 ? 'text-red-600' : 'text-gray-700'}`}>{value < 0 ? '-' : ''}{fmt(Math.abs(value))}</span></div>
}
function Toggle({ mode, onToggle }: { mode: InputMode; onToggle: () => void }) {
  return <button onClick={onToggle} className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-blue-600 text-white hover:bg-blue-700">{mode === 'percent' ? '%' : '$'}</button>
}
function RSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white border border-gray-200 rounded-lg p-4"><p className="text-xs font-bold uppercase tracking-wider text-gray-800 mb-2">{title}</p><div className="space-y-1">{children}</div></div>
}
function RRow({ label, value, pct, negative, bold, green, suffix }: { label: string; value: number; pct?: number; negative?: boolean; bold?: boolean; green?: boolean; suffix?: string }) {
  const display = suffix === '%' ? `${value.toFixed(1)}%` : suffix === '' ? String(value) : `${value < 0 ? '(' : ''}$${fmt(Math.abs(value))}${value < 0 ? ')' : ''}`
  return <div className={`flex justify-between items-center py-0.5 ${bold ? 'font-bold' : ''}`}><span className="text-xs text-gray-600">{label}</span><div className="flex items-center gap-2"><span className={`text-xs ${negative && value < 0 ? 'text-red-600' : green ? 'text-green-600' : bold ? 'text-gray-900' : 'text-gray-700'}`}>{display}</span>{pct !== undefined && <span className="text-[10px] bg-amber-50 text-amber-700 px-1 py-0.5 rounded min-w-[32px] text-right">{pct.toFixed(0)}%</span>}</div></div>
}
