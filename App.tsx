import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, ArrowDownToLine, Boxes, CircleUserRound, KeyRound, LogOut, Package, ShieldCheck, ShoppingBag, Wallet, Zap } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Product = { id: string; name: string; description: string | null; price_usd: number; duration_label: string | null; active: boolean }
type Profile = { id: string; email: string | null; role: 'owner' | 'reseller' | 'customer' }
type Notice = { type: 'ok' | 'error' | 'info'; text: string }

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('1.00')
  const [newDuration, setNewDuration] = useState('')
  const [stockText, setStockText] = useState('')
  const [balanceEmail, setBalanceEmail] = useState('')
  const [balanceAmount, setBalanceAmount] = useState('')

  async function loadProducts() {
    if (!supabase) return
    const { data, error } = await supabase.from('products').select('id,name,description,price_usd,duration_label,active').eq('active', true).order('created_at', { ascending: false })
    if (error) setNotice({ type: 'error', text: error.message })
    else setProducts((data ?? []) as Product[])
  }
  async function loadProfile(userId: string) {
    if (!supabase) return
    const { data, error } = await supabase.from('profiles').select('id,email,role').eq('id', userId).maybeSingle()
    if (error) setNotice({ type: 'error', text: error.message })
    setProfile((data as Profile | null) ?? null)
  }
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) void loadProfile(data.session.user.id)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next?.user) window.setTimeout(() => void loadProfile(next.user.id), 0)
      else setProfile(null)
    })
    void loadProducts()
    return () => listener.subscription.unsubscribe()
  }, [])

  async function authSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setNotice(null)
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (result.error) setNotice({ type: 'error', text: result.error.message })
    else if (mode === 'signup' && !result.data.session) setNotice({ type: 'ok', text: 'تم إنشاء الحساب. افحص بريدك لتأكيد التسجيل إن كان التأكيد مفعّلًا.' })
    else setNotice({ type: 'ok', text: mode === 'signup' ? 'تم إنشاء الحساب.' : 'تم تسجيل الدخول.' })
  }
  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null); setProfile(null); setNotice({ type: 'info', text: 'تم تسجيل الخروج.' })
  }
  async function buy(productId: string) {
    if (!supabase || !session) { setNotice({ type: 'info', text: 'سجّل الدخول أولًا لإتمام الشراء.' }); return }
    setBusy(true); setNotice(null)
    const { data, error } = await supabase.rpc('purchase_product', { p_product_id: productId })
    setBusy(false)
    if (error) setNotice({ type: 'error', text: error.message })
    else {
      const result = Array.isArray(data) ? data[0] : data
      setNotice({ type: 'ok', text: `تم الشراء. رقم الطلب: ${result?.order_id ?? '—'}${result?.delivered_code ? ` — الكود: ${result.delivered_code}` : ''}` })
    }
  }
  async function createProduct(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    const price = Number(newPrice)
    if (!newName.trim() || !Number.isFinite(price) || price < 0) { setNotice({ type: 'error', text: 'راجع اسم المنتج والسعر.' }); return }
    setBusy(true)
    const { error } = await supabase.from('products').insert({ name: newName.trim(), price_usd: price, duration_label: newDuration.trim() || null })
    setBusy(false)
    if (error) setNotice({ type: 'error', text: error.message })
    else { setNewName(''); setNewDuration(''); setNotice({ type: 'ok', text: 'تمت إضافة المنتج.' }); await loadProducts() }
  }
  async function addStock(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    const codes = stockText.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
    if (!newName.trim() || codes.length === 0) { setNotice({ type: 'error', text: 'اكتب معرّف المنتج في حقل اسم المنتج، ثم الأكواد كل كود في سطر.' }); return }
    const { data: product, error: pErr } = await supabase.from('products').select('id').eq('name', newName.trim()).maybeSingle()
    if (pErr || !product) { setNotice({ type: 'error', text: 'لم أجد منتجًا بهذا الاسم. أضفه أولًا.' }); return }
    setBusy(true)
    const { error } = await supabase.from('code_inventory').insert(codes.map(code => ({ product_id: product.id, code_value: code })))
    setBusy(false)
    if (error) setNotice({ type: 'error', text: error.message })
    else { setStockText(''); setNotice({ type: 'ok', text: `تمت إضافة ${codes.length} كود للمخزون.` }) }
  }
  async function addBalance(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    const amount = Number(balanceAmount)
    if (!balanceEmail.trim() || !Number.isFinite(amount) || amount <= 0) { setNotice({ type: 'error', text: 'أدخل البريد والمبلغ الصحيح.' }); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('owner_adjust_balance', { p_user_email: balanceEmail.trim(), p_amount: amount, p_note: 'إضافة رصيد من لوحة المالك' })
    setBusy(false)
    if (error) setNotice({ type: 'error', text: error.message })
    else { setNotice({ type: 'ok', text: `تم تحديث الرصيد. مرجع العملية: ${data ?? 'تم'}` }); setBalanceAmount('') }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Zap size={25}/></div><div><strong>FOX VIP</strong><small>المتجر الرقمي</small></div></div>
      <div className="side-label">القائمة الرئيسية</div>
      <a className="side-link active"><ShoppingBag size={18}/> المتجر</a>
      <a className="side-link"><KeyRound size={18}/> مفاتيحي وطلباتي</a>
      <a className="side-link"><Wallet size={18}/> المحفظة</a>
      <a className="side-link"><Activity size={18}/> سجل العمليات</a>
      {profile?.role === 'owner' && <><div className="side-label">الإدارة</div><a className="side-link"><ShieldCheck size={18}/> لوحة المالك</a><a className="side-link"><Boxes size={18}/> مخزون الأكواد</a></>}
      <div className="sidebar-bottom"><span className="online-dot"/> واجهة عربية • RTL</div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="eyebrow">DIGITAL PRODUCTS</span><h1>متجر FOX VIP</h1></div><div className="top-actions">{session ? <><span className="user-pill"><CircleUserRound size={18}/>{profile?.email ?? session.user.email}</span><button className="btn btn-ghost" onClick={signOut}><LogOut size={16}/> خروج</button></> : <span className="user-pill"><CircleUserRound size={18}/> زائر</span>}</div></header>
      <section className="hero"><div className="hero-content"><span className="hero-tag"><Zap size={14}/> سريع • آمن • رقمي</span><h2>كل احتياجاتك الرقمية<br/><em>في مكان واحد</em></h2><p>تصفح المنتجات، اشترِ بأمان، واستلم الأكواد الرقمية بعد نجاح عملية الشراء.</p><a href="#products" className="btn btn-primary">تصفح المنتجات <ArrowDownToLine size={17}/></a></div><div className="hero-orb"><div className="orb-inner"><Package size={56}/><span>FOX</span></div></div></section>
      {!isSupabaseConfigured && <div className="notice info"><strong>وضع المعاينة:</strong> اربط المشروع بـ Supabase عبر ملف <code>.env.local</code> لتفعيل الحسابات والشراء. لا توجد بيانات حقيقية في هذه المعاينة.</div>}
      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}
      {!session && <section className="panel auth-panel"><div className="section-head"><div><span className="eyebrow">ACCOUNT</span><h2>{mode === 'signin' ? 'تسجيل الدخول' : 'إنشاء حساب'}</h2></div><CircleUserRound className="section-icon"/></div><form onSubmit={authSubmit} className="auth-form"><label>البريد الإلكتروني<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com"/></label><label>كلمة المرور<input type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} placeholder="8 أحرف على الأقل"/></label><button disabled={busy || !isSupabaseConfigured} className="btn btn-primary full" type="submit">{busy ? 'جارٍ التنفيذ…' : mode === 'signin' ? 'دخول آمن' : 'إنشاء حساب'}</button></form><button className="text-button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'ليس لديك حساب؟ أنشئ حسابًا' : 'لديك حساب؟ سجّل الدخول'}</button></section>}
      <section id="products" className="products-section"><div className="section-head"><div><span className="eyebrow">STORE CATALOG</span><h2>المنتجات والعروض</h2></div><span className="count-pill">{products.length} منتج</span></div>{products.length === 0 ? <div className="empty-state"><Package size={35}/><strong>لا توجد منتجات منشورة حتى الآن</strong><span>بعد ربط قاعدة البيانات، أضف منتجاتك من لوحة المالك.</span></div> : <div className="product-grid">{products.map(p => <article className="product-card" key={p.id}><div className="product-art"><Package size={32}/><span>FOX VIP</span></div><div className="product-body"><h3>{p.name}</h3><p>{p.description || 'منتج رقمي — تسليم إلكتروني'}</p><div className="product-meta"><strong>${Number(p.price_usd).toFixed(2)}</strong><span>{p.duration_label || 'مدة حسب المنتج'}</span></div><button className="btn btn-primary full" disabled={busy} onClick={() => void buy(p.id)}><ShoppingBag size={16}/> شراء وتسليم الكود</button></div></article>)}</div>}</section>
      {profile?.role === 'owner' && <section className="panel admin-panel"><div className="section-head"><div><span className="eyebrow">OWNER CONTROL</span><h2>لوحة المالك</h2></div><ShieldCheck className="section-icon"/></div><div className="admin-grid"><form onSubmit={createProduct} className="admin-form"><h3>إضافة منتج</h3><label>اسم المنتج<input required value={newName} onChange={e => setNewName(e.target.value)} placeholder="مثال: باقة أسبوعية"/></label><label>السعر بالدولار<input required type="number" min="0" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)}/></label><label>مدة الصلاحية<input value={newDuration} onChange={e => setNewDuration(e.target.value)} placeholder="مثال: 7 أيام"/></label><button className="btn btn-primary full" disabled={busy}>إضافة المنتج</button></form><form onSubmit={addStock} className="admin-form"><h3>إضافة أكواد للمخزون</h3><label>اسم المنتج الموجود<input required value={newName} onChange={e => setNewName(e.target.value)} placeholder="اكتب اسم المنتج المطابق"/></label><label>الأكواد — كود في كل سطر<textarea required rows={5} value={stockText} onChange={e => setStockText(e.target.value)} placeholder={'CODE-001\\nCODE-002'}/></label><button className="btn btn-secondary full" disabled={busy}>إضافة الأكواد</button><small>تأكد من صلاحيتك في تخزين هذه الأكواد وتوزيعها.</small></form><form onSubmit={addBalance} className="admin-form"><h3>إضافة رصيد لمستخدم</h3><label>بريد المستخدم<input required type="email" value={balanceEmail} onChange={e => setBalanceEmail(e.target.value)} placeholder="user@example.com"/></label><label>المبلغ بالدولار<input required type="number" min="0.01" step="0.01" value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)} placeholder="5.00"/></label><button className="btn btn-secondary full" disabled={busy}>إضافة الرصيد</button></form></div><p className="admin-warning">لا تعيّن دور المالك من الواجهة. أنشئ حسابك أولًا، ثم عيّن الدور owner يدويًا من SQL Editor في Supabase حسب ملف SETUP_AR.md.</p></section>}
      {session && profile?.role !== 'owner' && <div className="notice info">نوع الحساب الحالي: {profile?.role === 'reseller' ? 'موزع' : 'عميل'}. لوحة المالك لا تظهر إلا للحساب الذي منحه المالك الصلاحية يدويًا.</div>}
      <footer><div className="brand-mini"><Zap size={16}/> FOX VIP</div><span>واجهة تجريبية مستقلة • USD</span><span>© {new Date().getFullYear()} FOX VIP</span></footer>
    </main>
  </div>
}