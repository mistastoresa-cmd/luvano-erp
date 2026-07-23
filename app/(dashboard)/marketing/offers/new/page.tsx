'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import {
  Percent,
  Tag,
  ChartBar,
  Gift,
  Crown,
  Bank,
  Wallet,
  CaretLeft,
  ArrowRight,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ActionState } from '@/lib/authz/action-session'
import { createPromotionAction } from '../actions'

type OfferType =
  | 'product_discount'
  | 'fixed_price'
  | 'quantity_tiers'
  | 'buy_x_get_y'
  | 'loyalty_tier'
  | 'bank_offer'
  | 'cashback'

const OFFER_TYPES: {
  type: OfferType
  title: string
  desc: string
  icon: React.ReactNode
  tint: string
}[] = [
  {
    type: 'product_discount',
    title: 'خصم منتج',
    desc: 'طبّق خصماً بنسبة مئوية أو مبلغ ثابت على منتج.',
    icon: <Percent size={22} weight="bold" />,
    tint: 'bg-accent-500/12 text-accent-600',
  },
  {
    type: 'fixed_price',
    title: 'سعر ثابت',
    desc: 'حدّد سعراً خاصاً عند شراء كمية معينة.',
    icon: <Tag size={22} weight="bold" />,
    tint: 'bg-success-500/12 text-success-600',
  },
  {
    type: 'quantity_tiers',
    title: 'جدول الخصومات',
    desc: 'خصم أكبر كل ما زادت الكمية المشتراة.',
    icon: <ChartBar size={22} weight="bold" />,
    tint: 'bg-warning-500/14 text-warning-600',
  },
  {
    type: 'buy_x_get_y',
    title: 'اشترِ واحصل',
    desc: 'اشترِ منتجاً واحصل على آخر مجاناً أو مخفّضاً.',
    icon: <Gift size={22} weight="bold" />,
    tint: 'bg-danger-500/12 text-danger-600',
  },
  {
    type: 'loyalty_tier',
    title: 'فئات الولاء',
    desc: 'كافئ عملاءك بخصم حسب فئة ولائهم.',
    icon: <Crown size={22} weight="bold" />,
    tint: 'bg-[oklch(0.55_0.2_300/0.12)] text-[oklch(0.55_0.2_300)]',
  },
  {
    type: 'bank_offer',
    title: 'عرض بنكي',
    desc: 'خصم عند الدفع ببطاقة بنك معيّن.',
    icon: <Bank size={22} weight="bold" />,
    tint: 'bg-[oklch(0.6_0.15_220/0.14)] text-[oklch(0.5_0.15_220)]',
  },
  {
    type: 'cashback',
    title: 'كاش باك',
    desc: 'نسبة تُعاد لمحفظة العميل بدل خصم فوري.',
    icon: <Wallet size={22} weight="bold" />,
    tint: 'bg-[oklch(0.65_0.16_160/0.14)] text-[oklch(0.5_0.14_160)]',
  },
]

