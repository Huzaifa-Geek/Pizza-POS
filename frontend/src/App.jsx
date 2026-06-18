import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const PKR = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
})

const APP_BRAND = {
  productName: 'Pizza POS',
  shopName: 'Your Pizza Shop',
  tagline: 'Fast ordering, kitchen tickets, shifts, and daily reports.',
}

const productDefaults = {
  name: '',
  category: 'Pizza',
  price: '',
  description: '',
  isActive: true,
}

function getProductForm(product = productDefaults) {
  return {
    name: product.name ?? '',
    category: product.category ?? 'Pizza',
    price: product.price ?? '',
    description: product.description ?? '',
    isActive: Boolean(product.isActive),
  }
}

const dealDefaults = {
  name: '',
  price: '',
  isActive: true,
  items: [],
}

function getDealForm(deal = dealDefaults) {
  return {
    name: deal.name ?? '',
    price: deal.price ?? '',
    isActive: deal.isActive ?? true,
    items: (deal.items ?? []).map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity) || 1,
    })),
  }
}

const orderDefaults = {
  orderType: 'Hall',
  tableNumber: 'Table 1',
  customerName: '',
  phoneNumber: '',
  address: '',
  paymentType: 'Cash',
  discountPercent: '',
  discountAmount: '',
  deliveryCharge: '',
  notes: '',
}

const bootstrapDefaults = {
  products: [],
  deals: [],
  activeShift: null,
  dashboard: {
    startCash: 0,
    cashSales: 0,
    onlineSales: 0,
    pendingSales: 0,
    expenses: 0,
    expectedClosingCash: 0,
    orderCount: 0,
  },
  recentOrders: [],
  report: {
    date: new Date().toISOString().slice(0, 10),
    totalOrders: 0,
    cashSales: 0,
    onlineSales: 0,
    pendingSales: 0,
    totalExpenses: 0,
    expectedClosingCash: 0,
    actualClosingCash: 0,
    difference: 0,
  },
  latestKot: null,
  categories: [],
}

function money(value) {
  return PKR.format(Number(value || 0))
}