export default function NewOfferPage() {
  const [selected, setSelected] = useState<OfferType | null>(null)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPromotionAction,
    { ok: false }
  )
  const active = OFFER_TYPES.find((o) => o.type === selected)

  return (
    <div className="space-y-6">
      {/* breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-[color:var(--text-tertiary)]">
        <Link href="/marketing" className="hover:text-accent-600">
          التسويق
        </Link>
        <CaretLeft size={13} />
        <Link href="/marketing/offers" className="hover:text-accent-600">
          العروض الخاصة
        </Link>
        <CaretLeft size={13} />
        <span className="text-[color:var(--text-secondary)]">عرض جديد</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-[color:var(--text-primary)]">ابدأ إنشاء عرضك الترويجي</h1>
        <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">اختر نوع العرض المناسب لمتجرك</p>
      </div>

      {/* type picker cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {OFFER_TYPES.map((o) => {
          const isActive = selected === o.type
          return (
            <button
              key={o.type}
              type="button"
              onClick={() => setSelected(o.type)}
              className={`group flex flex-col items-start gap-3 rounded-2xl border p-5 text-start transition-all ${
                isActive
                  ? 'border-accent-500 bg-accent-500/[0.04] shadow-sm ring-1 ring-accent-500'
                  : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-md'
              }`}
            >
              <div className={`flex size-12 items-center justify-center rounded-xl ${o.tint}`}>
                {o.icon}
              </div>
              <div>
                <div className="font-semibold text-[color:var(--text-primary)]">{o.title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--text-tertiary)]">
                  {o.desc}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* config form for the chosen type */}
      {active && (
        <form
          action={formAction}
          className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5"
        >
          <input type="hidden" name="offerType" value={active.type} />
          <div className="mb-4 flex items-center gap-2">
            <div className={`flex size-9 items-center justify-center rounded-lg ${active.tint}`}>
              {active.icon}
            </div>
            <h2 className="text-base font-semibold text-[color:var(--text-primary)]">
              إعداد: {active.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">
                اسم العرض<span className="text-danger-600"> *</span>
              </Label>
              <Input id="name" name="name" required placeholder="عرض اليوم الوطني" />
            </div>

            <TypeFields type={active.type} />

            <div>
              <Label htmlFor="startsAt">تاريخ البداية</Label>
              <Input id="startsAt" name="startsAt" type="date" />
            </div>
            <div>
              <Label htmlFor="expiresAt">تاريخ الانتهاء</Label>
              <Input id="expiresAt" name="expiresAt" type="date" />
            </div>
          </div>

          {state.error && (
            <p className="mt-4 rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600">
              {state.error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
              رجوع
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'جارٍ الحفظ…' : 'حفظ العرض'}
              <ArrowRight size={16} weight="bold" />
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function TypeFields({ type }: { type: OfferType }) {
  switch (type) {
    case 'product_discount':
      return (
        <>
          <div>
            <Label htmlFor="discountType">نوع الخصم</Label>
            <select
              id="discountType"
              name="discountType"
              defaultValue="percentage"
              className="mt-1 h-9 w-full rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] px-3 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent-500"
            >
              <option value="percentage">نسبة مئوية (%)</option>
              <option value="fixed">مبلغ ثابت (ر.س)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="value">قيمة الخصم *</Label>
            <Input id="value" name="value" type="number" step="any" required placeholder="10" />
          </div>
        </>
      )
    case 'fixed_price':
      return (
        <>
          <div>
            <Label htmlFor="minQty">الكمية المطلوبة *</Label>
            <Input id="minQty" name="minQty" type="number" required placeholder="3" />
          </div>
          <div>
            <Label htmlFor="specialPrice">السعر الخاص (ر.س) *</Label>
            <Input id="specialPrice" name="specialPrice" type="number" step="any" required placeholder="100" />
          </div>
        </>
      )
    case 'quantity_tiers':
      return (
        <>
          <div>
            <Label htmlFor="tierMinQty">تبدأ من كمية *</Label>
            <Input id="tierMinQty" name="tierMinQty" type="number" required placeholder="5" />
          </div>
          <div>
            <Label htmlFor="tierDiscountPct">نسبة الخصم (%) *</Label>
            <Input id="tierDiscountPct" name="tierDiscountPct" type="number" step="any" required placeholder="15" />
          </div>
        </>
      )
    case 'buy_x_get_y':
      return (
        <>
          <div>
            <Label htmlFor="buyQty">يشتري كمية *</Label>
            <Input id="buyQty" name="buyQty" type="number" required placeholder="2" />
          </div>
          <div>
            <Label htmlFor="getQty">يحصل على كمية *</Label>
            <Input id="getQty" name="getQty" type="number" required placeholder="1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="getDiscountPct">خصم المنتج المجاني (% — 100 = مجاناً)</Label>
            <Input id="getDiscountPct" name="getDiscountPct" type="number" step="any" defaultValue={100} />
          </div>
        </>
      )
    case 'loyalty_tier':
      return (
        <>
          <div>
            <Label htmlFor="tier">فئة الولاء</Label>
            <select
              id="tier"
              name="tier"
              defaultValue="silver"
              className="mt-1 h-9 w-full rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] px-3 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent-500"
            >
              <option value="bronze">برونزية</option>
              <option value="silver">فضية</option>
              <option value="gold">ذهبية</option>
              <option value="diamond">ماسية</option>
            </select>
          </div>
          <div>
            <Label htmlFor="loyaltyDiscountPct">نسبة الخصم (%) *</Label>
            <Input id="loyaltyDiscountPct" name="loyaltyDiscountPct" type="number" step="any" required placeholder="30" />
          </div>
        </>
      )
    case 'bank_offer':
      return (
        <>
          <div>
            <Label htmlFor="bankName">اسم البنك *</Label>
            <Input id="bankName" name="bankName" required placeholder="الراجحي" />
          </div>
          <div>
            <Label htmlFor="bankDiscountPct">نسبة الخصم (%) *</Label>
            <Input id="bankDiscountPct" name="bankDiscountPct" type="number" step="any" required placeholder="10" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="bankMinOrder">أقل مبلغ للطلب (ر.س — اختياري)</Label>
            <Input id="bankMinOrder" name="bankMinOrder" type="number" step="any" placeholder="500" />
          </div>
        </>
      )
    case 'cashback':
      return (
        <>
          <div>
            <Label htmlFor="cashbackPct">نسبة الكاش باك (%) *</Label>
            <Input id="cashbackPct" name="cashbackPct" type="number" step="any" required placeholder="5" />
          </div>
          <div>
            <Label htmlFor="maxCashback">أقصى مبلغ كاش باك (ر.س — اختياري)</Label>
            <Input id="maxCashback" name="maxCashback" type="number" step="any" placeholder="30" />
          </div>
        </>
      )
  }
}