async function request(path, options = {}) {
  const apiBase = window.location.protocol === 'file:' ? 'http://localhost:3001/api' : '/api'
  const response = await fetch(`${apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Request failed')
  }

  return data
}

function Metric({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'border-white/10 bg-white/5',
    green: 'border-emerald-400/25 bg-emerald-500/10',
    amber: 'border-amber-400/25 bg-amber-500/10',
    rose: 'border-rose-400/25 bg-rose-500/10',
  }

  return (
    <div className={`rounded-3xl border p-4 shadow-lg shadow-black/10 ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-[0.3em] text-slate-300">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}

function Panel({ title, subtitle, children, action }) {
  return (
    <section className="rounded-[2rem] border border-slate-900/70 bg-slate-950/80 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
        active
          ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
          : 'bg-white/5 text-slate-300 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}

function App() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [bootstrap, setBootstrap] = useState(bootstrapDefaults)
  const [activeTab, setActiveTab] = useState('pos')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [productSearch, setProductSearch] = useState('')
  const [cart, setCart] = useState([])
  const [productForm, setProductForm] = useState(productDefaults)
  const [editingProductId, setEditingProductId] = useState(null)
  const [dealForm, setDealForm] = useState(dealDefaults)
  const [editingDealId, setEditingDealId] = useState(null)
  const [orderMeta, setOrderMeta] = useState(orderDefaults)
  const [startCash, setStartCash] = useState('5000')
  const [expenseForm, setExpenseForm] = useState({ name: '', amount: '', note: '' })
  const [closeCash, setCloseCash] = useState('')
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))
  const [orderSearch, setOrderSearch] = useState('')
  const [searchedOrders, setSearchedOrders] = useState([])
  const [selectedReceipt, setSelectedReceipt] = useState(null)
  const [latestKot, setLatestKot] = useState(null)
  const [closingResult, setClosingResult] = useState(null)

  const loadBootstrap = async (date = reportDate) => {
    setLoading(true)
    setError('')
    try {
      const data = await request(`/bootstrap?date=${date}`)
      setBootstrap(data)
      setLatestKot(data.latestKot ?? null)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBootstrap()
  }, [])

  useEffect(() => {
    setSearchedOrders(bootstrap.recentOrders)
  }, [bootstrap.recentOrders])

  const activeProducts = useMemo(
    () => bootstrap.products.filter((product) => product.isActive),
    [bootstrap.products],
  )

  const visibleProducts = useMemo(() => {
    const categoryFiltered = selectedCategory === 'All'
      ? activeProducts
      : activeProducts.filter((product) => product.category === selectedCategory)

    const query = productSearch.trim().toLowerCase()
    if (!query) {
      return categoryFiltered
    }

    return categoryFiltered.filter((product) =>
      `${product.name} ${product.category} ${product.description || ''}`.toLowerCase().includes(query),
    )
  }, [activeProducts, selectedCategory, productSearch])

  const visibleDeals = useMemo(() => {
    const query = productSearch.trim().toLowerCase()
    const activeDeals = bootstrap.deals.filter((deal) => deal.isActive)

    if (!query) {
      return activeDeals
    }

    return activeDeals.filter((deal) =>
      `${deal.name} ${deal.items.map((item) => item.productName).join(' ')}`.toLowerCase().includes(query),
    )
  }, [bootstrap.deals, productSearch])

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.total, 0),
    [cart],
  )

  const numericDiscountPercent = Number(orderMeta.discountPercent || 0)
  const numericDiscountAmount = Number(orderMeta.discountAmount || 0)
  const numericDeliveryCharge = Number(orderMeta.deliveryCharge || 0)
  const effectiveDiscountAmount = Math.min(
    orderMeta.discountPercent !== ''
      ? (cartTotal * numericDiscountPercent) / 100
      : numericDiscountAmount,
    cartTotal,
  )
  const payableTotal = Math.max(0, cartTotal - effectiveDiscountAmount + numericDeliveryCharge)

  const chartData = useMemo(
    () => [
      { name: 'Cash', value: bootstrap.dashboard.cashSales },
      { name: 'Online', value: bootstrap.dashboard.onlineSales },
      { name: 'Pending', value: bootstrap.dashboard.pendingSales },
      { name: 'Expenses', value: bootstrap.dashboard.expenses },
    ],
    [bootstrap.dashboard],
  )

  const categories = ['All', ...bootstrap.categories]

  const resetProductEditor = () => {
    setEditingProductId(null)
    setProductForm(getProductForm())
  }

  const resetDealEditor = () => {
    setEditingDealId(null)
    setDealForm(getDealForm())
  }

  const addItem = (source, itemType) => {
    setCart((current) => {
      const existing = current.find((item) => item.id === source.id && item.itemType === itemType)
      if (existing) {
        return current.map((item) =>
          item.id === source.id && item.itemType === itemType
            ? {
                ...item,
                quantity: item.quantity + 1,
                total: (item.quantity + 1) * item.unitPrice,
              }
            : item,
        )
      }

      return [
        ...current,
        {
          id: source.id,
          itemType,
          name: source.name,
          unitPrice: Number(source.price),
          quantity: 1,
          total: Number(source.price),
        },
      ]
    })
  }

  const updateItemQuantity = (id, itemType, delta) => {
    setCart((current) =>
      current
        .map((item) => {
          if (item.id !== id || item.itemType !== itemType) {
            return item
          }
          const quantity = item.quantity + delta
          return { ...item, quantity, total: quantity * item.unitPrice }
        })
        .filter((item) => item.quantity > 0),
    )
  }

  const removeItem = (id, itemType) => {
    setCart((current) => current.filter((item) => item.id !== id || item.itemType !== itemType))
  }

  const updateDiscountPercent = (value) => {
    const percent = value === '' ? '' : Math.max(0, Number(value) || 0)
    const amount = value === '' ? '' : ((cartTotal * percent) / 100).toFixed(0)
    setOrderMeta((current) => ({
      ...current,
      discountPercent: value === '' ? '' : String(percent),
      discountAmount: amount,
    }))
  }

  const updateDiscountAmount = (value) => {
    const amount = value === '' ? '' : Math.max(0, Number(value) || 0)
    const percent = value === '' || cartTotal <= 0 ? '' : ((amount / cartTotal) * 100).toFixed(2)
    setOrderMeta((current) => ({
      ...current,
      discountAmount: value === '' ? '' : String(amount),
      discountPercent: percent,
    }))
  }

  useEffect(() => {
    if (orderMeta.discountPercent === '') {
      return
    }

    const recalculatedAmount = ((cartTotal * Number(orderMeta.discountPercent || 0)) / 100).toFixed(0)
    setOrderMeta((current) =>
      current.discountAmount === recalculatedAmount
        ? current
        : { ...current, discountAmount: recalculatedAmount },
    )
  }, [cartTotal, orderMeta.discountPercent])

  async function runSaving(action) {
    setSaving(true)
    setError('')
    try {
      await action()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  const submitProduct = async (event) => {
    event.preventDefault()
    await runSaving(async () => {
      await request(editingProductId ? `/products/${editingProductId}` : '/products', {
        method: editingProductId ? 'PUT' : 'POST',
        body: JSON.stringify(productForm),
      })
      resetProductEditor()
      await loadBootstrap(reportDate)
    })
  }

  const editProduct = (product) => {
    setEditingProductId(product.id)
    setProductForm(getProductForm(product))
  }

  const deleteProduct = async (productId) => {
    if (!window.confirm('Delete this product from the menu?')) {
      return
    }

    await runSaving(async () => {
      await request(`/products/${productId}`, { method: 'DELETE' })
      if (editingProductId === productId) {
        resetProductEditor()
      }
      await loadBootstrap(reportDate)
    })
  }

  const toggleDealProduct = (productId) => {
    setDealForm((current) => {
      const exists = current.items.find((item) => item.productId === productId)
      if (exists) {
        return {
          ...current,
          items: current.items.filter((item) => item.productId !== productId),
        }
      }
      return {
        ...current,
        items: [...current.items, { productId, quantity: 1 }],
      }
    })
  }

  const changeDealProductQty = (productId, value) => {
    setDealForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.productId === productId ? { ...item, quantity: Number(value) || 1 } : item,
      ),
    }))
  }

  const submitDeal = async (event) => {
    event.preventDefault()
    await runSaving(async () => {
      await request(editingDealId ? `/deals/${editingDealId}` : '/deals', {
        method: editingDealId ? 'PUT' : 'POST',
        body: JSON.stringify(dealForm),
      })
      resetDealEditor()
      await loadBootstrap(reportDate)
    })
  }

  const editDeal = (deal) => {
    setEditingDealId(deal.id)
    setDealForm(getDealForm(deal))
  }

  const deleteDeal = async (dealId) => {
    if (!window.confirm('Delete this deal from the POS buttons?')) {
      return
    }

    await runSaving(async () => {
      await request(`/deals/${dealId}`, { method: 'DELETE' })
      if (editingDealId === dealId) {
        resetDealEditor()
      }
      await loadBootstrap(reportDate)
    })
  }

  const submitShiftStart = async (event) => {
    event.preventDefault()
    await runSaving(async () => {
      await request('/shifts/start', {
        method: 'POST',
        body: JSON.stringify({ startCash }),
      })
      await loadBootstrap(reportDate)
    })
  }

  const submitExpense = async (event) => {
    event.preventDefault()
    await runSaving(async () => {
      await request('/expenses', {
        method: 'POST',
        body: JSON.stringify(expenseForm),
      })
      setExpenseForm({ name: '', amount: '', note: '' })
      await loadBootstrap(reportDate)
    })
  }

  const submitOrder = async () => {
    if (!cart.length) {
      setError('Add at least one product or deal to the cart.')
      return
    }

    await runSaving(async () => {
      const result = await request('/orders', {
        method: 'POST',
        body: JSON.stringify({
          ...orderMeta,
          discountAmount: effectiveDiscountAmount,
          deliveryCharge: numericDeliveryCharge,
          items: cart,
        }),
      })
      setLatestKot(result.kot)
      setCart([])
      setOrderMeta(orderDefaults)
      await loadBootstrap(reportDate)
    })
  }

  const submitShiftClose = async (event) => {
    event.preventDefault()
    await runSaving(async () => {
      const result = await request('/shifts/close', {
        method: 'POST',
        body: JSON.stringify({ actualCash: closeCash }),
      })
      setClosingResult(result)
      setCloseCash('')
      await loadBootstrap(reportDate)
    })
  }

  const searchOrders = async () => {
    await runSaving(async () => {
      const results = await request(`/orders?q=${encodeURIComponent(orderSearch)}`)
      setSearchedOrders(results)
    })
  }

  const openReceipt = async (orderId) => {
    await runSaving(async () => {
      const receipt = await request(`/orders/${orderId}/receipt`)
      setSelectedReceipt(receipt)
    })
  }

  const printReceipt = () => {
    if (!selectedReceipt) {
      return
    }

    const lineItems = selectedReceipt.items
      .map(
        (item) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #ddd;">${item.name}</td>
            <td style="padding:8px 0;border-bottom:1px solid #ddd;text-align:center;">${item.quantity}</td>
            <td style="padding:8px 0;border-bottom:1px solid #ddd;text-align:right;">${money(item.unitPrice)}</td>
            <td style="padding:8px 0;border-bottom:1px solid #ddd;text-align:right;">${money(item.total)}</td>
          </tr>
        `,
      )
      .join('')

    const popup = window.open('', '_blank', 'width=420,height=720')
    if (!popup) {
      return
    }

    popup.document.write(`
      <html>
        <head>
          <title>Receipt #${selectedReceipt.orderNumber}</title>
        </head>
        <body style="font-family:Segoe UI,Tahoma,sans-serif;padding:24px;color:#111;">
          <h1 style="margin:0 0 6px;">${selectedReceipt.shop.name}</h1>
          <p style="margin:0 0 18px;">Receipt #${selectedReceipt.orderNumber}</p>
          <p style="margin:0 0 8px;">${new Date(selectedReceipt.createdAt).toLocaleString()}</p>
          <p style="margin:0 0 8px;">Order Type: ${selectedReceipt.orderType}${selectedReceipt.tableNumber ? ` - ${selectedReceipt.tableNumber}` : ''}</p>
          <p style="margin:0 0 18px;">Payment: ${selectedReceipt.paymentType}</p>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #111;">Item</th>
                <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #111;">Qty</th>
                <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #111;">Price</th>
                <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #111;">Total</th>
              </tr>
            </thead>
            <tbody>${lineItems}</tbody>
          </table>
          <p style="margin:18px 0 0;text-align:right;">Subtotal: ${money(selectedReceipt.subtotal)}</p>
          <p style="margin:8px 0 0;text-align:right;">Discount: -${money(selectedReceipt.discountAmount)}</p>
          <p style="margin:8px 0 0;text-align:right;">Delivery Charge: +${money(selectedReceipt.deliveryCharge)}</p>
          <p style="margin:8px 0 0;text-align:right;font-size:22px;font-weight:700;">Total: ${money(selectedReceipt.total)}</p>
          ${selectedReceipt.notes ? `<p style="margin-top:18px;">Notes: ${selectedReceipt.notes}</p>` : ''}
        </body>
      </html>
    `)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  const printKot = () => {
    if (!latestKot) {
      return
    }

    const items = latestKot.items
      .map(
        (item) => `
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #ddd;">
            <span>${item.name}</span>
            <strong>${item.quantity}x</strong>
          </div>
        `,
      )
      .join('')

    const popup = window.open('', '_blank', 'width=420,height=720')
    if (!popup) {
      return
    }

    popup.document.write(`
      <html>
        <head>
          <title>KOT #${latestKot.orderNumber}</title>
        </head>
        <body style="font-family:Segoe UI,Tahoma,sans-serif;padding:24px;color:#111;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;">Kitchen Order Ticket</p>
          <h1 style="margin:0 0 16px;">KOT #${latestKot.orderNumber}</h1>
          <p style="margin:0 0 8px;">${latestKot.orderType}${latestKot.tableNumber ? ` - ${latestKot.tableNumber}` : ''}</p>
          <p style="margin:0 0 18px;">${new Date(latestKot.createdAt).toLocaleString()}</p>
          <div>${items}</div>
          ${latestKot.notes ? `<p style="margin-top:18px;"><strong>Notes:</strong> ${latestKot.notes}</p>` : ''}
        </body>
      </html>
    `)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.32),_transparent_32%),linear-gradient(180deg,_#1a0f09_0%,_#111827_42%,_#020617_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col gap-5 px-4 py-5 md:px-6 xl:px-8">
        <header className="rounded-[2rem] border border-orange-200/10 bg-black/25 p-5 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-orange-300">{APP_BRAND.productName}</p>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">
                {APP_BRAND.shopName}
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
                {APP_BRAND.tagline}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:w-[720px]">
              <Metric label="Start Cash" value={money(bootstrap.dashboard.startCash)} />
              <Metric label="Cash Sales" value={money(bootstrap.dashboard.cashSales)} tone="green" />
              <Metric label="Online Sales" value={money(bootstrap.dashboard.onlineSales)} />
              <Metric label="Pending Sales" value={money(bootstrap.dashboard.pendingSales)} tone="amber" />
              <Metric label="Expenses" value={money(bootstrap.dashboard.expenses)} tone="rose" />
              <Metric label="Expected Closing Cash" value={money(bootstrap.dashboard.expectedClosingCash)} tone="green" />
            </div>
          </div>
        </header>

        <div className="sticky top-3 z-30 rounded-[2rem] border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/20 backdrop-blur">
          <div className="flex flex-wrap gap-3">
            <TabButton active={activeTab === 'pos'} onClick={() => setActiveTab('pos')}>
              POS
            </TabButton>
            <TabButton active={activeTab === 'kot'} onClick={() => setActiveTab('kot')}>
              KOT
            </TabButton>
            <TabButton active={activeTab === 'orders'} onClick={() => setActiveTab('orders')}>
              Orders & Reports
            </TabButton>
            <TabButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')}>
              Admin
            </TabButton>
            <TabButton active={activeTab === 'shift'} onClick={() => setActiveTab('shift')}>
              Shift
            </TabButton>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {activeTab === 'pos' ? (
          <Panel
            title="POS Order Screen"
            subtitle="Large buttons on the left, cart and checkout on the right."
            action={
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      selectedCategory === category
                        ? 'bg-orange-500 text-white'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            }
          >
            <div className="grid gap-5 2xl:grid-cols-[1.3fr_0.95fr]">
              <div className="space-y-5">
                <div>
                  <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Products</p>
                    <label className="w-full max-w-sm text-sm text-slate-300">
                      <span className="mb-2 block">Search Items</span>
                      <input
                        value={productSearch}
                        onChange={(event) => setProductSearch(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none"
                        placeholder="Search pizza, burger, drink..."
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addItem(product, 'product')}
                        className="rounded-3xl border border-white/10 bg-white/5 p-4 text-left transition hover:-translate-y-0.5 hover:bg-orange-500/15"
                      >
                        <p className="text-lg font-semibold text-white">{product.name}</p>
                        <p className="mt-1 text-sm text-slate-400">{product.category}</p>
                        <p className="mt-4 text-xl font-semibold text-orange-300">{money(product.price)}</p>
                      </button>
                    ))}
                  </div>
                  {!visibleProducts.length ? (
                    <div className="mt-3 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-slate-400">
                      No products match that search.
                    </div>
                  ) : null}
                </div>

                  <div>
                    <p className="mb-3 text-sm uppercase tracking-[0.25em] text-slate-400">Deals / Combo Buttons</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                    {visibleDeals.map((deal) => (
                      <button
                        key={deal.id}
                        type="button"
                        onClick={() => addItem(deal, 'deal')}
                        className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-4 text-left transition hover:bg-amber-400/20"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-white">{deal.name}</p>
                            <p className="mt-2 text-sm text-slate-300">
                              {deal.items.map((item) => `${item.quantity}x ${item.productName}`).join(' + ')}
                            </p>
                          </div>
                          <p className="text-lg font-semibold text-amber-200">{money(deal.price)}</p>
                        </div>
                      </button>
                    ))}
                    </div>
                    {!visibleDeals.length ? (
                      <div className="mt-3 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-slate-400">
                        No deals match that search.
                      </div>
                    ) : null}
                  </div>
              </div>

              <div className="rounded-[1.75rem] border border-white/10 bg-slate-900/90 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-white">Cart</h3>
                  <p className="text-sm text-slate-400">{cart.length} item(s)</p>
                </div>

                <div className="mt-4 space-y-3">
                  {cart.length ? (
                    cart.map((item) => (
                      <div key={`${item.itemType}-${item.id}`} className="rounded-2xl border border-white/8 bg-white/5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-white">{item.name}</p>
                            <p className="text-sm capitalize text-slate-400">{item.itemType}</p>
                          </div>
                          <button type="button" className="text-sm text-rose-300" onClick={() => removeItem(item.id, item.itemType)}>
                            Remove
                          </button>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button type="button" className="h-9 w-9 rounded-full bg-white/10 text-lg" onClick={() => updateItemQuantity(item.id, item.itemType, -1)}>
                              -
                            </button>
                            <span className="w-8 text-center font-semibold">{item.quantity}</span>
                            <button type="button" className="h-9 w-9 rounded-full bg-white/10 text-lg" onClick={() => updateItemQuantity(item.id, item.itemType, 1)}>
                              +
                            </button>
                          </div>
                          <p className="font-semibold text-orange-200">{money(item.total)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-slate-400">
                      Tap products or deals to build the order.
                    </div>
                  )}
                </div>

                  <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-2 text-sm text-slate-300">
                      <span>Order Type</span>
                      <select
                        value={orderMeta.orderType}
                        onChange={(event) => setOrderMeta((current) => ({ ...current, orderType: event.target.value }))}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none"
                      >
                        <option>Hall</option>
                        <option>Takeaway</option>
                        <option>Delivery</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span>Payment Type</span>
                      <select
                        value={orderMeta.paymentType}
                        onChange={(event) => setOrderMeta((current) => ({ ...current, paymentType: event.target.value }))}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none"
                      >
                        <option>Cash</option>
                        <option>Online</option>
                        <option>Pending</option>
                      </select>
                    </label>
                  </div>

                  {orderMeta.orderType === 'Hall' ? (
                    <label className="space-y-2 text-sm text-slate-300">
                      <span>Table Number</span>
                      <select
                        value={orderMeta.tableNumber}
                        onChange={(event) => setOrderMeta((current) => ({ ...current, tableNumber: event.target.value }))}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none"
                      >
                        <option>Table 1</option>
                        <option>Table 2</option>
                        <option>Table 3</option>
                        <option>Table 4</option>
                        <option>Table 5</option>
                      </select>
                    </label>
                  ) : null}

                  {orderMeta.orderType === 'Delivery' ? (
                    <div className="grid gap-3">
                      <input value={orderMeta.customerName} onChange={(event) => setOrderMeta((current) => ({ ...current, customerName: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" placeholder="Customer name" />
                      <input value={orderMeta.phoneNumber} onChange={(event) => setOrderMeta((current) => ({ ...current, phoneNumber: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" placeholder="Phone number" />
                      <textarea value={orderMeta.address} onChange={(event) => setOrderMeta((current) => ({ ...current, address: event.target.value }))} className="min-h-24 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" placeholder="Address" />
                    </div>
                  ) : null}

                    <textarea value={orderMeta.notes} onChange={(event) => setOrderMeta((current) => ({ ...current, notes: event.target.value }))} className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" placeholder="Special notes for kitchen" />

                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="space-y-2 text-sm text-slate-300">
                        <span>Discount %</span>
                        <input
                          type="number"
                          min="0"
                          value={orderMeta.discountPercent}
                          onChange={(event) => updateDiscountPercent(event.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none"
                          placeholder="0"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-slate-300">
                        <span>Discount PKR</span>
                        <input
                          type="number"
                          min="0"
                          value={orderMeta.discountAmount}
                          onChange={(event) => updateDiscountAmount(event.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none"
                          placeholder="0"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-slate-300">
                        <span>Delivery Charge</span>
                        <input
                          type="number"
                          min="0"
                          value={orderMeta.deliveryCharge}
                          onChange={(event) => setOrderMeta((current) => ({ ...current, deliveryCharge: event.target.value }))}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none"
                          placeholder="0"
                        />
                      </label>
                    </div>

                    <div className="rounded-2xl bg-white/5 p-4">
                      <div className="flex items-center justify-between text-sm text-slate-300">
                        <span>Subtotal</span>
                        <span>{money(cartTotal)}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm text-slate-300">
                        <span>Discount</span>
                        <span>- {money(effectiveDiscountAmount)}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm text-slate-300">
                        <span>Delivery Charge</span>
                        <span>+ {money(numericDeliveryCharge)}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xl font-semibold text-white">
                        <span>Total</span>
                        <span>{money(payableTotal)}</span>
                      </div>
                    </div>

                  <button
                    type="button"
                    onClick={submitOrder}
                    disabled={saving || !bootstrap.activeShift}
                    className="w-full rounded-2xl bg-orange-500 px-5 py-4 text-base font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                  >
                    Place Order and Generate KOT
                  </button>
                </div>
              </div>
            </div>
          </Panel>
        ) : null}

        {activeTab === 'admin' ? (
          <div className="space-y-5">
            <Panel
              title="Admin Setup"
              subtitle="Add, edit, delete menu items and create combo deals for the POS buttons."
            >
              <div className="grid gap-5 xl:grid-cols-[1.15fr_0.95fr]">
                <form onSubmit={submitProduct} className="space-y-3 rounded-3xl border border-white/8 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white">{editingProductId ? 'Edit Product' : 'Add Product'}</h3>
                    {editingProductId ? (
                      <button type="button" onClick={resetProductEditor} className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white">
                        Cancel
                      </button>
                    ) : null}
                  </div>
                  <input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" placeholder="Product name" />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" placeholder="Category" />
                    <input type="number" min="0" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" placeholder="Price in PKR" />
                  </div>
                  <textarea value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} className="min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" placeholder="Optional description" />
                  <label className="flex items-center gap-3 text-sm text-slate-300">
                    <input type="checkbox" checked={productForm.isActive} onChange={(event) => setProductForm((current) => ({ ...current, isActive: event.target.checked }))} />
                    Active product
                  </label>
                  <button className="rounded-2xl bg-orange-500 px-4 py-3 font-semibold text-white" disabled={saving}>
                    {editingProductId ? 'Update Product' : 'Save Product'}
                  </button>

                  <div className="space-y-3 border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm uppercase tracking-[0.3em] text-slate-400">Manage Products</h4>
                      <span className="text-sm text-slate-500">{bootstrap.products.length} total</span>
                    </div>
                    <div className="max-h-80 space-y-2 overflow-auto">
                      {bootstrap.products.map((product) => (
                        <div key={product.id} className="rounded-2xl border border-white/8 bg-slate-950/60 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-white">{product.name}</p>
                              <p className="text-sm text-slate-400">
                                {product.category} · {money(product.price)} · {product.isActive ? 'Active' : 'Inactive'}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => editProduct(product)} className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white">
                                Edit
                              </button>
                              <button type="button" onClick={() => deleteProduct(product.id)} className="rounded-xl bg-rose-500/20 px-3 py-2 text-sm text-rose-200">
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </form>

                <form onSubmit={submitDeal} className="space-y-3 rounded-3xl border border-white/8 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white">{editingDealId ? 'Edit Deal' : 'Create Deal'}</h3>
                    {editingDealId ? (
                      <button type="button" onClick={resetDealEditor} className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white">
                        Cancel
                      </button>
                    ) : null}
                  </div>
                  <input value={dealForm.name} onChange={(event) => setDealForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" placeholder="Deal name" />
                  <input type="number" min="0" value={dealForm.price} onChange={(event) => setDealForm((current) => ({ ...current, price: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" placeholder="Deal price in PKR" />
                  <label className="flex items-center gap-3 text-sm text-slate-300">
                    <input type="checkbox" checked={Boolean(dealForm.isActive)} onChange={(event) => setDealForm((current) => ({ ...current, isActive: event.target.checked }))} />
                    Active deal button
                  </label>
                  <div className="max-h-56 space-y-2 overflow-auto rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                    {activeProducts.map((product) => {
                      const selected = dealForm.items.find((item) => item.productId === product.id)
                      return (
                        <div key={product.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 p-3">
                          <label className="flex items-center gap-3 text-sm text-slate-200">
                            <input type="checkbox" checked={Boolean(selected)} onChange={() => toggleDealProduct(product.id)} />
                            <span>{product.name}</span>
                          </label>
                          {selected ? (
                            <input type="number" min="1" value={selected.quantity} onChange={(event) => changeDealProductQty(product.id, event.target.value)} className="w-20 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 outline-none" />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  <button className="rounded-2xl bg-amber-500 px-4 py-3 font-semibold text-slate-950" disabled={saving}>
                    {editingDealId ? 'Update Deal' : 'Save Deal'}
                  </button>

                  <div className="space-y-3 border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm uppercase tracking-[0.3em] text-slate-400">Manage Deals</h4>
                      <span className="text-sm text-slate-500">{bootstrap.deals.length} total</span>
                    </div>
                    <div className="max-h-72 space-y-2 overflow-auto">
                      {bootstrap.deals.map((deal) => (
                        <div key={deal.id} className="rounded-2xl border border-white/8 bg-slate-950/60 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-white">{deal.name}</p>
                              <p className="text-sm text-slate-400">
                                {money(deal.price)} | {deal.isActive ? 'Active' : 'Inactive'}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {deal.items.map((item) => `${item.quantity}x ${item.productName}`).join(' + ')}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => editDeal(deal)} className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white">
                                Edit
                              </button>
                              <button type="button" onClick={() => deleteDeal(deal.id)} className="rounded-xl bg-rose-500/20 px-3 py-2 text-sm text-rose-200">
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </form>
              </div>
            </Panel>
          </div>
        ) : null}

        {activeTab === 'orders' ? (
          <Panel title="Orders and Reports" subtitle="Daily reporting, order search, and printable receipts from the same local SQLite data.">
              <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-5">
                  <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
                    <div className="mb-4 flex flex-wrap items-end gap-3">
                      <label className="min-w-[220px] flex-1 text-sm text-slate-300">
                        <span className="mb-2 block">Search Orders</span>
                        <input
                          value={orderSearch}
                          onChange={(event) => setOrderSearch(event.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none"
                          placeholder="Order #, phone, customer, payment type"
                        />
                      </label>
                      <button type="button" onClick={searchOrders} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white">
                        Search
                      </button>
                      <button type="button" onClick={() => { setOrderSearch(''); setSearchedOrders(bootstrap.recentOrders) }} className="rounded-2xl bg-slate-800 px-4 py-3 font-semibold text-white">
                        Reset
                      </button>
                    </div>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">Orders</h3>
                      <span className="text-sm text-slate-400">{searchedOrders.length} shown</span>
                    </div>
                    <div className="max-h-[34rem] space-y-3 overflow-auto">
                      {searchedOrders.map((order) => (
                        <div key={order.id} className="rounded-2xl border border-white/8 bg-slate-950/60 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-white">Order #{order.orderNumber}</p>
                            <p className="text-sm text-slate-400">{new Date(order.createdAt).toLocaleString()}</p>
                          </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-300">
                          <span>{order.orderType}</span>
                          <span>{order.paymentType}</span>
                          {order.tableNumber ? <span>{order.tableNumber}</span> : null}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-lg font-semibold text-orange-200">{money(order.total)}</p>
                          <button type="button" onClick={() => openReceipt(order.id)} className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white">
                            View Receipt
                          </button>
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">Receipt Preview</h3>
                      <button type="button" onClick={printReceipt} disabled={!selectedReceipt} className="rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300">
                        Print Receipt
                      </button>
                    </div>
                    {selectedReceipt ? (
                      <div className="rounded-3xl border border-dashed border-emerald-300/25 bg-slate-950/70 p-5">
                        <div className="border-b border-white/10 pb-4">
                          <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">{selectedReceipt.shop.name}</p>
                          <h4 className="mt-2 text-2xl font-semibold text-white">Receipt #{selectedReceipt.orderNumber}</h4>
                          <p className="mt-2 text-sm text-slate-400">{new Date(selectedReceipt.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="mt-4 grid gap-2 text-sm text-slate-300">
                          <p>Order Type: {selectedReceipt.orderType}{selectedReceipt.tableNumber ? ` - ${selectedReceipt.tableNumber}` : ''}</p>
                          <p>Payment: {selectedReceipt.paymentType}</p>
                          {selectedReceipt.customerName ? <p>Customer: {selectedReceipt.customerName}</p> : null}
                          {selectedReceipt.phoneNumber ? <p>Phone: {selectedReceipt.phoneNumber}</p> : null}
                          {selectedReceipt.address ? <p>Address: {selectedReceipt.address}</p> : null}
                        </div>
                        <div className="mt-4 space-y-3">
                          {selectedReceipt.items.map((item, index) => (
                            <div key={`${item.name}-${index}`} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                              <div>
                                <p className="font-medium text-white">{item.name}</p>
                                <p className="text-sm text-slate-400">{item.quantity} x {money(item.unitPrice)}</p>
                              </div>
                              <p className="font-semibold text-emerald-200">{money(item.total)}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 border-t border-white/10 pt-4 text-right">
                          <p className="text-sm text-slate-400">Subtotal: {money(selectedReceipt.subtotal)}</p>
                          <p className="mt-2 text-sm text-slate-400">Discount: - {money(selectedReceipt.discountAmount)}</p>
                          <p className="mt-2 text-sm text-slate-400">Delivery Charge: + {money(selectedReceipt.deliveryCharge)}</p>
                          <p className="mt-2 text-2xl font-semibold text-white">Total: {money(selectedReceipt.total)}</p>
                        </div>
                        {selectedReceipt.notes ? (
                          <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
                            <p className="mb-1 uppercase tracking-[0.25em] text-slate-400">Notes</p>
                            <p>{selectedReceipt.notes}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-slate-400">
                        Search an order or choose one from the list to preview its receipt.
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4 rounded-3xl border border-white/8 bg-white/5 p-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex-1 text-sm text-slate-300">
                      <span className="mb-2 block">Report Date</span>
                      <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" />
                    </label>
                    <button type="button" onClick={() => loadBootstrap(reportDate)} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white">
                      Refresh
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Metric label="Total Orders" value={String(bootstrap.report.totalOrders)} />
                    <Metric label="Cash Sales" value={money(bootstrap.report.cashSales)} tone="green" />
                    <Metric label="Online Sales" value={money(bootstrap.report.onlineSales)} />
                    <Metric label="Pending Sales" value={money(bootstrap.report.pendingSales)} tone="amber" />
                    <Metric label="Expenses" value={money(bootstrap.report.totalExpenses)} tone="rose" />
                    <Metric label="Difference" value={money(bootstrap.report.difference)} tone="amber" />
                  </div>
                  <div className="h-64 rounded-3xl border border-white/8 bg-slate-950/60 p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="name" stroke="#cbd5e1" />
                        <YAxis stroke="#cbd5e1" />
                        <Tooltip formatter={(value) => money(value)} contentStyle={{ background: '#020617', border: '1px solid #334155' }} />
                        <Bar dataKey="value" fill="#f97316" radius={[12, 12, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
          </Panel>
        ) : null}

        {activeTab === 'shift' ? (
          <Panel
            title="Shift Controls"
            subtitle={
              bootstrap.activeShift
                ? `Shift opened at ${new Date(bootstrap.activeShift.opened_at).toLocaleString()}`
                : 'Open the shift before billing starts.'
            }
          >
              <form onSubmit={submitShiftStart} className="space-y-3 rounded-3xl border border-white/8 bg-white/5 p-4">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Enter Start Cash</span>
                  <input type="number" min="0" value={startCash} onChange={(event) => setStartCash(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" />
                </label>
                <button disabled={saving || Boolean(bootstrap.activeShift)} className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300">
                  Start Shift
                </button>
              </form>

              <form onSubmit={submitExpense} className="mt-4 space-y-3 rounded-3xl border border-white/8 bg-white/5 p-4">
                <h3 className="text-lg font-semibold text-white">Expense Management</h3>
                <input value={expenseForm.name} onChange={(event) => setExpenseForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" placeholder="Expense name" />
                <input type="number" min="0" value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" placeholder="Amount in PKR" />
                <textarea value={expenseForm.note} onChange={(event) => setExpenseForm((current) => ({ ...current, note: event.target.value }))} className="min-h-20 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" placeholder="Note" />
                <button disabled={saving || !bootstrap.activeShift} className="w-full rounded-2xl bg-rose-400 px-4 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300">
                  Add Expense
                </button>
              </form>

              <form onSubmit={submitShiftClose} className="mt-4 space-y-3 rounded-3xl border border-white/8 bg-white/5 p-4">
                <h3 className="text-lg font-semibold text-white">Close Shift</h3>
                <div className="rounded-2xl bg-slate-950/80 p-4">
                  <p className="text-sm text-slate-400">Expected Cash</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{money(bootstrap.dashboard.expectedClosingCash)}</p>
                </div>
                <input type="number" min="0" value={closeCash} onChange={(event) => setCloseCash(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" placeholder="Actual cash in drawer" />
                <button disabled={saving || !bootstrap.activeShift} className="w-full rounded-2xl bg-amber-400 px-4 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300">
                  Close Shift
                </button>
              </form>

              {closingResult ? (
                <div className="mt-4 rounded-3xl border border-white/8 bg-white/5 p-4">
                  <h3 className="text-lg font-semibold text-white">Closing Result</h3>
                  <div className="mt-3 grid gap-3">
                    <Metric label="Expected Cash" value={money(closingResult.expectedCash)} />
                    <Metric label="Actual Cash" value={money(closingResult.actualCash)} />
                    <Metric label="Difference" value={money(closingResult.difference)} tone="amber" />
                  </div>
                  <p className="mt-4 text-sm uppercase tracking-[0.3em] text-orange-200">{closingResult.status}</p>
                </div>
              ) : null}
          </Panel>
        ) : null}

        {activeTab === 'kot' ? (
          <div className="space-y-5">
            <Panel
              title="Kitchen Order Ticket"
              subtitle="Latest placed order appears here for kitchen use and printing."
              action={
                <button type="button" onClick={printKot} className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white">
                  Print KOT
                </button>
              }
            >
              {latestKot ? (
                <div className="rounded-[1.75rem] border border-dashed border-orange-300/30 bg-gradient-to-br from-orange-500/10 to-transparent p-5">
                  <p className="text-sm uppercase tracking-[0.3em] text-orange-200">KOT #{latestKot.orderNumber}</p>
                  <p className="mt-3 text-2xl font-semibold text-white">
                    {latestKot.orderType}
                    {latestKot.tableNumber ? ` - ${latestKot.tableNumber}` : ''}
                  </p>
                  <div className="mt-5 space-y-3">
                    {latestKot.items.map((item, index) => (
                      <div key={`${item.name}-${index}`} className="flex items-center justify-between border-b border-white/10 pb-3">
                        <p className="font-medium text-white">{item.name}</p>
                        <p className="text-xl font-semibold text-orange-200">{item.quantity}x</p>
                      </div>
                    ))}
                  </div>
                  {latestKot.notes ? (
                    <div className="mt-4 rounded-2xl bg-black/20 p-3 text-sm text-slate-300">
                      <p className="mb-1 uppercase tracking-[0.25em] text-slate-400">Special Notes</p>
                      <p>{latestKot.notes}</p>
                    </div>
                  ) : null}
                  <p className="mt-4 text-sm text-slate-400">{new Date(latestKot.createdAt).toLocaleString()}</p>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 px-4 py-10 text-center text-slate-400">
                  Place an order to see the latest KOT here.
                </div>
              )}
            </Panel>

            <Panel title="" subtitle="">
              <ul className="space-y-3 text-sm text-slate-300">
              </ul>
            </Panel>
          </div>
        ) : null}

        {loading ? (
          <div className="fixed inset-x-0 bottom-4 mx-auto w-fit rounded-full border border-white/10 bg-slate-950/85 px-5 py-3 text-sm text-slate-200 shadow-2xl shadow-black/25">
            Loading POS data...
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default App
